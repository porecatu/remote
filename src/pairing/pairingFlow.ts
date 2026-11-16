// SPDX-License-Identifier: GPL-3.0-or-later
import {
  ClientSession,
  HANDSHAKE_TIMEOUT_MS,
  base64UrlEncode,
  clampDeviceName,
  clientChannelUrl,
  fingerprint,
  formatFingerprint,
  parsePairingUri,
  type CloseReason as EnvelopeCloseReason,
  type PairRejectReason,
  type Message,
  type PairingInvite,
  type PairingUriError,
  type Platform,
  type RandomSource,
  type StaticKeypair,
  type ClientEvent,
} from "@/protocol";
import type { EventFields, EventName } from "../log";
import type { AddResult, Desktop, DesktopRepository, NewDesktop } from "../storage/desktopList";
import { copyKeypair } from "../storage/deviceIdentity";

// The pairing flow (PRD-001 RF-1.6 to RF-1.11; spec 02 §3). A pure state
// machine: `reducePairing(context, state, event)` returns the next state and a
// list of effects for the caller to run. It owns no socket, timer or storage:
//
//   - the caller opens the WebSocket (`open-socket`), writes the frames it is
//     told to (`send-frame`) and feeds back what comes in (`socket-opened`,
//     `frame-received`, `socket-closed`);
//   - the caller drives the clock with `tick` events, due at
//     `nextPairingDeadline(state)`; `now` is always a monotonic millisecond
//     clock handed in from outside;
//   - the caller persists the desktop (`save-desktop`, see `savePairedDesktop`)
//     and feeds the outcome back.
//
// Nothing here produces prose: states and failures are codes, and the screens
// turn them into catalog text. Nothing here logs content; the `log` effects
// carry event names and codes only. The pairing token and the device key never
// appear in an effect.

/** RF-1.9: the desktop waits up to 120 s for the user (spec 02 §3.2, item 4). */
export const PAIRING_CONFIRM_WAIT_MS = 120_000;
/**
 * The client keeps listening a little after the 120 s so an answer that left
 * the desktop at the last second is not lost: a `pair-accepted` dropped on the
 * floor would leave the desktop listing a device the app has no record of.
 */
export const PAIRING_CONFIRM_GRACE_MS = 5_000;
/** Opening the socket may take as long as the handshake itself (spec 02 §2). */
export const PAIRING_CONNECT_TIMEOUT_MS = HANDSHAKE_TIMEOUT_MS;

// ------------------------------------------------------------------- types

export interface PairingContext {
  /** The device key pair (from `deviceIdentity`); the flow copies it for the handshake. */
  readonly device: StaticKeypair;
  readonly platform: Platform;
  /** Pre-filled device name, normally the phone model (RF-1.7). */
  readonly defaultDeviceName?: string;
  /** Source of the ephemeral key; defaults to `globalThis.crypto`. Tests only. */
  readonly random?: RandomSource;
}

/** Where a timeout hit: opening the socket, the handshake, or the wait for the user. */
export type PairingPhase = "connect" | "handshake" | "confirmation";

export type PairingFailure =
  /** The QR or link was refused (RF-1.6); `error` says why. */
  | { readonly kind: "uri"; readonly error: PairingUriError; readonly field?: string }
  /** The desktop is not who the QR said (RF-1.8). Nothing was sent. */
  | { readonly kind: "host-key-mismatch" }
  /** The relay has no desktop under that address. */
  | { readonly kind: "host-unavailable" }
  /** `pair-rejected` (RF-1.10). Nothing was saved. */
  | { readonly kind: "rejected"; readonly reason: PairRejectReason }
  | { readonly kind: "timeout"; readonly phase: PairingPhase }
  /** The relay closed the channel. */
  | { readonly kind: "relay-closed"; readonly reason: EnvelopeCloseReason }
  /** The WebSocket failed or closed under us. */
  | { readonly kind: "connection-lost" }
  /** A failure of the session layer or a message that does not belong here; `detail` is a code. */
  | { readonly kind: "protocol"; readonly detail: string }
  /** The desktop accepted but the list holds 20 desktops already (nothing was saved). */
  | { readonly kind: "list-full" }
  /** The desktop accepted but the secure store failed (nothing was saved). */
  | { readonly kind: "storage" };

/** What the user entered in the name step was not usable. */
export type NameError = "empty";

