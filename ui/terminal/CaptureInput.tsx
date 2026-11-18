// SPDX-License-Identifier: GPL-3.0-or-later
// The invisible field that captures the system keyboard for the terminal
// (architecture §5, PRD-003 RF-3.14, RF-3.18). Autocorrection, prediction,
// capitalization and autofill are off; every change of its text goes out as
// typed text (accents, IME composition and dictation included). The field is
// not controlled: a controlled `value=""` is reset asynchronously by React
// Native, and a fast burst of keys could land between the change and the reset
// and be lost or sent twice. Instead the component remembers what the field
// holds and sends only the difference from the previous text: added characters
// as text, removed ones as `backspace`. The field is emptied on `Enter`, on
// blur and after a pause once it holds a lot. `Backspace` over an empty field
// becomes the `backspace` key and `Enter` the `enter` key, both through
// `onKey`. Nothing typed is ever logged.
//
// A pane that cannot take input (`enabled` false, the controller's `canType`)
// does not open the keyboard: `focus()` does nothing, and the field lets go
// of the keyboard when input stops being possible.
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import {
  TextInput,
  View,
  type TextInputInstance,
  type TextInputKeyPressEvent,
} from "react-native";

import { NamedKey } from "@/protocol";

import { useTheme } from "../theme";

/** Held characters past which the field is emptied, once typing pauses. */
const MAX_HELD = 256;
/** How long typing must pause before the field is emptied. */
const IDLE_MS = 1000;

/** What the screen calls on the field. */
export interface CaptureInputHandle {
  /** Opens the system keyboard; nothing happens while input is not possible. */
  focus(): void;
  /** Closes the system keyboard. */
  blur(): void;
  isFocused(): boolean;
}

/** The named keys the system keyboard produces besides text. */
export type CaptureKey = typeof NamedKey.backspace | typeof NamedKey.enter;

export type CaptureInputProps = {
  readonly ref?: Ref<CaptureInputHandle>;
  /** Input may go (`canType`, RF-3.18). */
  readonly enabled: boolean;
  /** Text typed, composed or dictated (RF-3.14); never empty. */
  readonly onText: (text: string) => void;
  /** `backspace` or `enter` from the system keyboard. */
  readonly onKey: (key: CaptureKey) => void;
  /** The keyboard opened (the field took the focus) or closed. */
  readonly onFocusChange?: (focused: boolean) => void;
  readonly testID?: string;
};

/** The hidden text field of the terminal screen. */
export function CaptureInput({
  ref,
  enabled,
  onText,
  onKey,
  onFocusChange,
  testID = "capture-input",
}: CaptureInputProps) {
  const { scheme } = useTheme();
  const input = useRef<TextInputInstance>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        if (enabled) {
          input.current?.focus();
        }
      },
      blur() {
        input.current?.blur();
      },
      isFocused: () => input.current?.isFocused() ?? false,
    }),
    [enabled],
  );

  useEffect(() => {
    if (!enabled) {
      input.current?.blur();
    }
  }, [enabled]);

  // What the field holds right now, as far as we have seen it. Updated
  // synchronously on every change, so a fast burst never races a reset.
  const held = useRef("");
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelIdle = () => {
    if (idle.current !== null) {
      clearTimeout(idle.current);
      idle.current = null;
    }
  };

  /** Empties the field. `held` goes first, so the emptying is never read as typing. */
  const empty = () => {
    cancelIdle();
    held.current = "";
    input.current?.clear();
  };

  useEffect(() => cancelIdle, []);

  const onChangeText = (text: string) => {
    const before = Array.from(held.current);
    const after = Array.from(text);
    held.current = text;
    if (enabled) {
      let common = 0;
      while (common < before.length && common < after.length && before[common] === after[common]) {
        common += 1;
      }
      // Removed characters go out as `backspace`, added ones as one text.
      for (let i = before.length; i > common; i -= 1) {
        onKey(NamedKey.backspace);
      }
      if (common < after.length) {
        onText(after.slice(common).join(""));
      }
    }
    // Let go of what piled up, but only once typing has paused: emptying in
    // the middle of a burst or a composition is the race this avoids.
    cancelIdle();
    if (after.length > MAX_HELD) {
      idle.current = setTimeout(empty, IDLE_MS);
    }
  };

  const onKeyPress = (event: TextInputKeyPressEvent) => {
    // Characters come through `onChangeText`; `Enter` through `onSubmitEditing`.
    // A `Backspace` over held text arrives as a shorter text and is sent there;
    // only one over an empty field has no change event.
    if (event.nativeEvent.key === "Backspace" && enabled && held.current.length === 0) {
      onKey(NamedKey.backspace);
    }
  };

  const onSubmitEditing = () => {
    if (enabled) {
      onKey(NamedKey.enter);
    }
    empty();
  };

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }}
    >
      <TextInput
        ref={input}
        editable={enabled}
        onChangeText={onChangeText}
        onKeyPress={onKeyPress}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => {
          empty();
          onFocusChange?.(false);
        }}
        // Enter keeps the keyboard open and writes no line break.
        submitBehavior="submit"
        multiline={false}
        autoCorrect={false}
        spellCheck={false}
        autoCapitalize="none"
        autoComplete="off"
        importantForAutofill="no"
        textContentType="none"
        smartInsertDelete={false}
        contextMenuHidden
        caretHidden
        // Android in landscape would cover the screen with its own editor.
        disableFullscreenUI
        keyboardAppearance={scheme}
        style={{ flex: 1, opacity: 0 }}
        testID={testID}
      />
    </View>
  );
}
