// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react-native";
import { createRef, type ComponentRef } from "react";
import { type Pressable, StyleSheet, useColorScheme } from "react-native";

import { palettes } from "../theme/colors";
import { size } from "../theme/tokens";
import { Button } from "./Button";

const label = "Pair desktop";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

describe("Button", () => {
  it("is a button labelled by its text, and calls onPress", async () => {
    const onPress = jest.fn();
    await render(<Button label={label} onPress={onPress} testID="button" />);
    const button = screen.getByRole("button", { name: label });
    expect(screen.getByText(label)).toBeTruthy();
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button).toBeEnabled();
  });

  it("says its own accessibility label when given, and hands its ref", async () => {
    const ref = createRef<ComponentRef<typeof Pressable>>();
    await render(
      <Button label="Unlock" accessibilityLabel="Unlock the app" onPress={jest.fn()} ref={ref} testID="button" />,
    );
    expect(screen.getByRole("button", { name: "Unlock the app" })).toBe(screen.getByTestId("button"));
    expect(screen.getByText("Unlock")).toBeTruthy();
    expect(ref.current).not.toBeNull();
  });

  it("does not call onPress when disabled, and announces it", async () => {
    const onPress = jest.fn();
    await render(<Button label={label} onPress={onPress} disabled />);
    const button = screen.getByRole("button", { name: label });
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("shows a spinner in place of the label while loading, busy and not pressable", async () => {
    const onPress = jest.fn();
    await render(<Button label={label} onPress={onPress} loading testID="button" />);
    const button = screen.getByRole("button", { name: label });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId("button-spinner", { includeHiddenElements: true })).toBeTruthy();
    // The label keeps its place (the width does not jump) but is not drawn.
    const text = screen.getByText(label, { includeHiddenElements: true });
    expect(StyleSheet.flatten(text.props.style)).toMatchObject({ opacity: 0 });
  });

  it("paints each variant with its tokens", async () => {
    await render(
      <>
        <Button label="primary" onPress={jest.fn()} testID="primary" />
        <Button label="text" variant="text" onPress={jest.fn()} />
        <Button label="destructiveText" variant="destructiveText" onPress={jest.fn()} />
        <Button label="secondary" variant="secondary" onPress={jest.fn()} testID="secondary" />
      </>,
    );
    const dark = palettes.dark;
    expect(StyleSheet.flatten(screen.getByTestId("primary").props.style)).toMatchObject({
      backgroundColor: dark.primary,
      minHeight: size.buttonHeight,
    });
    expect(StyleSheet.flatten(screen.getByText("primary").props.style)).toMatchObject({ color: dark.onAccent });
    expect(StyleSheet.flatten(screen.getByText("text").props.style)).toMatchObject({ color: dark.accentText });
    expect(StyleSheet.flatten(screen.getByText("destructiveText").props.style)).toMatchObject({
      color: dark.destructive,
    });
    expect(StyleSheet.flatten(screen.getByTestId("secondary").props.style)).toMatchObject({
      borderColor: dark.borderRow,
      borderWidth: size.borderWidth,
    });
  });

  it("takes its width from a token", async () => {
    await render(<Button label={label} onPress={jest.fn()} width="wide" testID="button" />);
    expect(StyleSheet.flatten(screen.getByTestId("button").props.style)).toMatchObject({
      width: size.buttonWide,
    });
  });

  it("passes the accessibility hint", async () => {
    await render(
      <Button label="Remove" variant="destructiveText" onPress={jest.fn()} accessibilityHint="Destructive action" />,
    );
    expect(screen.getByRole("button", { name: "Remove" }).props.accessibilityHint).toBe("Destructive action");
  });
});
