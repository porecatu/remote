// SPDX-License-Identifier: GPL-3.0-or-later

// The connection life of one desktop (docs/arquitetura.md §2, PRD-002 RF-2.1 to
// RF-2.5): idle -> connecting -> handshaking -> greeting -> ready, with
// reconnecting / failed / closed as the ways out.
//
// It drives the relay socket (`openRelaySocket`) and the protocol session
// (`ClientSession.connect`), both injected, and owns nothing else: what the
// host says (workspace, grid...) goes out through `onMessage`, and the state
// the UI reads goes out through `onChange`. Time (`Clock`) and timers
// (`Scheduler`) come from outside. Nothing here logs or keeps message content.
//
// Choices where the documents are silent:
// - A drop before the desktop ever reached `ready` in this lifecycle is
//   `failed` ("unreachable"), with no automatic retry: the user retries by
//   hand (PRD-001 RF-1.14). After the first `ready`, a drop retries on the
//   backoff schedule (1, 2, 4, 8, 16 s) and ends in `failed` when it runs out.
// - `host-unavailable` is `closed` ("offline") on the first connection and a
//   failed attempt (so, a retry) once the desktop was reached before: the
//   relay answers it while the desktop restarts.
// - The backoff counter goes back to zero when the `welcome` arrives.
// - An `error { protocol }` from the host ends the session for good: it would
//   fail again the same way.

import { logEvent } from "@/log";
import {
  type RelaySocket,
  type RelaySocketHandlers,
  clientUrl,
} from "@/net/relaySocket";
import {
  type BackoffState,
  BACKOFF_DELAYS_MS,
  beginAttempt as markAttemptStart,
  resetBackoff,
  retryDelay,
  scheduleRetry,
} from "@/net/backoff";
import {
  ClientError,
  ClientSession,
  ErrorCode,
  type ClientEvent,
  type ClientStart,
  GoodbyeReason,
  PROTOCOL_VERSION,
  type Message,
  type RandomSource,
  type StaticKeypair,
  type Version,
  base64UrlDecode,
  hexEncode,
} from "@/protocol";
import type { Clock, Scheduler } from "./clock";

/** How long the app may stay in the background before the session is closed (arquitetura §2). */
export const BACKGROUND_CLOSE_MS = 30_000;

export const APP_NAME = "porecatu-remote";

export type LifecycleState =
  | "idle"
  | "connecting"
  | "handshaking"
  | "greeting"
  | "ready"
  | "reconnecting"
  | "failed"
  | "closed";

/** Why a session ended. Codes, never prose: the UI picks the text. */
export type EndReason =
  // closed
  | "user"
  | "background"
  | "offline"
  | "incompatible"
  | "not-paired"
  | "revoked"
  | "remote-disabled"
  | "host-quitting"
  | "goodbye"
  // failed
  | "unreachable"
  | "retries-exhausted"
  | "invalid-desktop"
  | "protocol";

export interface EndInfo {
  readonly reason: EndReason;
  /** The lower layer's code (`handshake:decrypt`, `unreachable:1006`...); null when there is none. */
  readonly code: string | null;
  /** The version the host speaks, for `incompatible` only. */
  readonly hostVersion: Version | null;
}

export interface WelcomeInfo {
  readonly hostName: string;
  readonly porecatuVersion: string;
  readonly maxSubscriptions: number;
  /** Lowercase hex of the 16 bytes of `host_instance`. */
  readonly hostInstance: string;
  /** True when it differs from the previous connection of this lifecycle: every stored id is void. */
  readonly instanceChanged: boolean;
}

export interface LifecycleSnapshot {
  readonly state: LifecycleState;
  /** Automatic attempts used since the last `welcome`; above 0 means "reconnecting" to the user. */
  readonly attempt: number;
  /** When the pending retry is due (`state === "reconnecting"`), else null. */
  readonly retryAt: number | null;
  /** Set in `closed` and `failed`. */
  readonly end: EndInfo | null;
  /** The last `welcome` of this lifecycle, kept across reconnections. */
  readonly welcome: WelcomeInfo | null;
}

export const MAX_AUTOMATIC_ATTEMPTS = BACKOFF_DELAYS_MS.length;