interface Target {
  readonly relayUrl: string;
  readonly hostId: string;
  readonly hostKeyB64: string;
  /** The name from the QR; `pair-accepted` carries the one that is saved. */
  readonly hostName: string;
}

export type PairingState =
  | { readonly step: "idle" }
  /** RF-1.7: ask for the device name; show `invite.hostName`. */
  | {
      readonly step: "naming";
      readonly invite: PairingInvite;
      readonly deviceFingerprint: string;
      readonly suggestedName: string;
      readonly nameError: NameError | null;
    }
  | {
      readonly step: "connecting";
      readonly invite: PairingInvite;
      readonly deviceName: string;
      readonly deviceFingerprint: string;
      readonly deadline: number;
    }
  | {
      readonly step: "handshaking";
      readonly target: Target;
      readonly deviceName: string;
      readonly deviceFingerprint: string;
      readonly session: ClientSession;
    }
  /**
   * RF-1.9: show `deviceFingerprint` and a wait indicator that runs until
   * `confirmEndsAt`. The flow itself only gives up at `hardDeadline`.
   */
  | {
      readonly step: "awaiting-confirmation";
      readonly target: Target;
      readonly deviceName: string;
      readonly deviceFingerprint: string;
      readonly session: ClientSession;
      readonly confirmStartedAt: number;
      readonly confirmEndsAt: number;
      readonly hardDeadline: number;
    }
  | {
      readonly step: "saving";
      readonly target: Target;
      readonly deviceName: string;
      readonly session: ClientSession;
      readonly hostName: string;
      /** Messages that arrived while the desktop was being saved. */
      readonly early: readonly Message[];
      readonly sessionEnded: boolean;
    }
  /**
   * RF-1.10: paired. `session` is the open connection, to be handed to the
   * session lifecycle, which sends `hello` (spec 02 §3.2, item 5); `early`
   * holds any message already received, and `sessionEnded` is true when the
   * channel closed before the save finished (the desktop is saved anyway).
   */
  | {
      readonly step: "paired";
      readonly desktop: Desktop;
      readonly replaced: boolean;
      readonly session: ClientSession;
      readonly early: readonly Message[];
      readonly sessionEnded: boolean;
    }
  | { readonly step: "failed"; readonly failure: PairingFailure };

export type PairingEvent =
  /** A pairing URI came in (camera or deep link). Starts over from any state but `saving`. */
  | { readonly type: "uri-read"; readonly uri: string }
  /** The user confirmed the device name. `now` is the monotonic clock. */
  | { readonly type: "name-submitted"; readonly name: string; readonly now: number }
  | { readonly type: "socket-opened"; readonly now: number }
  | { readonly type: "frame-received"; readonly frame: Uint8Array; readonly now: number }
  /** The WebSocket closed or failed (not an envelope-level close). */
  | { readonly type: "socket-closed" }
  | { readonly type: "tick"; readonly now: number }
  | { readonly type: "desktop-saved"; readonly desktop: Desktop; readonly replaced: boolean }
  | { readonly type: "desktop-save-failed"; readonly reason: "full" | "invalid" | "storage" }
  /** The user left the flow. */
  | { readonly type: "cancel" };

export interface SaveDesktopEffect {
  readonly type: "save-desktop";
  /** `pairedAt` is the wall-clock ISO instant, which only the caller knows (see `savePairedDesktop`). */
  readonly desktop: Omit<NewDesktop, "pairedAt">;
}

export type PairingEffect =
  /** Open `url` (`<relay>/v0/client/<host_id>`) and report `socket-opened`. */
  | { readonly type: "open-socket"; readonly url: string }
  | { readonly type: "send-frame"; readonly frame: Uint8Array }
  | { readonly type: "close-socket" }
  | SaveDesktopEffect
  | { readonly type: "log"; readonly name: EventName; readonly fields?: EventFields };

export interface PairingStep {
  readonly state: PairingState;
  readonly effects: readonly PairingEffect[];
}

export function createPairingState(): PairingState {
  return { step: "idle" };
}

// ----------------------------------------------------------------- helpers

const IDLE: PairingState = { step: "idle" };

function unchanged(state: PairingState): PairingStep {
  return { state, effects: [] };
}

function deviceFingerprintOf(context: PairingContext): string {
  return formatFingerprint(fingerprint(context.device.publicKey));
}

