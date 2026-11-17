// SPDX-License-Identifier: GPL-3.0-or-later
// The invisible field that captures the system keyboard for the terminal
// (architecture §5, PRD-003 RF-3.14, RF-3.18). Autocorrection, prediction,
// capitalization and autofill are off; every change of its text goes out as
// typed text (accents, IME composition and dictation included) and the field
// is emptied again, so it never holds what was typed. `Backspace` of the
// virtual keyboard becomes the `backspace` key and `Enter` the `enter` key,
// both through `onKey`. Nothing typed is ever logged.
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

  const onChangeText = (text: string) => {
    // The field stays empty (`value=""`): what arrives is only the new text.
    if (text.length > 0 && enabled) {
      onText(text);
    }
  };

  const onKeyPress = (event: TextInputKeyPressEvent) => {
    // Characters come through `onChangeText`; `Enter` through `onSubmitEditing`.
    if (event.nativeEvent.key === "Backspace" && enabled) {
      onKey(NamedKey.backspace);
    }
  };

  const onSubmitEditing = () => {
    if (enabled) {
      onKey(NamedKey.enter);
    }
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
        value=""
        editable={enabled}
        onChangeText={onChangeText}
        onKeyPress={onKeyPress}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
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
