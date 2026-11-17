// SPDX-License-Identifier: GPL-3.0-or-later

// The controller of the pairing (PRD-001 RF-1.4 to RF-1.11; spec 02 §3): it
// runs the effects of the pure flow (`src/pairing/pairingFlow.ts`) — opens the
// relay socket, writes and closes it, drives the deadlines with `tick`, saves
// the desktop — and, once paired, remembers the device name (RF-1.2) and hands
// the open session to the session registry, which says `hello` on it
// (RF-1.10, same session). Pure: no React; the pairing screens read `store` and
// call the actions.
//
// Rules this file keeps:
// - every socket belongs to one attempt; events of a socket the flow already
//   closed or left are dropped, so a late close of an old attempt never fails
//   the next one;
// - the socket's events go through a switchable set (`createSwitchableHandlers`)
//   and are held (no target) in the same turn the flow reaches `paired`, so the
//   session lifecycle receives every frame that comes after `pair-accepted`;
// - when the channel ended before the save finished (`sessionEnded`), the
//   desktop is opened the normal way (`registry.open`);
// - a pairing that completes after `dispose()` (the save was in flight) keeps
//   the desktop and the name, but closes the session instead of opening a
//   store nobody is looking at;
// - nothing about the pairing is logged but event names and codes: never the
//   URI, the token, a key, the device name or the desktop name.

import { type StoreApi, createStore } from "zustand/vanilla";
import { type EventFields, type EventName, logEvent } from "@/log";
import type { RelaySocket, RelaySocketHandlers } from "@/net/relaySocket";
import { type SwitchableHandlers, createSwitchableHandlers } from "@/net/socketHandoff";
import {
  type NameError,
  type PairingContext,
  type PairingEffect,
  type PairingEvent,
  type PairingFailure,
  type PairingState,
  createPairingState,
  isPairingActive,
  nextPairingDeadline,
  reducePairing,
  savePairedDesktop,
} from "@/pairing/pairingFlow";
import type { Platform, RandomSource, StaticKeypair } from "@/protocol";
import type { Clock, Scheduler } from "@/session/clock";
import type { OpenSocket } from "@/session/lifecycle";
import type { SessionRegistry } from "@/session/registry";
import type { DesktopRepository } from "@/storage/desktopList";
import { deviceFingerprint } from "@/storage/deviceIdentity";

// ----------------------------------------------------------------- types

export interface PairingControllerState {
  /** The state of the pairing flow, as the reducer left it. */
  readonly flow: PairingState;
  /** `flow.step`, for the screens to switch on. */
  readonly step: PairingState["step"];
  /** True while a socket or a session may be open (show progress, not a result). */
  readonly active: boolean;
  /**
   * The desktop name: the one from the QR until `pair-accepted`, then the one
   * saved. Null before a URI was read and after a failure.
   */
  readonly hostName: string | null;
  /** The fingerprint of this device's key, as the desktop shows it (RF-1.9). */
  readonly deviceFingerprint: string;
  /** The name pre-filled in the name step (`naming`), else null. */
  readonly suggestedName: string | null;
  /** Why the last name was refused (`naming`), else null. */
  readonly nameError: NameError | null;
  /** The device name sent to the desktop, from `connecting` on; null before. */
  readonly deviceName: string | null;
  /**
   * Whole seconds left in the desktop's 120 s wait (`awaiting-confirmation`),
   * rounded up and never below 0; null in every other step.
   */
  readonly confirmSecondsLeft: number | null;
  /** Why the pairing failed (`failed`), else null. */
  readonly failure: PairingFailure | null;
  /** The local id of the desktop just paired (`paired`): the screen opens its workspace. */
  readonly pairedDesktopId: string | null;
  /** True when the pairing replaced a desktop already in the list (`paired`). */
  readonly replaced: boolean;
}

export interface PairingControllerDeps {
  /** The device key pair (`deviceIdentity.ensure`). */
  readonly device: StaticKeypair;
  readonly platform: Platform;
  /** The stored `deviceName` or, when there is none, the phone model (the caller decides). */
  readonly defaultDeviceName?: string;
  /** Same shape as the session lifecycle's (`openRelaySocket` with the WebSocket bound). */
  readonly openSocket: OpenSocket;
  readonly repository: Pick<DesktopRepository, "add">;
  readonly registry: Pick<SessionRegistry, "open" | "openPaired">;
  /** Persists the device name of the completed pairing (`updateSettings(store, { deviceName })`). */
  readonly rememberName: (name: string) => Promise<void>;
  /** Monotonic time for the flow's deadlines. */
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  /** Wall clock (ISO 8601 UTC) for `pairedAt`; defaults to `clock.iso`. */
  readonly nowIso?: () => string;
  /** Source of the ephemeral key; defaults to `globalThis.crypto`. Tests only. */
  readonly random?: RandomSource;
  readonly log?: (name: EventName, fields?: EventFields) => void;
}

