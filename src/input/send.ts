// SPDX-License-Identifier: GPL-3.0-or-later

// Builds and sends the input messages (spec 03 §6, PRD-003 RF-3.14 to 3.19):
// `key`, `text-input` and `paste`. The app sends *semantic* input; the host
// turns it into bytes. Input goes only to a pane that is subscribed and in
// `running` state (RF-3.18); anything else is refused here, before the wire,
// so the host never has to answer `not-subscribed` or `pane-not-running`.
//
// Pure: no socket, no clock. What goes out leaves through the injected `send`.
// Nothing here logs: keys, typed text and pasted text are private
// (CLAUDE.md, Segurança). The paste confirmation (RF-3.17) is the caller's
// dialog; `paste` only says when it is needed and sends once it was given.

import { type ClientMessage, type NamedKey, type PaneId, PaneState } from "../protocol";
import { type PasteAnalysis, type PasteOptions, analyzePaste } from "./paste";
import type { ModifierKeys } from "./modifiers";

/**
 * Largest text of one `text-input` or `paste`, in UTF-8 bytes. An app-side
 * guard: the protocol caps a message at 16 MiB and a message over the cap is a
 * fatal record error that closes the session, so a huge paste is refused here
 * instead of ending the connection.
 */
export const MAX_INPUT_TEXT_BYTES = 1_048_576;

/** Why an input was not sent. */
export type InputRefusal =
  /** The pane is not subscribed. */
  | "not-subscribed"
  /** The pane is not in `running` state (or the workspace does not know it). */
  | "not-running"
  /** Empty text. */
  | "empty"
  /** The text is not valid Unicode (a lone surrogate): it cannot be encoded. */
  | "invalid-text"
  /** The text is over `MAX_INPUT_TEXT_BYTES`. */
  | "too-large";

export type SendResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: InputRefusal };

export type PasteResult =
  | SendResult
  /** More than one line: show `analysis` and call `paste` again with `confirmed: true`. */
  | { readonly ok: false; readonly reason: "needs-confirmation"; readonly analysis: PasteAnalysis };

export interface InputSenderOptions {
  /** Sends a message to the host. */
  readonly send: (message: ClientMessage) => void;
  /** The modifier keys of the bar (`createModifierKeys`). */
  readonly modifiers: ModifierKeys;
  /** Whether `pane` is subscribed (`SubscriptionSet.has`). */
  readonly isSubscribed: (pane: PaneId) => boolean;
  /** The state of `pane` in the last `workspace`, `undefined` if the tree does not have it. */
  readonly paneState: (pane: PaneId) => PaneState | undefined;
}

export interface InputSender {
  /**
   * A named key (bar, arrows, function keys). The armed modifiers go with it
   * and the "once" ones are spent, only if the key was sent.
   */
  pressNamed(pane: PaneId, key: NamedKey): SendResult;
  /**
   * Text from the system keyboard (also IME composition and dictation). With a
   * modifier armed and a single character, it goes as a `key` with the
   * modifiers (`Ctrl` + "c" is `key { "c", Ctrl }`, not text, RF-3.16);
   * otherwise it is a `text-input` and the modifiers are left alone.
   */
  typeText(pane: PaneId, text: string): SendResult;
  /**
   * Paste. A text with a line break needs the user's confirmation first: until
   * `options.confirmed` is true the result is `needs-confirmation` and nothing
   * is sent. A refusal for the pane comes before the confirmation, so the user
   * is not asked about a paste that could not go anyway.
   */
  paste(
    pane: PaneId,
    text: string,
    options?: PasteOptions & { readonly confirmed?: boolean },
  ): PasteResult;
}

export function createInputSender(options: InputSenderOptions): InputSender {
  const { send, modifiers } = options;

  const paneRefusal = (pane: PaneId): InputRefusal | null => {
    if (!options.isSubscribed(pane)) {
      return "not-subscribed";
    }
    return options.paneState(pane) === PaneState.running ? null : "not-running";
  };

  const textRefusal = (text: string): InputRefusal | null => {
    if (text.length === 0) {
      return "empty";
    }
    // The cheap bound first: 3 bytes per UTF-16 unit is the UTF-8 worst case.
    const bytes = text.length * 3 > MAX_INPUT_TEXT_BYTES ? utf8Length(text) : 0;
    if (bytes > MAX_INPUT_TEXT_BYTES) {
      return "too-large";
    }
    return hasLoneSurrogate(text) ? "invalid-text" : null;
  };

  return {
    pressNamed(pane, key) {
      const refusal = paneRefusal(pane);
      if (refusal !== null) {
        return { ok: false, reason: refusal };
      }
      send({ type: "key", pane, key, mods: modifiers.consume() });
      return { ok: true };
    },

    typeText(pane, text) {
      const refusal = paneRefusal(pane) ?? textRefusal(text);
      if (refusal !== null) {
        return { ok: false, reason: refusal };
      }
      if (modifiers.peek() !== 0 && isSingleScalar(text)) {
        send({ type: "key", pane, key: text, mods: modifiers.consume() });
      } else {
        send({ type: "text-input", pane, text });
      }
      return { ok: true };
    },

    paste(pane, text, pasteOptions) {
      const refusal = paneRefusal(pane) ?? textRefusal(text);
      if (refusal !== null) {
        return { ok: false, reason: refusal };
      }
      const analysis = analyzePaste(text, pasteOptions);
      if (analysis.needsConfirmation && pasteOptions?.confirmed !== true) {
        return { ok: false, reason: "needs-confirmation", analysis };
      }
      send({ type: "paste", pane, text });
      return { ok: true };
    },
  };
}

/** Whether `text` is exactly one Unicode scalar value (the `key` text form). */
export function isSingleScalar(text: string): boolean {
  const first = text.codePointAt(0);
  if (first === undefined) {
    return false;
  }
  return text.length === (first > 0xffff ? 2 : 1) && !hasLoneSurrogate(text);
}

/** Whether `text` has an unpaired UTF-16 surrogate, which has no UTF-8 form. */
export function hasLoneSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i += 1;
      } else {
        return true;
      }
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) {
      bytes += 1;
    } else if (unit < 0x800) {
      bytes += 2;
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
