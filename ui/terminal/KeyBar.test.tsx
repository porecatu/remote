// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, screen } from "@testing-library/react-native";
import { StyleSheet, useColorScheme } from "react-native";

import type { TerminalModifiers } from "@/controllers/terminalSession";
import type { KeyBarKeyId, KeyBarModifierId } from "@/input/keyBar";
import { type TestServices, createTestServices, renderWithServices } from "@ui/services/testing";
import { palettes, size } from "@ui/theme";

import { KeyBar } from "./KeyBar";

const OFF: TerminalModifiers = { ctrl: "off", alt: "off", shift: "off" };

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

type Rig = {
  readonly onKey: jest.Mock<void, [KeyBarKeyId]>;
  readonly onModifier: jest.Mock<void, [KeyBarModifierId]>;
  readonly onText: jest.Mock<void, [string]>;
  readonly onPaste: jest.Mock<void, []>;
  readonly services: TestServices;
  rerender(modifiers: TerminalModifiers): Promise<void>;
};

async function setup(
  options: { modifiers?: TerminalModifiers; services?: TestServices; landscape?: boolean } = {},
): Promise<Rig> {
  const onKey = jest.fn<void, [KeyBarKeyId]>();
  const onModifier = jest.fn<void, [KeyBarModifierId]>();
  const onText = jest.fn<void, [string]>();
  const onPaste = jest.fn<void, []>();
  const bar = (modifiers: TerminalModifiers) => (
    <KeyBar
      modifiers={modifiers}
      onKey={onKey}
      onModifier={onModifier}
      onText={onText}
      onPaste={onPaste}
      {...(options.landscape === undefined ? {} : { landscape: options.landscape })}
    />
  );
  const result = await renderWithServices(bar(options.modifiers ?? OFF), {
    ...(options.services === undefined ? {} : { services: options.services }),
  });
  return {
    onKey,
    onModifier,
    onText,
    onPaste,
    services: result.services,
    async rerender(modifiers) {
      await result.rerender(bar(modifiers));
    },
  };
}

const button = (name: string) => screen.getByRole("button", { name });