export const IDLE_SNAPSHOT: LifecycleSnapshot = {
  state: "idle",
  attempt: 0,
  retryAt: null,
  end: null,
  welcome: null,
};

/** True while there is a session the app is waiting on or using. */
export function isLiveState(state: LifecycleState): boolean {
  return state === "greeting" || state === "ready";
}

/** The user should see "reconnecting": a retry is pending or running. */
export function isReconnecting(snapshot: LifecycleSnapshot): boolean {
  return (
    snapshot.state === "reconnecting" ||
    (snapshot.attempt > 0 &&
      (snapshot.state === "connecting" ||
        snapshot.state === "handshaking" ||
        snapshot.state === "greeting"))
  );
}

export type OpenSocket = (url: string, handlers: RelaySocketHandlers) => RelaySocket | null;

export type ConnectSession = (
  hostId: string,
  hostKey: Uint8Array,
  device: StaticKeypair,
  nowMs: number,
  options?: { readonly random?: RandomSource },
) => ClientStart;

export interface LifecycleDesktop {
  readonly relayUrl: string;
  readonly hostId: string;
  /** base64url, 43 characters. */
  readonly hostKeyB64: string;
}

export interface LifecycleDeps {
  readonly desktop: LifecycleDesktop;
  readonly device: StaticKeypair;
  readonly appVersion: string;
  readonly openSocket: OpenSocket;
  /** Defaults to `ClientSession.connect`. */
  readonly connect?: ConnectSession;
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  readonly random?: RandomSource;
}

export interface LifecycleHandlers {
  /** Every change of the snapshot, with the one before it. */
  onChange(next: LifecycleSnapshot, previous: LifecycleSnapshot): void;
  /** The `welcome` arrived, before the messages that follow it. */
  onWelcome(info: WelcomeInfo): void;
  /** Every host message after the `welcome` except `welcome`, `incompatible`, `goodbye` and `error { not-paired | protocol }`. */
  onMessage(message: Message): void;
}

export interface Lifecycle {
  snapshot(): LifecycleSnapshot;
  /** Connects from `idle`, `closed` or `failed`, with a fresh backoff. Elsewhere it does nothing. */
  start(): void;
  /** The user leaves: says goodbye when it can and ends in `closed` ("user"). */
  close(): void;
  /** False unless the session is `ready`. Never logs the message. */
  send(message: Message): boolean;
  /** The app found a protocol violation (a `seq` gap): tells the host, ends in `failed` ("protocol"). */
  abort(code: string): void;
  /** Starts the 30 s countdown that closes the session (arquitetura §2). */
  enterBackground(): void;
  /** Cancels the countdown; reconnects a session closed by it, or a pending retry, right away. */
  enterForeground(): void;
}

interface Attempt {
  readonly session: ClientSession;
  socket: RelaySocket | null;
  /** The socket opened before `openSocket` returned (a synchronous implementation). */
  openedEarly: boolean;
  opened: boolean;
  startFrames: Uint8Array[];
  handshakeDone: boolean;
  welcomed: boolean;
  gotTheme: boolean;
  gotProfiles: boolean;
  gotWorkspace: boolean;
  /** The last message is on its way out: whatever the host answers to it no longer matters. */
  closing: boolean;
}

const MAX_CODE_LENGTH = 64;

function clipCode(code: string): string {
  return code.length <= MAX_CODE_LENGTH ? code : code.slice(0, MAX_CODE_LENGTH);
}

function clientErrorCode(error: ClientError): string {
  return clipCode(error.detail === undefined ? error.code : `${error.code}:${error.detail}`);
}

function endFields(end: EndInfo): Record<string, string> {
  return end.code === null ? { reason: end.reason } : { reason: end.reason, code: end.code };
}