/** Trims, drops control characters and cuts at 64 UTF-8 bytes (RF-1.7). */
export function normalizeDeviceName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return clampDeviceName(cleaned).trimEnd();
}

function targetOf(invite: PairingInvite): Target {
  return {
    relayUrl: invite.relayUrl,
    hostId: invite.hostId,
    hostKeyB64: base64UrlEncode(invite.hostKey),
    hostName: invite.hostName,
  };
}

function failureLog(failure: PairingFailure): PairingEffect | null {
  switch (failure.kind) {
    case "host-key-mismatch":
      return { type: "log", name: "handshake_failed", fields: { code: "host-key-mismatch" } };
    case "rejected":
      return { type: "log", name: "pair_rejected", fields: { reason: failure.reason } };
    case "timeout":
      return { type: "log", name: "handshake_failed", fields: { code: "timeout", phase: failure.phase } };
    case "protocol":
      return { type: "log", name: "protocol_error", fields: { code: failure.detail } };
    case "host-unavailable":
      return { type: "log", name: "handshake_failed", fields: { code: "host-unavailable" } };
    case "relay-closed":
      return { type: "log", name: "relay_dropped", fields: { reason: failure.reason } };
    case "connection-lost":
      return { type: "log", name: "relay_dropped" };
    case "uri":
    case "list-full":
    case "storage":
      return null;
  }
}

/** Ends the flow in `failed`, releasing the session and (optionally) the socket. */
function fail(
  failure: PairingFailure,
  session: ClientSession | null,
  closeSocket: boolean,
  before: readonly PairingEffect[] = [],
): PairingStep {
  session?.close();
  const effects: PairingEffect[] = [...before];
  const log = failureLog(failure);
  if (log !== null) {
    effects.push(log);
  }
  if (closeSocket) {
    effects.push({ type: "close-socket" });
  }
  return { state: { step: "failed", failure }, effects };
}

function mapSessionError(error: unknown): PairingFailure {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "unknown";
  const detail = (error as { detail?: unknown })?.detail;
  if (code === "handshake" && detail === "host-key-mismatch") {
    return { kind: "host-key-mismatch" };
  }
  if (code === "timeout") {
    return { kind: "timeout", phase: "handshake" };
  }
  return { kind: "protocol", detail: typeof detail === "string" ? `${code}:${detail}` : code };
}

type LiveState = Extract<
  PairingState,
  { step: "handshaking" | "awaiting-confirmation" | "saving" }
>;

/** Folds the events a `ClientSession` produced into the state, in order. */
function applySessionEvents(initial: LiveState, events: readonly ClientEvent[], now: number): PairingStep {
  let current = initial as PairingState;
  const effects: PairingEffect[] = [];

  for (const event of events) {
    if (current.step === "failed" || current.step === "paired") {
      break;
    }
    if (current.step === "saving") {
      // The desktop already accepted: keep what comes and note the end.
      if (event.type === "message") {
        current = { ...current, early: [...current.early, event.message] };
      } else if (event.type === "closed" || event.type === "failed" || event.type === "host-unavailable") {
        current = { ...current, sessionEnded: true };
      }
      continue;
    }
    if (current.step !== "handshaking" && current.step !== "awaiting-confirmation") {
      break;
    }
    const session = current.session;
    switch (event.type) {
      case "send":
        effects.push({ type: "send-frame", frame: event.frame });
        break;
      case "handshake-complete":
        if (current.step === "handshaking") {
          current = {
            step: "awaiting-confirmation",
            target: current.target,
            deviceName: current.deviceName,
            deviceFingerprint: current.deviceFingerprint,
            session,
            confirmStartedAt: now,
            confirmEndsAt: now + PAIRING_CONFIRM_WAIT_MS,
            hardDeadline: now + PAIRING_CONFIRM_WAIT_MS + PAIRING_CONFIRM_GRACE_MS,
          };
        }
        break;
      case "host-unavailable":
        return fail({ kind: "host-unavailable" }, session, true, effects);
      case "closed":
        return fail({ kind: "relay-closed", reason: event.reason }, session, true, effects);
      case "failed":
        return fail(mapSessionError(event.error), session, true, effects);
      case "message": {
        const message = event.message;
        if (current.step === "awaiting-confirmation" && message.type === "pair-accepted") {
          current = {
            step: "saving",
            target: current.target,
            deviceName: current.deviceName,
            session,
            hostName: message.hostName,
            early: [],
            sessionEnded: false,
          };
          effects.push({
            type: "save-desktop",
            desktop: {
              name: pickDesktopName(message.hostName, current.target),
              relayUrl: current.target.relayUrl,
              hostId: current.target.hostId,
              hostKeyB64: current.target.hostKeyB64,
            },
          });
        } else if (current.step === "awaiting-confirmation" && message.type === "pair-rejected") {
          return fail({ kind: "rejected", reason: message.reason }, session, true, effects);
        } else {
          return fail({ kind: "protocol", detail: "unexpected-message" }, session, true, effects);
        }
        break;
      }
    }
  }
  return { state: current, effects };
}

