// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { TextInput, useColorScheme } from "react-native";

import { NamedKey } from "@/protocol";
import { renderWithServices } from "@ui/services/testing";

import { CaptureInput, type CaptureInputHandle, type CaptureKey } from "./CaptureInput";

// The Jest mock of `TextInput` shares `jest.fn` instance methods on its prototype.
const focusSpy = () => jest.mocked(TextInput.prototype.focus);
const blurSpy = () => jest.mocked(TextInput.prototype.blur);

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
  focusSpy().mockClear();
  blurSpy().mockClear();
});

async function setup(enabled = true) {
  const ref = createRef<CaptureInputHandle>();
  const onText = jest.fn<void, [string]>();
  const onKey = jest.fn<void, [CaptureKey]>();
  const onFocusChange = jest.fn<void, [boolean]>();
  const ui = (on: boolean) => (
    <CaptureInput ref={ref} enabled={on} onText={onText} onKey={onKey} onFocusChange={onFocusChange} />
  );
  const result = await renderWithServices(ui(enabled));
  const field = () => screen.getByTestId("capture-input", { includeHiddenElements: true });
  return {
    ref,
    onText,
    onKey,
    onFocusChange,
    field,
    async setEnabled(on: boolean) {
      await result.rerender(ui(on));
    },
  };
}

describe("CaptureInput", () => {
  it("turns off autocorrection, prediction, capitalization and autofill", async () => {
    const { field } = await setup();
    expect(field().props).toMatchObject({
      autoCorrect: false,
      spellCheck: false,
      autoCapitalize: "none",
      autoComplete: "off",
      importantForAutofill: "no",
      submitBehavior: "submit",
      keyboardAppearance: "dark",
    });
  });

  it("sends every change as text and keeps the field empty", async () => {
    const { field, onText, onKey } = await setup();
    await fireEvent.changeText(field(), "l");
    await fireEvent.changeText(field(), "s");
    // IME composition and dictation arrive the same way, in one piece.
    await fireEvent.changeText(field(), "ação");
    expect(onText.mock.calls).toEqual([["l"], ["s"], ["ação"]]);
    expect(field().props.value).toBe("");
    expect(onKey).not.toHaveBeenCalled();
  });

  it("sends nothing for an empty change (the field being emptied)", async () => {
    const { field, onText } = await setup();
    await fireEvent.changeText(field(), "");
    expect(onText).not.toHaveBeenCalled();
  });

  it("turns Backspace into the backspace key and leaves characters to the text", async () => {
    const { field, onText, onKey } = await setup();
    await fireEvent(field(), "keyPress", { nativeEvent: { key: "Backspace" } });
    await fireEvent(field(), "keyPress", { nativeEvent: { key: "a" } });
    await fireEvent(field(), "keyPress", { nativeEvent: { key: "Enter" } });
    expect(onKey.mock.calls).toEqual([[NamedKey.backspace]]);
    expect(onText).not.toHaveBeenCalled();
  });

  it("turns Enter into the enter key", async () => {
    const { field, onKey } = await setup();
    await fireEvent(field(), "submitEditing", { nativeEvent: { text: "" } });
    expect(onKey.mock.calls).toEqual([[NamedKey.enter]]);
  });

  it("opens and closes the keyboard through its handle", async () => {
    const { ref, onFocusChange, field } = await setup();
    await act(() => {
      ref.current?.focus();
    });
    expect(focusSpy()).toHaveBeenCalledTimes(1);
    await fireEvent(field(), "focus");
    jest.mocked(TextInput.prototype.isFocused).mockReturnValueOnce(true);
    expect(ref.current?.isFocused()).toBe(true);
    await act(() => {
      ref.current?.blur();
    });
    expect(blurSpy()).toHaveBeenCalledTimes(1);
    await fireEvent(field(), "blur");
    expect(onFocusChange.mock.calls).toEqual([[true], [false]]);
  });

  it("does not open the keyboard for a pane that cannot take input, and sends nothing", async () => {
    const { ref, field, onText, onKey } = await setup(false);
    expect(field().props.editable).toBe(false);
    await act(() => {
      ref.current?.focus();
    });
    expect(focusSpy()).not.toHaveBeenCalled();
    await fireEvent.changeText(field(), "x");
    await fireEvent(field(), "keyPress", { nativeEvent: { key: "Backspace" } });
    await fireEvent(field(), "submitEditing", { nativeEvent: { text: "" } });
    expect(onText).not.toHaveBeenCalled();
    expect(onKey).not.toHaveBeenCalled();
  });

  it("lets go of the keyboard when input stops being possible", async () => {
    const { ref, setEnabled } = await setup();
    await act(() => {
      ref.current?.focus();
    });
    expect(blurSpy()).not.toHaveBeenCalled();
    await setEnabled(false);
    expect(blurSpy()).toHaveBeenCalledTimes(1);
    await setEnabled(true);
    expect(blurSpy()).toHaveBeenCalledTimes(1);
  });

  it("is hidden from screen readers", async () => {
    await setup();
    expect(screen.queryByTestId("capture-input")).toBeNull();
  });
});
