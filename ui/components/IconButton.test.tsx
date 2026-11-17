// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { StyleSheet, useColorScheme, type HostInstance } from "react-native";

import { palettes } from "../theme/colors";
import { size } from "../theme/tokens";
import { IconButton } from "./IconButton";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

describe("IconButton", () => {
  it("is a labelled button with a 48 target", async () => {
    const onPress = jest.fn();
    await render(<IconButton icon="settings" accessibilityLabel="Settings" onPress={onPress} testID="settings" />);
    const button = screen.getByRole("button", { name: "Settings" });
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(screen.getByTestId("settings").props.style)).toMatchObject({
      width: size.targetMin,
      height: size.targetMin,
    });
  });

  it("uses the 44 floor in the key context", async () => {
    await render(
      <IconButton icon="clipboard-paste" role="key" target="key" accessibilityLabel="Paste" onPress={jest.fn()} testID="key" />,
    );
    expect(StyleSheet.flatten(screen.getByTestId("key").props.style)).toMatchObject({
      width: size.targetFloor,
      height: size.targetFloor,
    });
  });

  it("does not call onPress when disabled, and announces it", async () => {
    const onPress = jest.fn();
    await render(<IconButton icon="plus" accessibilityLabel="Pair desktop" onPress={onPress} disabled />);
    const button = screen.getByRole("button", { name: "Pair desktop" });
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("announces and paints the selected state", async () => {
    await render(
      <IconButton icon="keyboard" accessibilityLabel="Keyboard" onPress={jest.fn()} selected testID="keyboard" />,
    );
    expect(screen.getByRole("button", { name: "Keyboard" })).toBeSelected();
    expect(StyleSheet.flatten(screen.getByTestId("keyboard").props.style)).toMatchObject({
      backgroundColor: palettes.dark.bgSelected,
    });
  });

  it("hands its element to a ref, the focus origin of what it opens", async () => {
    const ref = createRef<HostInstance>();
    await render(<IconButton icon="plus" accessibilityLabel="Add" onPress={jest.fn()} ref={ref} testID="add" />);
    // The host view behind the testID (the test renderer's mocked View).
    expect((ref.current as unknown as { props: { testID?: string } } | null)?.props.testID).toBe("add");
  });
});