/** RF-1.10: the name that came from the desktop; the QR name, then the id, if it is not storable. */
function pickDesktopName(acceptedName: string, target: Target): string {
  for (const candidate of [acceptedName, target.hostName]) {
    const trimmed = candidate.trim();
    const length = Array.from(trimmed).length;
    if (length >= 1 && length <= 64 && !/[\u0000-\u001f\u007f]/.test(trimmed)) {
      return trimmed;
    }
  }
  return target.hostId;
}

function startSession(
  context: PairingContext,
  state: Extract<PairingState, { step: "connecting" }>,
  now: number,
): PairingStep {
  let started: ReturnType<typeof ClientSession.pair>;
  try {
    const options = context.random === undefined ? {} : { random: context.random };
    started = ClientSession.pair(
      state.invite,
      copyKeypair(context.device),
      state.deviceName,
      context.platform,
      now,
      options,
    );
  } catch (error) {
    return fail(mapSessionError(error), null, true);
  }
  return {
    state: {
      step: "handshaking",
      target: targetOf(state.invite),
      deviceName: state.deviceName,
      deviceFingerprint: state.deviceFingerprint,
      session: started.session,
    },
    effects: started.frames.map((frame) => ({ type: "send-frame" as const, frame })),
  };
}

function live(state: PairingState): state is LiveState {
  return (
    state.step === "handshaking" || state.step === "awaiting-confirmation" || state.step === "saving"
  );
}

/** Releases whatever an abandoned state holds and says whether a socket is open. */
function abandon(state: PairingState): PairingEffect[] {
  if (state.step === "handshaking" || state.step === "awaiting-confirmation") {
    state.session.close();
    return [{ type: "close-socket" }];
  }
  if (state.step === "connecting") {
    return [{ type: "close-socket" }];
  }
  return [];
}

// ----------------------------------------------------------------- reducer