export interface PairingController {
  readonly store: StoreApi<PairingControllerState>;
  /** A pairing URI from the camera or a deep link; starts over from any state but `saving`. */
  readUri(uri: string): void;
  /** The user confirmed the device name (name step). */
  submitName(name: string): void;
  /** The user left the flow: closes the socket, saves nothing (ignored while saving). */
  cancel(): void;
  /** Cancels what is running and stops every timer. Actions do nothing afterwards. */
  dispose(): void;
}

// ----------------------------------------------------------------- derived state

function hostNameOf(state: PairingState): string | null {
  switch (state.step) {
    case "naming":
    case "connecting":
      return state.invite.hostName;
    case "handshaking":
    case "awaiting-confirmation":
      return state.target.hostName;
    case "saving":
      return state.hostName;
    case "paired":
      return state.desktop.name;
    case "idle":
    case "failed":
      return null;
  }
}

function deviceNameOf(state: PairingState): string | null {
  switch (state.step) {
    case "connecting":
    case "handshaking":
    case "awaiting-confirmation":
    case "saving":
      return state.deviceName;
    default:
      return null;
  }
}

function secondsLeft(state: PairingState, now: number): number | null {
  if (state.step !== "awaiting-confirmation") {
    return null;
  }
  return Math.max(0, Math.ceil((state.confirmEndsAt - now) / 1000));
}

// ----------------------------------------------------------------- controller

interface Attempt {
  socket: RelaySocket | null;
  readonly switchable: SwitchableHandlers;
}

