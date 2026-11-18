// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { StyleSheet, useColorScheme } from "react-native";

import type { TerminalModifiers } from "@/controllers/terminalSession";
import { KEY_BAR_LAYOUT, type KeyBarKeyId, type KeyBarModifierId } from "@/input/keyBar";
import { type TestServices, createTestServices, renderWithServices } from "@ui/services/testing";
import { palettes, size } from "@ui/theme";

import { KeyBar } from "./KeyBar";

const OFF: TerminalModifiers = { ctrl: "off", alt: "off", shift: "off" };

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

afterEach(() => {
  jest.useRealTimers();
});

type Rig = {
  readonly onKey: jest.Mock<void, [KeyBarKeyId]>;
  readonly onModifier: jest.Mock<void, [KeyBarModifierId]>;
  readonly onReleaseModifier: jest.Mock<void, [KeyBarModifierId]>;
  readonly onPaste: jest.Mock<void, []>;
  readonly services: TestServices;
  rerender(modifiers: TerminalModifiers): Promise<void>;
};

async function setup(options: { modifiers?: TerminalModifiers; services?: TestServices } = {}): Promise<Rig> {
  const onKey = jest.fn<void, [KeyBarKeyId]>();
  const onModifier = jest.fn<void, [KeyBarModifierId]>();
  const onReleaseModifier = jest.fn<void, [KeyBarModifierId]>();
  const onPaste = jest.fn<void, []>();
  const bar = (modifiers: TerminalModifiers) => (
    <KeyBar
      modifiers={modifiers}
      onKey={onKey}
      onModifier={onModifier}
      onReleaseModifier={onReleaseModifier}
      onPaste={onPaste}
    />
  );
  const result = await renderWithServices(bar(options.modifiers ?? OFF), {
    ...(options.services === undefined ? {} : { services: options.services }),
  });
  return {
    onKey,
    onModifier,
    onReleaseModifier,
    onPaste,
    services: result.services,
    async rerender(modifiers) {
      await result.rerender(bar(modifiers));
    },
  };
}

const button = (name: string) => screen.getByRole("button", { name });

