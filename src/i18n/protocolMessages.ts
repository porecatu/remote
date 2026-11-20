// SPDX-License-Identifier: GPL-3.0-or-later
import {
  CLOSE_CODE,
  CloseReason,
  ErrorCode,
  GoodbyeReason,
  PairRejectReason,
  PaneState,
  type PairingUriError,
} from "../protocol";
import type { MessageKey } from "./catalog";

// Turns the codes the protocol package defines into catalog keys. The tables
// are `Record<Code, MessageKey>`, so a code added by a package upgrade is a
// compile error here, and `protocolMessages.test.ts` walks the package's own
// arrays to prove every key has text in both languages. No prose lives here
// (the catalog holds all of it); a screen calls `t(errorMessageKey(code))`.

const ERROR_KEYS = {
  [ErrorCode.protocol]: "error.protocol",
  [ErrorCode.notPaired]: "error.not-paired",
  [ErrorCode.unknownWindow]: "error.unknown-window",
  [ErrorCode.unknownGroup]: "error.unknown-group",
  [ErrorCode.unknownTab]: "error.unknown-tab",
  [ErrorCode.unknownPane]: "error.unknown-pane",
  [ErrorCode.unknownProfile]: "error.unknown-profile",
  [ErrorCode.paneNotRunning]: "error.pane-not-running",
  [ErrorCode.notSubscribed]: "error.not-subscribed",
  [ErrorCode.tooManySubscriptions]: "error.too-many-subscriptions",
  [ErrorCode.invalidArgument]: "error.invalid-argument",
  [ErrorCode.busy]: "error.busy",
  [ErrorCode.confirmTimeout]: "error.confirm-timeout",
  [ErrorCode.cancelled]: "error.cancelled",
  [ErrorCode.unsupported]: "error.unsupported",
  [ErrorCode.lastTab]: "error.last-tab",
  [ErrorCode.unknownSession]: "error.unknown-session",
  [ErrorCode.sessionUnreadable]: "error.session-unreadable",
} as const satisfies Record<ErrorCode, MessageKey>;

const GOODBYE_KEYS = {
  [GoodbyeReason.normal]: "goodbye.normal",
  [GoodbyeReason.remoteDisabled]: "goodbye.remote-disabled",
  [GoodbyeReason.revoked]: "goodbye.revoked",
  [GoodbyeReason.hostQuitting]: "goodbye.host-quitting",
} as const satisfies Record<GoodbyeReason, MessageKey>;

const PAIR_REJECTED_KEYS = {
  [PairRejectReason.tokenInvalid]: "pair_rejected.token-invalid",
  [PairRejectReason.userDeclined]: "pair_rejected.user-declined",
  [PairRejectReason.timeout]: "pair_rejected.timeout",
} as const satisfies Record<PairRejectReason, MessageKey>;

const PANE_STATE_KEYS = {
  [PaneState.running]: "pane_state.running",
  [PaneState.exited]: "pane_state.exited",
  [PaneState.notStarted]: "pane_state.not-started",
  [PaneState.connecting]: "pane_state.connecting",
  [PaneState.reconnecting]: "pane_state.reconnecting",
  [PaneState.disconnected]: "pane_state.disconnected",
  [PaneState.awaitingDesktop]: "pane_state.awaiting-desktop",
} as const satisfies Record<PaneState, MessageKey>;

const CLOSE_REASON_KEYS = {
  [CloseReason.normal]: "close_reason.normal",
  [CloseReason.hostReplaced]: "close_reason.host-replaced",
  [CloseReason.hostGone]: "close_reason.host-gone",
  [CloseReason.hostRejected]: "close_reason.host-rejected",
  [CloseReason.limitExceeded]: "close_reason.limit-exceeded",
  [CloseReason.protocolError]: "close_reason.protocol-error",
} as const satisfies Record<CloseReason, MessageKey>;

const PAIRING_URI_KEYS = {
  "not-porecatu": "pairing_uri.not-porecatu",
  "missing-field": "pairing_uri.missing-param",
  "duplicate-field": "pairing_uri.duplicate-param",
  "malformed-field": "pairing_uri.malformed-param",
  "version-mismatch": "pairing_uri.unsupported-version",
  "insecure-relay": "pairing_uri.insecure-relay",
} as const satisfies Record<PairingUriError, MessageKey>;

const SOCKET_CLOSE_KEYS = {
  [CLOSE_CODE.normal]: "socket_close.normal",
  [CLOSE_CODE.goingAway]: "socket_close.going-away",
  [CLOSE_CODE.unsupportedData]: "socket_close.unsupported-data",
  [CLOSE_CODE.messageTooBig]: "socket_close.message-too-big",
  [CLOSE_CODE.registrationRejected]: "socket_close.registration-refused",
  [CLOSE_CODE.replaced]: "socket_close.replaced",
  [CLOSE_CODE.limitExceeded]: "socket_close.limit-exceeded",
  [CLOSE_CODE.invalidEnvelope]: "socket_close.invalid-envelope",
  [CLOSE_CODE.registrationTimeout]: "socket_close.registration-timeout",
} as const satisfies Record<(typeof CLOSE_CODE)[keyof typeof CLOSE_CODE], MessageKey>;

type Lookup = Readonly<Record<number, MessageKey | undefined>>;

/** Text of a protocol `error` / `action-result` code; an unknown code (a newer host) gets the generic text. */
export function errorMessageKey(code: ErrorCode | number): MessageKey {
  return (ERROR_KEYS as Lookup)[code] ?? "error.unknown";
}

/** Why the desktop ended the session (`goodbye.reason`). */
export function goodbyeKey(reason: GoodbyeReason): MessageKey {
  return GOODBYE_KEYS[reason];
}

/** Why the desktop refused a pairing (`pair-rejected.reason`). */
export function pairRejectedKey(reason: PairRejectReason): MessageKey {
  return PAIR_REJECTED_KEYS[reason];
}

/** Label of a pane state; `exited` with a code has `pane_state.exited_code` instead. */
export function paneStateKey(state: PaneState): MessageKey {
  return PANE_STATE_KEYS[state];
}

/** Why the relay closed a channel (`close-reason`, spec 01 §4). */
export function closeReasonKey(reason: CloseReason): MessageKey {
  return CLOSE_REASON_KEYS[reason];
}

/**
 * Why a pairing URI was refused. `field` (from `parsePairingUri`) refines a
 * malformed field into the more specific text when there is one.
 */
export function pairingUriErrorKey(error: PairingUriError, field?: string): MessageKey {
  if (error === "malformed-field") {
    if (field === "relay") {
      return "pairing_uri.invalid-relay";
    }
    if (field === "name") {
      return "pairing_uri.bad-name";
    }
  }
  return PAIRING_URI_KEYS[error];
}

/** Why the relay WebSocket closed, by close code; 1005/1006 and anything else get the generic text. */
export function socketCloseKey(code: number): MessageKey {
  return (SOCKET_CLOSE_KEYS as Lookup)[code] ?? "socket_close.unknown";
}