export function createPairingController(deps: PairingControllerDeps): PairingController {
  const { clock, scheduler } = deps;
  const log = deps.log ?? logEvent;
  const nowIso = deps.nowIso ?? (() => clock.iso());
  const context: PairingContext = {
    device: deps.device,
    platform: deps.platform,
    ...(deps.defaultDeviceName === undefined ? {} : { defaultDeviceName: deps.defaultDeviceName }),
    ...(deps.random === undefined ? {} : { random: deps.random }),
  };
  const fingerprint = deviceFingerprint(deps.device);

  let flow: PairingState = createPairingState();
  /** The device name of the attempt running, for `rememberName` once paired. */
  let attemptName: string | null = null;
  let pairedDesktopId: string | null = null;
  let replaced = false;
  let attempt: Attempt | null = null;
  let deadlineTimer: unknown = null;
  let countdownTimer: unknown = null;
  let disposed = false;

  const queue: PairingEvent[] = [];
  let running = false;

  function derive(): PairingControllerState {
    return {
      flow,
      step: flow.step,
      active: isPairingActive(flow),
      hostName: hostNameOf(flow),
      deviceFingerprint: fingerprint,
      suggestedName: flow.step === "naming" ? flow.suggestedName : null,
      nameError: flow.step === "naming" ? flow.nameError : null,
      deviceName: deviceNameOf(flow),
      confirmSecondsLeft: secondsLeft(flow, clock.now()),
      failure: flow.step === "failed" ? flow.failure : null,
      pairedDesktopId: flow.step === "paired" ? pairedDesktopId : null,
      replaced: flow.step === "paired" ? replaced : false,
    };
  }

  const store = createStore<PairingControllerState>()(() => derive());

  // ------------------------------------------------------------- timers

  function clearTimers(): void {
    if (deadlineTimer !== null) {
      scheduler.clear(deadlineTimer);
      deadlineTimer = null;
    }
    if (countdownTimer !== null) {
      scheduler.clear(countdownTimer);
      countdownTimer = null;
    }
  }

  /** Re-arms the flow's next deadline and the countdown of the confirmation wait. */
  function arm(): void {
    clearTimers();
    if (disposed) {
      return;
    }
    const now = clock.now();
    const deadline = nextPairingDeadline(flow);
    if (deadline !== null) {
      deadlineTimer = scheduler.set(() => {
        deadlineTimer = null;
        dispatch({ type: "tick", now: clock.now() });
      }, Math.max(0, deadline - now));
    }
    if (flow.step === "awaiting-confirmation") {
      const remaining = flow.confirmEndsAt - now;
      const seconds = Math.ceil(remaining / 1000);
      if (seconds > 0) {
        // The value drops by one when the remaining time reaches (seconds - 1) s.
        countdownTimer = scheduler.set(() => {
          countdownTimer = null;
          publish();
          arm();
        }, remaining - (seconds - 1) * 1000);
      }
    }
  }

  function publish(): void {
    store.setState(derive(), true);
  }

  // ------------------------------------------------------------- sockets

  function handlersFor(owner: () => Attempt | null): RelaySocketHandlers {
    const mine = (): boolean => attempt !== null && attempt === owner();
    return {
      onOpen: () => {
        if (mine()) {
          dispatch({ type: "socket-opened", now: clock.now() });
        }
      },
      onFrame: (frame) => {
        if (mine()) {
          dispatch({ type: "frame-received", frame, now: clock.now() });
        }
      },
      onClose: () => {
        if (mine()) {
          attempt = null;
          dispatch({ type: "socket-closed" });
        }
      },
    };
  }

  function openSocket(url: string): void {
    closeSocket();
    let self: Attempt | null = null;
    const switchable = createSwitchableHandlers(handlersFor(() => self));
    self = { socket: null, switchable };
    attempt = self;
    const socket = deps.openSocket(url, switchable.handlers);
    if (attempt !== self) {
      // The socket already closed while `openSocket` ran.
      socket?.close();
      return;
    }
    self.socket = socket;
    if (socket === null) {
      // The URL was refused: there is no connection to wait for.
      attempt = null;
      dispatch({ type: "socket-closed" });
    }
  }

  /** Closes the socket of the running attempt; its later events are dropped. */
  function closeSocket(): void {
    const current = attempt;
    attempt = null;
    current?.socket?.close();
  }

  // ------------------------------------------------------------- effects

  function run(effect: PairingEffect): void {
    switch (effect.type) {
      case "open-socket":
        openSocket(effect.url);
        return;
      case "send-frame":
        attempt?.socket?.send(effect.frame);
        return;
      case "close-socket":
        closeSocket();
        return;
      case "save-desktop":
        void savePairedDesktop(deps.repository, effect, nowIso()).then((outcome) => {
          dispatch(outcome);
        });
        return;
      case "log":
        if (effect.fields === undefined) {
          log(effect.name);
        } else {
          log(effect.name, effect.fields);
        }
        return;
    }
  }

  /** RF-1.10: remembers the name and hands the open channel to the session layer. */
  function completePairing(paired: Extract<PairingState, { step: "paired" }>): void {
    const current = attempt;
    attempt = null;
    // In the same turn: from now on the socket's events wait for the lifecycle.
    current?.switchable.setTarget(null);
    pairedDesktopId = paired.desktop.id;
    replaced = paired.replaced;

    const name = attemptName;
    attemptName = null;
    if (name !== null) {
      deps.rememberName(name).catch(() => {
        log("storage_invalid", { item: "settings.v1", reason: "write" });
      });
    }

    const socket = current?.socket ?? null;
    if (disposed) {
      paired.session.close();
      socket?.close();
      return;
    }
    if (paired.sessionEnded || socket === null || current === null) {
      paired.session.close();
      socket?.close();
      deps.registry.open(paired.desktop);
      return;
    }
    const switchable = current.switchable;
    deps.registry.openPaired(paired.desktop, {
      session: paired.session,
      socket,
      early: paired.early,
      redirect: (handlers) => {
        switchable.setTarget(handlers);
      },
    });
  }

  // ------------------------------------------------------------- dispatch

  function dispatch(event: PairingEvent): void {
    queue.push(event);
    if (running) {
      return;
    }
    running = true;
    try {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        const before = flow;
        const step = reducePairing(context, flow, next);
        flow = step.state;
        if (flow.step === "connecting") {
          attemptName = flow.deviceName;
        }
        for (const effect of step.effects) {
          run(effect);
        }
        if (flow.step === "paired" && before.step !== "paired") {
          completePairing(flow);
        }
      }
    } finally {
      running = false;
    }
    arm();
    publish();
  }

  return {
    store,
    readUri(uri) {
      if (!disposed) {
        dispatch({ type: "uri-read", uri });
      }
    },
    submitName(name) {
      if (!disposed) {
        dispatch({ type: "name-submitted", name, now: clock.now() });
      }
    },
    cancel() {
      if (!disposed) {
        dispatch({ type: "cancel" });
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      dispatch({ type: "cancel" });
      disposed = true;
      clearTimers();
    },
  };
}
