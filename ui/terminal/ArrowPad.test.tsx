// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { StyleSheet, useColorScheme } from "react-native";

import type { KeyBarKeyId } from "@/input/keyBar";
import { type TestServices, createTestServices, renderWithServices } from "@ui/services/testing";
import { palettes, radius, size, spacing } from "@ui/theme";

import { ArrowPad } from "./ArrowPad";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

afterEach(() => {
  jest.useRealTimers();
});

type Rig = {
  readonly onKey: jest.Mock<void, [KeyBarKeyId]>;
  readonly services: TestServices;
};

async function setup(options: { services?: TestServices; landscape?: boolean } = {}): Promise<Rig> {
  const onKey = jest.fn<void, [KeyBarKeyId]>();
  const result = await renderWithServices(
    <ArrowPad onKey={onKey} {...(options.landscape === undefined ? {} : { landscape: options.landscape })} />,
    { ...(options.services === undefined ? {} : { services: options.services }) },
  );
  return { onKey, services: result.services };
}

const button = (name: string) => screen.getByRole("button", { name });

describe("ArrowPad", () => {
  it("is a group labelled 'Arrow keys' with the four arrows as labelled buttons", async () => {
    await setup();
    expect(screen.getByLabelText("Arrow keys")).toBeOnTheScreen();
    for (const name of ["Left arrow", "Down arrow", "Up arrow", "Right arrow"]) {
      expect(button(name)).toBeOnTheScreen();
    }
  });

  it("speaks pt_BR", async () => {
    const services = createTestServices({ systemLocales: [{ languageCode: "pt", languageTag: "pt-BR" }] });
    await setup({ services });
    expect(screen.getByLabelText("Setas")).toBeOnTheScreen();
    expect(button("Seta para cima")).toBeOnTheScreen();
    expect(button("Seta para a esquerda")).toBeOnTheScreen();
  });

  it("is an opaque panel stuck to the bottom right, with the top left corner rounded", async () => {
    await setup();
    const dark = palettes.dark;
    const pad = StyleSheet.flatten(screen.getByTestId("arrowpad").props.style);
    expect(pad).toMatchObject({
      position: "absolute",
      right: 0,
      bottom: 0,
      backgroundColor: dark.bgBar,
      borderColor: dark.borderRow,
      borderTopWidth: size.borderWidth,
      borderLeftWidth: size.borderWidth,
      borderTopLeftRadius: radius.control,
      padding: spacing.keyMargin,
      rowGap: spacing.keyGap,
    });
    // Opaque: no alpha on the fill, no shadow.
    expect(pad.backgroundColor).toBe(dark.bgBar);
    expect(pad.opacity).toBeUndefined();
    expect(pad.boxShadow).toBeUndefined();
  });

  it("draws an inverted T: the up arrow alone on top, the other three in a row below", async () => {
    await setup();
    const up = screen.getByTestId("arrowpad-up");
    const bottom = ["left", "down", "right"].map((id) => screen.getByTestId(`arrowpad-${id}`));
    // Up and the bottom row live in different rows.
    expect(up.parent).not.toBe(bottom[0]?.parent);
    expect(bottom[0]?.parent).toBe(bottom[1]?.parent);
    expect(bottom[1]?.parent).toBe(bottom[2]?.parent);
    expect(StyleSheet.flatten(screen.getByTestId("arrowpad-down").props.style)).toMatchObject({
      height: size.key,
    });
  });

  it("sends the arrow's key, with the armed modifiers added by the controller", async () => {
    const rig = await setup();
    await fireEvent.press(button("Up arrow"));
    await fireEvent.press(button("Left arrow"));
    await fireEvent.press(button("Down arrow"));
    await fireEvent.press(button("Right arrow"));
    expect(rig.onKey.mock.calls).toEqual([["up"], ["left"], ["down"], ["right"]]);
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

  it("never ticks with the vibration setting off", async () => {
    const services = createTestServices({ settings: { bellVibration: false } });
    const rig = await setup({ services });
    await fireEvent.press(button("Up arrow"));
    expect(rig.onKey.mock.calls).toEqual([["up"]]);
    expect(rig.services.fakes.haptics.calls).toEqual([]);
  });

  it("is one row of four in landscape", async () => {
    const rig = await setup({ landscape: true });
    const parents = ["left", "down", "up", "right"].map((id) => screen.getByTestId(`arrowpad-${id}`).parent);
    expect(new Set(parents).size).toBe(1);
    await fireEvent.press(button("Up arrow"));
    expect(rig.onKey.mock.calls).toEqual([["up"]]);
  });
});