describe("KeyBar", () => {
  it("is a group labelled 'Special keys' with every key of §4.8 as a labelled button", async () => {
    await setup();
    expect(screen.getByLabelText("Special keys")).toBeOnTheScreen();
    for (const name of [
      "Escape",
      "Tab",
      "Shift, released",
      "Control, released",
      "Alt, released",
      "Left arrow",
      "Down arrow",
      "Up arrow",
      "Right arrow",
      "Home",
      "End",
      "Page Up",
      "Page Down",
      "Paste",
    ]) {
      expect(button(name)).toBeOnTheScreen();
    }
    for (let n = 1; n <= 12; n += 1) {
      expect(button(`F${n}`)).toBeOnTheScreen();
    }
    expect(screen.getByText("Esc")).toBeOnTheScreen();
    expect(screen.getByText("PgDn")).toBeOnTheScreen();
    expect(screen.getByText("F12")).toBeOnTheScreen();
    // No key opens the F keys, and there are no symbols.
    expect(screen.queryByRole("button", { name: "Function keys" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Vertical bar" })).toBeNull();
  });

  it("is a single row of 52, all of it inside the scroll view, in the order of the layout", async () => {
    await setup();
    expect(StyleSheet.flatten(screen.getByTestId("keybar").props.style)).toMatchObject({
      height: size.keybarHeight,
    });
    expect(size.keybarHeight).toBe(52);
    const scroll = screen.getByTestId("keybar-scroll");
    for (const id of KEY_BAR_LAYOUT) {
      expect(scroll).toContainElement(screen.getByTestId(`keybar-${id}`));
    }
    // Esc, Tab and the modifiers scroll too: no key is outside the scroll view.
    expect(screen.getAllByRole("button")).toHaveLength(KEY_BAR_LAYOUT.length);
    const order = screen
      .getAllByRole("button")
      .map((element) => String(element.props.testID).replace("keybar-", ""));
    expect(order).toEqual([...KEY_BAR_LAYOUT]);
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
      expect(StyleSheet.flatten(screen.getByTestId(`keybar-pinned-${id}`).props.style)).toMatchObject({
        backgroundColor: dark.bgSelected,
        borderColor: dark.accent,
        borderWidth: 2,
      });
    }
    expect(StyleSheet.flatten(screen.getByText("Ctrl").props.style)).toMatchObject({
      textDecorationLine: "underline",
    });
    // Locked adds the lock; armed does not.
    expect(screen.getByTestId("keybar-pinned-alt-lock")).toBeOnTheScreen();
    expect(screen.queryByTestId("keybar-pinned-ctrl-lock")).toBeNull();

    await rig.rerender(OFF);
    expect(StyleSheet.flatten(screen.getByTestId("keybar-ctrl").props.style)).toMatchObject({
      backgroundColor: dark.bgKey,
    });
    expect(StyleSheet.flatten(screen.getByText("Ctrl").props.style).textDecorationLine).toBeUndefined();
  });

  describe("a modifier that is on is pinned at the left", () => {
    it("pins nothing while every modifier is off", async () => {
      await setup();
      expect(screen.queryByTestId("keybar-pinned")).toBeNull();
    });

    it("moves an armed or locked modifier out of the scrolling row, to a group before it", async () => {
      const rig = await setup();
      await rig.rerender({ ctrl: "once", alt: "off", shift: "locked" });
      const pinned = screen.getByTestId("keybar-pinned");
      const scroll = screen.getByTestId("keybar-scroll");
      // In the order of the layout: Shift, then Ctrl.
      expect(pinned).toContainElement(screen.getByTestId("keybar-pinned-shift"));
      expect(pinned).toContainElement(screen.getByTestId("keybar-pinned-ctrl"));
      expect(screen.queryByTestId("keybar-pinned-alt")).toBeNull();
      // Outside the scroll view, so it stays in view wherever the row is scrolled.
      expect(scroll).not.toContainElement(screen.getByTestId("keybar-pinned-shift"));
      // Gone from the row, which keeps the others (Alt is off and stays in place).
      expect(screen.queryByTestId("keybar-shift")).toBeNull();
      expect(screen.queryByTestId("keybar-ctrl")).toBeNull();
      expect(scroll).toContainElement(screen.getByTestId("keybar-alt"));
      expect(screen.getAllByRole("button").map((e) => String(e.props.testID).replace("keybar-", ""))).toEqual([
        "pinned-shift",
        "pinned-ctrl",
        "esc",
        "tab",
        "alt",
        ...KEY_BAR_LAYOUT.slice(5),
      ]);
    });

    it("puts the key back in its place when it is turned off", async () => {
      const rig = await setup({ modifiers: { ctrl: "locked", alt: "off", shift: "off" } });
      expect(screen.queryByTestId("keybar-ctrl")).toBeNull();
      await rig.rerender(OFF);
      expect(screen.queryByTestId("keybar-pinned")).toBeNull();
      expect(screen.getByTestId("keybar-scroll")).toContainElement(screen.getByTestId("keybar-ctrl"));
    });

    it("turns the modifier off with one tap, armed or locked, through onReleaseModifier", async () => {
      const rig = await setup({ modifiers: { ctrl: "once", alt: "locked", shift: "off" } });
      await fireEvent.press(button("Control, armed"));
      await fireEvent.press(button("Alt, locked"));
      expect(rig.onReleaseModifier.mock.calls).toEqual([["ctrl"], ["alt"]]);
      // Not the cycle of the tap: nothing goes through onModifier.
      expect(rig.onModifier).not.toHaveBeenCalled();
      expect(rig.onKey).not.toHaveBeenCalled();
    });

    it("still cycles from the scrolling row: a tap on the key of the row goes through onModifier", async () => {
      const rig = await setup({ modifiers: { ctrl: "off", alt: "off", shift: "once" } });
      await fireEvent.press(button("Control, released"));
      expect(rig.onModifier.mock.calls).toEqual([["ctrl"]]);
      expect(rig.onReleaseModifier).not.toHaveBeenCalled();
    });

    it("tells the screen reader how to release it, and ticks on the tap", async () => {
      const rig = await setup({ modifiers: { ctrl: "once", alt: "off", shift: "off" } });
      expect(button("Control, armed").props.accessibilityHint).toBe("Tap to release");
      expect(button("Escape").props.accessibilityHint).toBeUndefined();
      await fireEvent.press(button("Control, armed"));
      expect(rig.services.fakes.haptics.calls).toEqual(["impact-light"]);
    });

    it("says it in pt_BR", async () => {
      const services = createTestServices({ systemLocales: [{ languageCode: "pt", languageTag: "pt-BR" }] });
      await setup({ services, modifiers: { ctrl: "once", alt: "off", shift: "off" } });
      expect(button("Controle, armado").props.accessibilityHint).toBe("Toque para soltar");
    });
  });

  it("speaks the states in pt_BR", async () => {
    const services = createTestServices({ systemLocales: [{ languageCode: "pt", languageTag: "pt-BR" }] });
    await setup({ services, modifiers: { ctrl: "locked", alt: "off", shift: "off" } });
    expect(screen.getByLabelText("Teclas especiais")).toBeOnTheScreen();
    expect(button("Controle, travado")).toBeOnTheScreen();
    expect(button("Alt, solto")).toBeOnTheScreen();
    expect(button("Shift, solto")).toBeOnTheScreen();
    expect(button("Seta para cima")).toBeOnTheScreen();
    expect(button("Colar")).toBeOnTheScreen();
  });

  it("taps a modifier through onModifier, never as a key", async () => {
    const rig = await setup();
    await fireEvent.press(button("Shift, released"));
    await fireEvent.press(button("Control, released"));
    await fireEvent.press(button("Alt, released"));
    expect(rig.onModifier.mock.calls).toEqual([["shift"], ["ctrl"], ["alt"]]);
    expect(rig.onKey).not.toHaveBeenCalled();
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

  it("sends F1 to F12 as named keys, with no key to open them", async () => {
    const rig = await setup();
    await fireEvent.press(button("F1"));
    await fireEvent.press(button("F5"));
    await fireEvent.press(button("F12"));
    expect(rig.onKey.mock.calls).toEqual([["f1"], ["f5"], ["f12"]]);
  });

  it("Paste calls onPaste", async () => {
    const rig = await setup();
    await fireEvent.press(button("Paste"));
    expect(rig.onPaste).toHaveBeenCalledTimes(1);
    expect(rig.onKey).not.toHaveBeenCalled();
  });

  it("repeats a held arrow: 400 ms, then every 80 ms, with one haptic tick per touch", async () => {
    const rig = await setup();
    jest.useFakeTimers();
    const up = button("Up arrow");
    await fireEvent(up, "pressIn");
    expect(rig.onKey.mock.calls).toEqual([["up"]]);
    await act(() => {
      jest.advanceTimersByTime(399);
    });
    expect(rig.onKey).toHaveBeenCalledTimes(1);
    await act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(rig.onKey).toHaveBeenCalledTimes(2);
    await act(() => {
      jest.advanceTimersByTime(80 * 3);
    });
    expect(rig.onKey).toHaveBeenCalledTimes(5);
    await fireEvent(up, "pressOut");
    await fireEvent.press(up);
    await act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(rig.onKey).toHaveBeenCalledTimes(5);
    expect(rig.onKey.mock.calls.every(([id]) => id === "up")).toBe(true);
    expect(rig.services.fakes.haptics.calls).toEqual(["impact-light"]);
  });

  it("an arrow activated by a screen reader (no touch) sends once", async () => {
    const rig = await setup();
    await fireEvent.press(button("Left arrow"));
    await fireEvent.press(button("Right arrow"));
    await fireEvent.press(button("Down arrow"));
    expect(rig.onKey.mock.calls).toEqual([["left"], ["right"], ["down"]]);
  });

  it("ticks on every key touch while the vibration setting is on", async () => {
    const rig = await setup();
    await fireEvent.press(button("Escape"));
    await fireEvent.press(button("Control, released"));
    await fireEvent.press(button("F1"));
    await fireEvent.press(button("Paste"));
    expect(rig.services.fakes.haptics.calls).toEqual(Array(4).fill("impact-light"));
  });

  it("never ticks with the vibration setting off", async () => {
    const services = createTestServices({ settings: { bellVibration: false } });
    const rig = await setup({ services });
    await fireEvent.press(button("Escape"));
    await fireEvent.press(button("Control, released"));
    await fireEvent.press(button("Paste"));
    await fireEvent.press(button("Up arrow"));
    expect(rig.onKey.mock.calls).toEqual([["esc"], ["up"]]);
    expect(rig.services.fakes.haptics.calls).toEqual([]);
  });

  it("shows the right-edge fade only while there are keys further right", async () => {
    await setup();
    expect(screen.queryByTestId("keybar-fade", { includeHiddenElements: true })).toBeNull();

    await fireEvent(screen.getByTestId("keybar-viewport"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 51 } },
    });
    await fireEvent(screen.getByTestId("keybar-scroll"), "contentSizeChange", 1400, 44);
    expect(screen.getByTestId("keybar-fade", { includeHiddenElements: true })).toBeTruthy();

    await fireEvent(screen.getByTestId("keybar-scroll"), "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 1040, y: 0 } },
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
      nativeEvent: { layout: { x: 0, y: 0, width: 1500, height: 51 } },
    });
    await fireEvent(screen.getByTestId("keybar-scroll"), "contentSizeChange", 1400, 44);
    expect(screen.queryByTestId("keybar-fade", { includeHiddenElements: true })).toBeNull();
  });
});