export function createLifecycle(deps: LifecycleDeps, handlers: LifecycleHandlers): Lifecycle {
  const { desktop, device, clock, scheduler } = deps;
  const connect: ConnectSession =
    deps.connect ?? ((hostId, hostKey, keypair, nowMs, options) =>
      ClientSession.connect(hostId, hostKey, keypair, nowMs, options));
  const sessionOptions = deps.random === undefined ? {} : { random: deps.random };

  let snapshot: LifecycleSnapshot = IDLE_SNAPSHOT;
  let backoff: BackoffState = resetBackoff();
  let attempt: Attempt | null = null;
  /** Reached `ready` at least once: drops are retried instead of reported. */
  let everReady = false;
  let lastInstance: string | null = null;
  let retryTimer: unknown = null;
  let deadlineTimer: unknown = null;
  let backgroundTimer: unknown = null;

  function update(patch: Partial<LifecycleSnapshot>): void {
    const previous = snapshot;
    snapshot = { ...previous, ...patch };
    handlers.onChange(snapshot, previous);
  }

  function clearTimer(handle: unknown): null {
    if (handle !== null) {
      scheduler.clear(handle);
    }
    return null;
  }

  function cleanupAttempt(): void {
    deadlineTimer = clearTimer(deadlineTimer);
    const current = attempt;
    attempt = null;
    if (current === null) {
      return;
    }
    current.session.close();
    current.socket?.close();
  }

  /** Ends the session for good (`closed` or `failed`). */
  function finish(state: "closed" | "failed", end: EndInfo): void {
    cleanupAttempt();
    retryTimer = clearTimer(retryTimer);
    backgroundTimer = clearTimer(backgroundTimer);
    update({ state, end, retryAt: null });
    logEvent("session_closed", endFields(end));
  }

  function fail(reason: EndReason, code: string | null): void {
    finish("failed", { reason, code, hostVersion: null });
  }

  function sendFrames(current: Attempt, frames: readonly Uint8Array[]): boolean {
    const socket = current.socket;
    if (socket === null || !current.opened) {
      return false;
    }
    try {
      for (const frame of frames) {
        if (!socket.send(frame)) {
          return false;
        }
      }
    } catch (error) {
      if (error instanceof RangeError) {
        return false;
      }
      throw error;
    }
    return true;
  }

  function sendMessage(current: Attempt, message: Message): boolean {
    let frames: Uint8Array[];
    try {
      frames = current.session.send(message, clock.now());
    } catch (error) {
      if (error instanceof ClientError) {
        if (error.code === "record") {
          logEvent("protocol_error", { code: clientErrorCode(error) });
          fail("protocol", clientErrorCode(error));
        }
        return false;
      }
      throw error;
    }
    return sendFrames(current, frames);
  }

  /** The last message of a session, sent before it is ended on purpose. */
  function sendFinal(current: Attempt, message: Message): boolean {
    current.closing = true;
    return sendMessage(current, message);
  }

  /** An unexpected loss of the connection: retry on the schedule, or report it. */
  function drop(reason: string): void {
    cleanupAttempt();
    logEvent("relay_dropped", { reason });
    if (!everReady) {
      fail("unreachable", clipCode(`unreachable:${reason}`));
      return;
    }
    backoff = scheduleRetry(backoff, clock.now());
    if (backoff.exhausted) {
      fail("retries-exhausted", null);
      return;
    }
    const delay = retryDelay(backoff, clock.now()) ?? 0;
    update({ state: "reconnecting", attempt: backoff.attempts, retryAt: backoff.dueAt, end: null });
    logEvent("relay_retry_scheduled", { attempt: backoff.attempts, delayMs: delay });
    retryTimer = scheduler.set(runRetry, delay);
  }

  function runRetry(): void {
    retryTimer = null;
    if (snapshot.state !== "reconnecting") {
      return;
    }
    backoff = markAttemptStart(backoff);
    openAttempt();
  }

  function armDeadline(current: Attempt): void {
    deadlineTimer = clearTimer(deadlineTimer);
    const deadline = current.session.nextDeadline();
    if (deadline === null) {
      return;
    }
    deadlineTimer = scheduler.set(() => {
      deadlineTimer = null;
      if (attempt !== current) {
        return;
      }
      processEvents(current, current.session.tick(clock.now()));
      if (attempt === current && current.session.isHandshaking) {
        armDeadline(current);
      }
    }, Math.max(0, deadline - clock.now()));
  }

  function openAttempt(): void {
    retryTimer = clearTimer(retryTimer);
    cleanupAttempt();
    const hostKey = base64UrlDecode(desktop.hostKeyB64);
    const url = clientUrl(desktop.relayUrl, desktop.hostId);
    if (url === null) {
      fail("invalid-desktop", "relay-url");
      return;
    }
    if (hostKey === null || hostKey.length !== 32) {
      fail("invalid-desktop", "host-key");
      return;
    }
    let started: ClientStart;
    try {
      started = connect(desktop.hostId, hostKey, device, clock.now(), sessionOptions);
    } catch (error) {
      if (error instanceof ClientError) {
        fail("protocol", clientErrorCode(error));
        return;
      }
      throw error;
    }
    const current: Attempt = {
      session: started.session,
      socket: null,
      openedEarly: false,
      opened: false,
      startFrames: started.frames,
      handshakeDone: false,
      welcomed: false,
      gotTheme: false,
      gotProfiles: false,
      gotWorkspace: false,
      closing: false,
    };
    attempt = current;
    update({ state: "connecting", attempt: backoff.attempts, retryAt: null, end: null });
    logEvent("relay_connecting", { attempt: backoff.attempts });
    armDeadline(current);
    const socket = deps.openSocket(url, {
      onOpen: () => {
        onOpen(current);
      },
      onFrame: (frame) => {
        onFrame(current, frame);
      },
      onClose: (info) => {
        if (attempt === current && !current.closing && !info.local) {
          drop(`closed:${info.code}`);
        }
      },
    });
    if (socket === null) {
      fail("invalid-desktop", "relay-url");
      return;
    }
    if (attempt !== current) {
      // The handlers already ended this attempt while `openSocket` ran.
      socket.close();
      return;
    }
    current.socket = socket;
    if (current.openedEarly) {
      onOpen(current);
    }
  }

  function onOpen(current: Attempt): void {
    if (attempt !== current || current.opened) {
      return;
    }
    if (current.socket === null) {
      current.openedEarly = true;
      return;
    }
    current.opened = true;
    update({ state: "handshaking" });
    logEvent("relay_connected");
    const frames = current.startFrames;
    current.startFrames = [];
    if (!sendFrames(current, frames)) {
      drop("send");
    }
  }

  function onFrame(current: Attempt, frame: Uint8Array): void {
    if (attempt !== current || !current.opened || current.closing) {
      return;
    }
    let events: ClientEvent[];
    try {
      events = current.session.receive(frame, clock.now());
    } catch (error) {
      if (error instanceof ClientError) {
        return;
      }
      throw error;
    }
    processEvents(current, events);
  }

  function processEvents(current: Attempt, events: readonly ClientEvent[]): void {
    for (const event of events) {
      if (attempt !== current) {
        return;
      }
      switch (event.type) {
        case "send":
          if (!sendFrames(current, [event.frame])) {
            drop("send");
          }
          break;
        case "handshake-complete":
          current.handshakeDone = true;
          deadlineTimer = clearTimer(deadlineTimer);
          update({ state: "greeting" });
          logEvent("handshake_ok");
          sendMessage(current, {
            type: "hello",
            version: PROTOCOL_VERSION,
            app: APP_NAME,
            appVersion: deps.appVersion,
          });
          break;
        case "message":
          onHostMessage(current, event.message);
          break;
        case "host-unavailable":
          if (everReady) {
            drop("host-unavailable");
          } else {
            finish("closed", { reason: "offline", code: null, hostVersion: null });
          }
          break;
        case "closed":
          drop(`relay-closed:${event.reason}`);
          break;
        case "failed": {
          const error = event.error;
          if (error.code === "timeout") {
            drop("handshake-timeout");
            break;
          }
          const code = clientErrorCode(error);
          logEvent(current.handshakeDone ? "protocol_error" : "handshake_failed", { code });
          fail("protocol", code);
          break;
        }
      }
    }
  }

  function protocolViolation(code: string): void {
    const current = attempt;
    logEvent("protocol_error", { code });
    if (current !== null) {
      sendFinal(current, { type: "error", code: ErrorCode.protocol });
    }
    fail("protocol", code);
  }

  function onHostMessage(current: Attempt, message: Message): void {
    switch (message.type) {
      case "welcome": {
        if (current.welcomed) {
          protocolViolation("order");
          return;
        }
        current.welcomed = true;
        const key = hexEncode(message.hostInstance);
        const instanceChanged = lastInstance !== null && lastInstance !== key;
        lastInstance = key;
        if (instanceChanged) {
          logEvent("host_instance_changed");
        }
        const info: WelcomeInfo = {
          hostName: message.hostName,
          porecatuVersion: message.porecatuVersion,
          maxSubscriptions: message.maxSubscriptions,
          hostInstance: key,
          instanceChanged,
        };
        backoff = resetBackoff();
        handlers.onWelcome(info);
        update({ welcome: info, attempt: 0 });
        return;
      }
      case "incompatible":
        if (current.welcomed) {
          protocolViolation("order");
          return;
        }
        finish("closed", { reason: "incompatible", code: null, hostVersion: message.version });
        return;
      case "goodbye":
        finish("closed", { reason: goodbyeReason(message.reason), code: null, hostVersion: null });
        return;
      case "error":
        if (message.code === ErrorCode.notPaired) {
          finish("closed", { reason: "not-paired", code: null, hostVersion: null });
          return;
        }
        if (message.code === ErrorCode.protocol) {
          logEvent("protocol_error", { code: "remote" });
          fail("protocol", "remote");
          return;
        }
        break;
      default:
        break;
    }
    if (!current.welcomed) {
      protocolViolation("order");
      return;
    }
    handlers.onMessage(message);
    if (attempt !== current) {
      return;
    }
    if (message.type === "theme") {
      current.gotTheme = true;
    } else if (message.type === "profiles") {
      current.gotProfiles = true;
    } else if (message.type === "workspace") {
      current.gotWorkspace = true;
    }
    if (
      snapshot.state === "greeting" &&
      current.gotTheme &&
      current.gotProfiles &&
      current.gotWorkspace
    ) {
      everReady = true;
      update({ state: "ready" });
      logEvent("session_ready");
    }
  }

  function closeSession(reason: "user" | "background"): void {
    const state = snapshot.state;
    if (state === "idle" || state === "closed" || state === "failed") {
      backgroundTimer = clearTimer(backgroundTimer);
      return;
    }
    const current = attempt;
    if (current !== null && state === "ready") {
      sendFinal(current, { type: "goodbye", reason: GoodbyeReason.normal });
      if (snapshot.state !== "ready") {
        return;
      }
    }
    finish("closed", { reason, code: null, hostVersion: null });
  }

  return {
    snapshot: () => snapshot,

    start(): void {
      const state = snapshot.state;
      if (state !== "idle" && state !== "closed" && state !== "failed") {
        return;
      }
      backoff = resetBackoff();
      openAttempt();
    },

    close(): void {
      closeSession("user");
    },

    send(message: Message): boolean {
      const current = attempt;
      if (snapshot.state !== "ready" || current === null) {
        return false;
      }
      return sendMessage(current, message);
    },

    abort(code: string): void {
      const state = snapshot.state;
      if (state === "idle" || state === "closed" || state === "failed") {
        return;
      }
      const current = attempt;
      logEvent("protocol_error", { code: clipCode(code) });
      if (current !== null && isLiveState(state)) {
        sendFinal(current, { type: "error", code: ErrorCode.protocol });
      }
      if (snapshot.state === "failed") {
        return;
      }
      fail("protocol", clipCode(code));
    },

    enterBackground(): void {
      const state = snapshot.state;
      if (backgroundTimer !== null || state === "idle" || state === "closed" || state === "failed") {
        return;
      }
      backgroundTimer = scheduler.set(() => {
        backgroundTimer = null;
        logEvent("session_background_closed");
        closeSession("background");
      }, BACKGROUND_CLOSE_MS);
    },

    enterForeground(): void {
      backgroundTimer = clearTimer(backgroundTimer);
      if (snapshot.state === "closed" && snapshot.end?.reason === "background") {
        backoff = resetBackoff();
        openAttempt();
        return;
      }
      if (snapshot.state === "reconnecting") {
        retryTimer = clearTimer(retryTimer);
        backoff = markAttemptStart(backoff);
        openAttempt();
      }
    },
  };
}

function goodbyeReason(reason: number): EndReason {
  switch (reason) {
    case GoodbyeReason.remoteDisabled:
      return "remote-disabled";
    case GoodbyeReason.revoked:
      return "revoked";
    case GoodbyeReason.hostQuitting:
      return "host-quitting";
    default:
      return "goodbye";
  }
}
