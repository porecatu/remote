// SPDX-License-Identifier: GPL-3.0-or-later
// What the user reads when an action of the session did not go as asked
// (anatomy §4.14, PRD-004 RF-4.10): a code, a refusal or an event becomes a
// catalog key, its parameters and the snackbar severity. No text lives here,
// only keys; the screen translates with `t(message.key, message.params)`.
//
// - `cancelled` shows nothing: the user said no to the confirmation.
// - `invalid-argument` and `unsupported` show the generic text with the code
//   as the protocol names it, for a report; the snackbar draws the code in
//   mono (`code`, passed on by `actionToastOptions`).
// - Every other code has its own text (`errorMessageKey`), and a code this
//   version does not know gets the generic "unknown error" text.
// - "Pending" never has a notice: the spinner of the row says it (§4.14).
//
// Severity: a failed action is an `error` (it stays 8 s with the `x`), except
// a confirmation that ran out of time, which closed nothing and is `info`.
// The session dropping with actions unanswered and a created tab that never
// showed up leave the result unknown, so they are a `warning`.
import type { ToastSeverity } from "@/controllers/overlay";
import type { MessageKey, MessageParams, Translator } from "@/i18n/catalog";
import type { ToastOptions } from "@ui/overlay/useOverlay";
import { errorMessageKey } from "@/i18n/protocolMessages";
import { ErrorCode } from "@/protocol";
import type { SendActionResult } from "@/session/sessionStore";

export type ActionMessage = {
  readonly key: MessageKey;
  readonly params?: MessageParams;
  readonly severity: ToastSeverity;
  /** The protocol code the message quotes, drawn in mono (§4.14). */
  readonly code?: string;
};

/** The protocol names of the codes shown as they are (§4.14). */
const CODE_NAMES: Readonly<Record<number, string | undefined>> = {
  [ErrorCode.invalidArgument]: "invalid-argument",
  [ErrorCode.unsupported]: "unsupported",
};

/** The notice of an `action-result` error, or null when nothing is shown (`cancelled`). */
export function actionFailureMessage(code: ErrorCode | number): ActionMessage | null {
  if (code === ErrorCode.cancelled) {
    return null;
  }
  const name = CODE_NAMES[code];
  if (name !== undefined) {
    return { key: "toast.action_failed", params: { code: name }, severity: "error", code: name };
  }
  return {
    key: errorMessageKey(code),
    severity: code === ErrorCode.confirmTimeout ? "info" : "error",
  };
}

/** The 60 s of a confirmation passed in the app: nothing was closed (RF-4.2). */
export const CONFIRM_EXPIRED_MESSAGE: ActionMessage = { key: "error.confirm-timeout", severity: "info" };

/** The session dropped before the desktop answered some actions. */
export const ACTIONS_LOST_MESSAGE: ActionMessage = { key: "toast.actions_lost", severity: "warning" };

/** A tab the desktop created did not show up in the workspace in time. */
export const NEW_TAB_MISSING_MESSAGE: ActionMessage = { key: "toast.new_tab_missing", severity: "warning" };

const REFUSAL_MESSAGES: Readonly<
  Record<Extract<SendActionResult, { readonly ok: false }>["reason"], ActionMessage>
> = {
  busy: { key: "toast.action_busy", severity: "info" },
  "not-ready": { key: "toast.not_connected", severity: "warning" },
  "send-failed": { key: "toast.send_failed", severity: "error" },
};

/** The notice of an action the app could not send (`SessionStore.sendAction`), or null when it went. */
export function sendRefusalMessage(result: SendActionResult): ActionMessage | null {
  return result.ok ? null : REFUSAL_MESSAGES[result.reason];
}

/** The translated text of a message. */
export function actionMessageText(message: ActionMessage, t: Translator["t"]): string {
  return t(message.key, message.params);
}

/** The snackbar options of a message: its severity, and its code in mono. */
export function actionToastOptions(message: ActionMessage): ToastOptions {
  return message.code === undefined
    ? { severity: message.severity }
    : { severity: message.severity, code: message.code };
}
