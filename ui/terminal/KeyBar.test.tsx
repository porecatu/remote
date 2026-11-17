// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { StyleSheet, useColorScheme } from "react-native";

import type { TerminalModifiers } from "@/controllers/terminalSession";
import type { KeyBarKeyId, KeyBarModifierId } from "@/input/keyBar";
import { type TestServices, createTestServices, renderWithServices } from "@ui/services/testing";
import { palettes } from "@ui/theme";

import { KeyBar } from "./KeyBar";

const OFF: TerminalModifiers = { ctrl: "off", alt: "off" };

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

afterEach(() => {
  jest.useRealTimers();
});

type Rig = {
  readonly onKey: jest.Mock<void, [KeyBarKeyId]>;
  readonly onModifier: jest.Mock<void, [KeyBarModifierId]>;
  readonly onPaste: jest.Mock<void, []>;
  readonly services: TestServices;
  rerender(modifiers: TerminalModifiers): Promise<void>;
};

async function setup(
  options: { modifiers?: TerminalModifiers; services?: TestServices } = {},
): Promise<Rig> {
  const onKey = jest.fn<void, [KeyBarKeyId]>();
  const onModifier = jest.fn<void, [KeyBarModifierId]>();
  const onPaste = jest.fn<void, []>();
  const bar = (modifiers: TerminalModifiers) => (
    <KeyBar modifiers={modifiers} onKey={onKey} onModifier={onModifier} onPaste={onPaste} />
  );
  const result = await renderWithServices(bar(options.modifiers ?? OFF), {
    ...(options.services === undefined ? {} : { services: options.services }),
  });
  return {
    onKey,
    onModifier,
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
      "Function keys",
      "Paste",
    ]) {
      expect(button(name)).toBeOnTheScreen();
    }
    expect(screen.getByText("Esc")).toBeOnTheScreen();
    expect(screen.getByText("PgDn")).toBeOnTheScreen();
    expect(screen.getByText("Fn")).toBeOnTheScreen();
  });

  it("announces the armed and locked states, and shows them without color", async () => {
    const rig = await setup();
    expect(screen.queryByTestId("keybar-ctrl-lock")).toBeNull();

    await rig.rerender({ ctrl: "once", alt: "locked" });
    expect(button("Control, armed")).toBeOnTheScreen();
    expect(button("Alt, locked")).toBeOnTheScreen();

    const dark = palettes.dark;
    for (const id of ["ctrl", "alt"]) {
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

  it("speaks the states in pt_BR", async () => {
    const services = createTestServices({ systemLocales: [{ languageCode: "pt", languageTag: "pt-BR" }] });
    await setup({ services, modifiers: { ctrl: "locked", alt: "off" } });
    expect(screen.getByLabelText("Teclas especiais")).toBeOnTheScreen();
    expect(button("Controle, travado")).toBeOnTheScreen();
    expect(button("Alt, solto")).toBeOnTheScreen();
    expect(button("Seta para cima")).toBeOnTheScreen();
    expect(button("Colar")).toBeOnTheScreen();
  });

  it("taps a modifier through onModifier, never as a key", async () => {
    const rig = await setup();
    await fireEvent.press(button("Control, released"));
    await fireEvent.press(button("Alt, released"));
    expect(rig.onModifier.mock.calls).toEqual([["ctrl"], ["alt"]]);
    expect(rig.onKey).not.toHaveBeenCalled();
  });

  it("hands Esc to the controller like any key and leaves the armed modifier alone", async () => {
    const rig = await setup({ modifiers: { ctrl: "once", alt: "off" } });
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

  it("Fn swaps the scrolling keys for F1–F12 and sends nothing; 'Close F keys' goes back", async () => {
    const rig = await setup({ modifiers: { ctrl: "once", alt: "off" } });
    await fireEvent.press(button("Function keys"));
    expect(rig.onKey).not.toHaveBeenCalled();
    expect(rig.onModifier).not.toHaveBeenCalled();
    expect(button("Control, armed")).toBeOnTheScreen();

    for (let n = 1; n <= 12; n += 1) {
      expect(button(`F${n}`)).toBeOnTheScreen();
    }
    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Paste" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Function keys" })).toBeNull();
    // The fixed keys and the arrows stay.
    expect(button("Escape")).toBeOnTheScreen();
    expect(button("Up arrow")).toBeOnTheScreen();

    await fireEvent.press(button("F5"));
    await fireEvent.press(button("F12"));
    expect(rig.onKey.mock.calls).toEqual([["f5"], ["f12"]]);

    await fireEvent.press(button("Close F keys"));
    expect(screen.queryByRole("button", { name: "F1" })).toBeNull();
    expect(button("Home")).toBeOnTheScreen();
    expect(button("Function keys")).toBeOnTheScreen();
    expect(button("Paste")).toBeOnTheScreen();
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
    await fireEvent.press(button("Function keys"));
    await fireEvent.press(button("F1"));
    await fireEvent.press(button("Close F keys"));
    await fireEvent.press(button("Paste"));
    expect(rig.services.fakes.haptics.calls).toEqual(Array(6).fill("impact-light"));
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
      nativeEvent: { layout: { x: 0, y: 0, width: 180, height: 51 } },
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

  it("has no fade when every key fits (landscape)", async () => {
    await setup();
    await fireEvent(screen.getByTestId("keybar-viewport"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 51 } },
    });
    await fireEvent(screen.getByTestId("keybar-scroll"), "contentSizeChange", 500, 44);
    expect(screen.queryByTestId("keybar-fade", { includeHiddenElements: true })).toBeNull();
  });
});
