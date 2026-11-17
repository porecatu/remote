// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, useColorScheme } from "react-native";

import { palettes } from "../theme/colors";
import { barMaxFontScale, size, spacing } from "../theme/tokens";
import { ScreenBar } from "./ScreenBar";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

describe("ScreenBar", () => {
  it("shows the title as a header, capped at the bar font scale", async () => {
    await render(<ScreenBar title="Desktops" testID="bar" />);
    const title = screen.getByRole("header", { name: "Desktops" });
    expect(title.props.maxFontSizeMultiplier).toBe(barMaxFontScale);
    expect(StyleSheet.flatten(screen.getByTestId("bar").props.style)).toMatchObject({
      minHeight: size.barHeight,
      paddingLeft: spacing.barTitleInset,
      backgroundColor: palettes.dark.bgBar,
    });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("calls onBack from the labelled back arrow", async () => {
    const onBack = jest.fn();
    await render(
      <ScreenBar title="Home" back={{ onPress: onBack, accessibilityLabel: "Back to desktops" }} testID="bar" />,
    );
    fireEvent.press(screen.getByRole("button", { name: "Back to desktops" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(screen.getByTestId("bar").props.style)).toMatchObject({
      paddingLeft: spacing.barPaddingX,
    });
  });

  it("puts a labelled x on the left of a screen that closes", async () => {
    const onClose = jest.fn();
    await render(<ScreenBar title="Pair with Home" close={{ onPress: onClose, accessibilityLabel: "Cancel" }} testID="bar" />);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("bar-close")).toBeTruthy();
    expect(screen.queryByTestId("bar-back")).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId("bar").props.style)).toMatchObject({
      paddingLeft: spacing.barPaddingX,
      paddingRight: spacing.barTitleInset,
    });
    expect(screen.getByRole("header", { name: "Pair with Home" })).toBeTruthy();
  });

  it("shows the support line with an optional status dot", async () => {
    await render(<ScreenBar title="Home" subtitle={{ text: "Connected", dot: "success" }} testID="bar" />);
    const support = screen.getByText("Connected");
    expect(support.props.maxFontSizeMultiplier).toBe(barMaxFontScale);
    const dot = screen.getByTestId("bar-dot", { includeHiddenElements: true });
    expect(StyleSheet.flatten(dot.props.style)).toMatchObject({
      width: size.dot,
      backgroundColor: palettes.dark.success,
    });
    expect(screen.queryByTestId("bar-dot")).toBeNull();
  });

  it("has no dot without a dot color", async () => {
    await render(<ScreenBar title="Home" subtitle={{ text: "Reconnecting…" }} testID="bar" />);
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
    expect(screen.queryByTestId("bar-dot", { includeHiddenElements: true })).toBeNull();
  });

  it("renders the actions as labelled icon buttons", async () => {
    const pair = jest.fn();
    const settings = jest.fn();
    await render(
      <ScreenBar
        title="Desktops"
        actions={[
          { icon: "plus", accessibilityLabel: "Pair desktop", onPress: pair },
          { icon: "settings", accessibilityLabel: "Settings", onPress: settings, disabled: true },
        ]}
      />,
    );
    fireEvent.press(screen.getByRole("button", { name: "Pair desktop" }));
    expect(pair).toHaveBeenCalledTimes(1);
    const disabled = screen.getByRole("button", { name: "Settings" });
    expect(disabled).toBeDisabled();
    fireEvent.press(disabled);
    expect(settings).not.toHaveBeenCalled();
  });
});