export function reducePairing(
  context: PairingContext,
  state: PairingState,
  event: PairingEvent,
): PairingStep {
  switch (event.type) {
    case "uri-read": {
      // While the desktop is being saved the result of the pairing must not be lost.
      if (state.step === "saving") {
        return unchanged(state);
      }
      const effects = abandon(state);
      const parsed = parsePairingUri(event.uri);
      if (!parsed.ok) {
        const failure: PairingFailure =
          parsed.field === undefined
            ? { kind: "uri", error: parsed.error }
            : { kind: "uri", error: parsed.error, field: parsed.field };
        return { state: { step: "failed", failure }, effects };
      }
      return {
        state: {
          step: "naming",
          invite: parsed.invite,
          deviceFingerprint: deviceFingerprintOf(context),
          suggestedName: normalizeDeviceName(context.defaultDeviceName ?? ""),
          nameError: null,
        },
        effects,
      };
    }

    case "name-submitted": {
      if (state.step !== "naming") {
        return unchanged(state);
      }
      const deviceName = normalizeDeviceName(event.name);
      if (deviceName === "") {
        return unchanged({ ...state, nameError: "empty" });
      }
      let url: string;
      try {
        url = clientChannelUrl(state.invite.relayUrl, state.invite.hostId);
      } catch {
        // `parsePairingUri` already vetted both, so this is a guard, not a path.
        return fail({ kind: "uri", error: "malformed-field" }, null, false);
      }
      return {
        state: {
          step: "connecting",
          invite: state.invite,
          deviceName,
          deviceFingerprint: state.deviceFingerprint,
          deadline: event.now + PAIRING_CONNECT_TIMEOUT_MS,
        },
        effects: [
          { type: "log", name: "relay_connecting" },
          { type: "open-socket", url },
        ],
      };
    }

    case "socket-opened": {
      if (state.step !== "connecting") {
        return unchanged(state);
      }
      const step = startSession(context, state, event.now);
      return {
        state: step.state,
        effects: [{ type: "log", name: "relay_connected" }, ...step.effects],
      };
    }

    case "frame-received": {
      if (state.step !== "handshaking" && state.step !== "awaiting-confirmation" && state.step !== "saving") {
        return unchanged(state);
      }
      let events: ClientEvent[];
      try {
        events = state.session.receive(event.frame, event.now);
      } catch (error) {
        if (state.step === "saving") {
          return unchanged({ ...state, sessionEnded: true });
        }
        return fail(mapSessionError(error), state.session, true);
      }
      return applySessionEvents(state, events, event.now);
    }

    case "socket-closed": {
      if (state.step === "saving") {
        state.session.close();
        return unchanged({ ...state, sessionEnded: true });
      }
      if (state.step === "connecting") {
        return fail({ kind: "connection-lost" }, null, false);
      }
      if (state.step === "handshaking" || state.step === "awaiting-confirmation") {
        return fail({ kind: "connection-lost" }, state.session, false);
      }
      return unchanged(state);
    }

    case "tick": {
      switch (state.step) {
        case "connecting":
          return event.now >= state.deadline
            ? fail({ kind: "timeout", phase: "connect" }, null, true)
            : unchanged(state);
        case "handshaking": {
          let events: ClientEvent[];
          try {
            events = state.session.tick(event.now);
          } catch (error) {
            return fail(mapSessionError(error), state.session, true);
          }
          return applySessionEvents(state, events, event.now);
        }
        case "awaiting-confirmation":
          return event.now >= state.hardDeadline
            ? fail({ kind: "timeout", phase: "confirmation" }, state.session, true)
            : unchanged(state);
        default:
          return unchanged(state);
      }
    }

    case "desktop-saved": {
      if (state.step !== "saving") {
        return unchanged(state);
      }
      return {
        state: {
          step: "paired",
          desktop: event.desktop,
          replaced: event.replaced,
          session: state.session,
          early: state.early,
          sessionEnded: state.sessionEnded,
        },
        effects: [{ type: "log", name: "pair_ok" }],
      };
    }

    case "desktop-save-failed": {
      if (state.step !== "saving") {
        return unchanged(state);
      }
      const failure: PairingFailure =
        event.reason === "full" ? { kind: "list-full" } : { kind: "storage" };
      return fail(failure, state.session, true, [
        { type: "log", name: "storage_invalid", fields: { item: "desktops.v1", reason: event.reason } },
      ]);
    }

    case "cancel": {
      if (state.step === "idle" || state.step === "failed" || state.step === "paired") {
        return unchanged(state);
      }
      // Cancelling while the desktop is being saved would lose the pairing:
      // the save finishes and the user sees the result.
      if (state.step === "saving") {
        return unchanged(state);
      }
      return { state: IDLE, effects: abandon(state) };
    }
  }
}

/**
 * When the caller should send the next `tick`, in the monotonic clock of the
 * events, or null when nothing is due. Re-read it after every step.
 */
export function nextPairingDeadline(state: PairingState): number | null {
  switch (state.step) {
    case "connecting":
      return state.deadline;
    case "handshaking":
      return state.session.nextDeadline();
    case "awaiting-confirmation":
      return state.hardDeadline;
    default:
      return null;
  }
}

/** True while a socket or a session may be open (the screen shows progress, not a result). */
export function isPairingActive(state: PairingState): boolean {
  return live(state) || state.step === "connecting";
}

// ----------------------------------------------------------------- saving

/**
 * Runs a `save-desktop` effect through the repository (`addOrReplaceDesktop`
 * inside) and turns the outcome into the event to feed back. `pairedAt` is the
 * wall-clock ISO instant of the pairing. A save that fails is reported as an
 * event, never thrown.
 */
export async function savePairedDesktop(
  repository: Pick<DesktopRepository, "add">,
  effect: SaveDesktopEffect,
  pairedAt: string,
): Promise<PairingEvent> {
  let result: AddResult;
  try {
    result = await repository.add({ ...effect.desktop, pairedAt });
  } catch {
    return { type: "desktop-save-failed", reason: "storage" };
  }
  if (result.ok) {
    return { type: "desktop-saved", desktop: result.desktop, replaced: result.replaced };
  }
  return { type: "desktop-save-failed", reason: result.reason };
}