describe("KeyBar", () => {
  it("is a group labelled 'Special keys' with every key of §4.8 as a labelled button, and no arrows", async () => {
    await setup();
    expect(screen.getByLabelText("Special keys")).toBeOnTheScreen();
    for (const name of [
      "Escape",
      "Tab",
      "Shift, released",
      "Control, released",
      "Alt, released",
      "Function keys",
      "Paste",
      "Home",
      "End",
      "Page Up",
      "Page Down",
    ]) {
      expect(button(name)).toBeOnTheScreen();
    }
    expect(screen.getByText("Esc")).toBeOnTheScreen();
    expect(screen.getByText("PgDn")).toBeOnTheScreen();
    expect(screen.getByText("Fn")).toBeOnTheScreen();
    // The arrows live in the arrow pad.
    for (const name of ["Left arrow", "Down arrow", "Up arrow", "Right arrow"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("has two rows of 44 keys, 100 high: the fixed keys on top, the scrolling ones below", async () => {
    await setup();
    expect(StyleSheet.flatten(screen.getByTestId("keybar").props.style)).toMatchObject({
      height: size.keybarHeight,
    });
    expect(size.keybarHeight).toBe(100);
    const fixed = screen.getByTestId("keybar-row-fixed");
    const scrolling = screen.getByTestId("keybar-row-scroll");
    for (const id of ["esc", "tab", "shift", "ctrl", "alt", "fn", "paste"]) {
      expect(fixed).toContainElement(screen.getByTestId(`keybar-${id}`));
    }
    for (const id of ["home", "end", "pgup", "pgdn", "symbol-pipe"]) {
      expect(scrolling).toContainElement(screen.getByTestId(`keybar-${id}`));
    }
    // Row 1 shares the width: every key grows equally.
    expect(StyleSheet.flatten(screen.getByTestId("keybar-esc").props.style)).toMatchObject({ flex: 1 });
  });

  it("announces the armed and locked states, and shows them without color", async () => {
    const rig = await setup();
    expect(screen.queryByTestId("keybar-ctrl-lock")).toBeNull();

    await rig.rerender({ ctrl: "once", alt: "locked", shift: "once" });
    expect(button("Control, armed")).toBeOnTheScreen();
    expect(button("Alt, locked")).toBeOnTheScreen();
    expect(button("Shift, armed")).toBeOnTheScreen();

    const dark = palettes.dark;
    for (const id of ["ctrl", "alt", "shift"]) {
      expect(StyleSheet.flatten(screen.getByTestId(`keybar-${id}`).props.style)).toMatchObject({
        backgroundColor: dark.bgSelected,
        borderColor: dark.accent,
        borderWidth: 2,
      });
    }
    expect(StyleSheet.flatten(screen.getByText("Ctrl").props.style)).toMatchObject({
      textDecorationLine: "underline",
    });
    // Locked adds the lock; armed does not.
    expect(screen.getByTestId("keybar-alt-lock")).toBeOnTheScreen();
    expect(screen.queryByTestId("keybar-ctrl-lock")).toBeNull();

    await rig.rerender(OFF);
    expect(StyleSheet.flatten(screen.getByTestId("keybar-ctrl").props.style)).toMatchObject({
      backgroundColor: dark.bgKey,
    });
    expect(StyleSheet.flatten(screen.getByText("Ctrl").props.style).textDecorationLine).toBeUndefined();
  });

  it("speaks the states and the symbols in pt_BR", async () => {
    const services = createTestServices({ systemLocales: [{ languageCode: "pt", languageTag: "pt-BR" }] });
    await setup({ services, modifiers: { ctrl: "locked", alt: "off", shift: "off" } });
    expect(screen.getByLabelText("Teclas especiais")).toBeOnTheScreen();
    expect(button("Controle, travado")).toBeOnTheScreen();
    expect(button("Alt, solto")).toBeOnTheScreen();
    expect(button("Shift, solto")).toBeOnTheScreen();
    expect(button("Colar")).toBeOnTheScreen();
    expect(button("Barra vertical")).toBeOnTheScreen();
    expect(button("Barra invertida")).toBeOnTheScreen();
    expect(button("Crase")).toBeOnTheScreen();
  });

  it("taps a modifier through onModifier, never as a key", async () => {
    const rig = await setup();
    await fireEvent.press(button("Shift, released"));
    await fireEvent.press(button("Control, released"));
    await fireEvent.press(button("Alt, released"));
    expect(rig.onModifier.mock.calls).toEqual([["shift"], ["ctrl"], ["alt"]]);
    expect(rig.onKey).not.toHaveBeenCalled();
    expect(rig.onText).not.toHaveBeenCalled();
  });

  it("hands Esc to the controller like any key and leaves the armed modifier alone", async () => {
    const rig = await setup({ modifiers: { ctrl: "once", alt: "off", shift: "off" } });
    await fireEvent.press(button("Escape"));
    expect(rig.onKey.mock.calls).toEqual([["esc"]]);
    expect(rig.onModifier).not.toHaveBeenCalled();
    expect(button("Control, armed")).toBeOnTheScreen();
  });

  it("sends Tab and the navigation keys", async () => {
    const rig = await setup();
    for (const name of ["Tab", "Home", "End", "Page Up", "Page Down"]) {
      await fireEvent.press(button(name));
    }
    expect(rig.onKey.mock.calls).toEqual([["tab"], ["home"], ["end"], ["pgup"], ["pgdn"]]);
  });

  it("types a symbol as text, in the order of §4.8, and sends no named key", async () => {
    const rig = await setup();
    for (const name of [
      "Vertical bar",
      "Tilde",
      "Slash",
      "Backslash",
      "Hyphen",
      "Underscore",
      "Backtick",
    ]) {
      await fireEvent.press(button(name));
    }
    expect(rig.onText.mock.calls).toEqual([["|"], ["~"], ["/"], ["\\"], ["-"], ["_"], ["`"]]);
    expect(rig.onKey).not.toHaveBeenCalled();
    expect(rig.onModifier).not.toHaveBeenCalled();
    expect(screen.getByText("|")).toBeOnTheScreen();
    expect(screen.getByText("`")).toBeOnTheScreen();
  });

  it("Fn swaps row 2 for F1–F12 and sends nothing; 'Close F keys' goes back", async () => {
    const rig = await setup({ modifiers: { ctrl: "once", alt: "off", shift: "off" } });
    expect(button("Function keys").props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(button("Function keys"));
    expect(rig.onKey).not.toHaveBeenCalled();
    expect(rig.onModifier).not.toHaveBeenCalled();
    expect(button("Control, armed")).toBeOnTheScreen();

    for (let n = 1; n <= 12; n += 1) {
      expect(button(`F${n}`)).toBeOnTheScreen();
    }
    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Vertical bar" })).toBeNull();
    // Row 1 stays, and Fn looks on.
    expect(button("Escape")).toBeOnTheScreen();
    expect(button("Paste")).toBeOnTheScreen();
    expect(button("Function keys").props.accessibilityState).toMatchObject({ expanded: true });
    expect(StyleSheet.flatten(screen.getByTestId("keybar-fn").props.style)).toMatchObject({
      backgroundColor: palettes.dark.bgSelected,
      borderColor: palettes.dark.accent,
    });
    // Unlike a modifier, "on" has no underline.
    expect(StyleSheet.flatten(screen.getByText("Fn").props.style).textDecorationLine).toBeUndefined();

    await fireEvent.press(button("F5"));
    await fireEvent.press(button("F12"));
    expect(rig.onKey.mock.calls).toEqual([["f5"], ["f12"]]);

    await fireEvent.press(button("Close F keys"));
    expect(screen.queryByRole("button", { name: "F1" })).toBeNull();
    expect(button("Home")).toBeOnTheScreen();
    expect(button("Function keys").props.accessibilityState).toMatchObject({ expanded: false });
  });

  it("Fn closes the F keys when pressed again", async () => {
    await setup();
    await fireEvent.press(button("Function keys"));
    expect(button("F1")).toBeOnTheScreen();
    await fireEvent.press(button("Function keys"));
    expect(screen.queryByRole("button", { name: "F1" })).toBeNull();
    expect(button("Home")).toBeOnTheScreen();
  });

  it("Paste calls onPaste", async () => {
    const rig = await setup();
    await fireEvent.press(button("Paste"));
    expect(rig.onPaste).toHaveBeenCalledTimes(1);
    expect(rig.onKey).not.toHaveBeenCalled();
  });

  it("ticks on every key touch while the vibration setting is on", async () => {
    const rig = await setup();
    await fireEvent.press(button("Escape"));
    await fireEvent.press(button("Control, released"));
    await fireEvent.press(button("Vertical bar"));
    await fireEvent.press(button("Function keys"));
    await fireEvent.press(button("F1"));
    await fireEvent.press(button("Close F keys"));
    await fireEvent.press(button("Paste"));
    expect(rig.services.fakes.haptics.calls).toEqual(Array(7).fill("impact-light"));
  });

  it("never ticks with the vibration setting off", async () => {
    const services = createTestServices({ settings: { bellVibration: false } });
    const rig = await setup({ services });
    await fireEvent.press(button("Escape"));
    await fireEvent.press(button("Control, released"));
    await fireEvent.press(button("Paste"));
    await fireEvent.press(button("Tilde"));
    expect(rig.onKey.mock.calls).toEqual([["esc"]]);
    expect(rig.onText.mock.calls).toEqual([["~"]]);
    expect(rig.services.fakes.haptics.calls).toEqual([]);
  });

  it("shows the right-edge fade only while there are keys further right", async () => {
    await setup();
    expect(screen.queryByTestId("keybar-fade", { includeHiddenElements: true })).toBeNull();

    await fireEvent(screen.getByTestId("keybar-viewport"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 180, height: 44 } },
    });
    await fireEvent(screen.getByTestId("keybar-scroll"), "contentSizeChange", 500, 44);
    expect(screen.getByTestId("keybar-fade", { includeHiddenElements: true })).toBeTruthy();

    await fireEvent(screen.getByTestId("keybar-scroll"), "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 320, y: 0 } },
    });
    expect(screen.queryByTestId("keybar-fade", { includeHiddenElements: true })).toBeNull();

    await fireEvent(screen.getByTestId("keybar-scroll"), "scrollEndDrag", {
      nativeEvent: { contentOffset: { x: 100, y: 0 } },
    });
    expect(screen.getByTestId("keybar-fade", { includeHiddenElements: true })).toBeTruthy();
  });

  it("has no fade when every key fits", async () => {
    await setup();
    await fireEvent(screen.getByTestId("keybar-viewport"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 44 } },
    });
    await fireEvent(screen.getByTestId("keybar-scroll"), "contentSizeChange", 500, 44);
    expect(screen.queryByTestId("keybar-fade", { includeHiddenElements: true })).toBeNull();
  });

  it("goes back to the start of row 2 when Fn swaps it", async () => {
    await setup();
    await fireEvent(screen.getByTestId("keybar-viewport"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 180, height: 44 } },
    });
    await fireEvent(screen.getByTestId("keybar-scroll"), "contentSizeChange", 500, 44);
    await fireEvent(screen.getByTestId("keybar-scroll"), "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 320, y: 0 } },
    });
    expect(screen.queryByTestId("keybar-fade", { includeHiddenElements: true })).toBeNull();

    await fireEvent.press(button("Function keys"));
    // The scroll offset is back at 0: there is more to the right again.
    expect(screen.getByTestId("keybar-fade", { includeHiddenElements: true })).toBeTruthy();
  });

  describe("in landscape", () => {
    it("is a single row of 52 with the fixed keys, then the scrolling ones", async () => {
      await setup({ landscape: true });
      expect(StyleSheet.flatten(screen.getByTestId("keybar").props.style)).toMatchObject({
        height: size.keybarHeightLandscape,
      });
      expect(size.keybarHeightLandscape).toBe(52);
      expect(screen.queryByTestId("keybar-row-fixed")).toBeNull();
      for (const name of ["Escape", "Tab", "Function keys", "Paste", "Home", "Page Down", "Vertical bar"]) {
        expect(button(name)).toBeOnTheScreen();
      }
      // Fixed width keys: the row is wide, they do not stretch.
      expect(StyleSheet.flatten(screen.getByTestId("keybar-esc").props.style).flex).toBeUndefined();
    });

    it("keeps working: a key, a symbol and Fn", async () => {
      const rig = await setup({ landscape: true });
      await fireEvent.press(button("Escape"));
      await fireEvent.press(button("Slash"));
      await fireEvent.press(button("Function keys"));
      await fireEvent.press(button("F3"));
      expect(rig.onKey.mock.calls).toEqual([["esc"], ["f3"]]);
      expect(rig.onText.mock.calls).toEqual([["/"]]);
    });
  });
});
