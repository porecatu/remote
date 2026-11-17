// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Platform, StyleSheet, useColorScheme } from "react-native";

import { palettes } from "../theme/colors";
import { size } from "../theme/tokens";
import { Banner } from "./Banner";

const announce = jest.mocked(AccessibilityInfo.announceForAccessibilityWithOptions);

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
  announce.mockClear();
});

describe("Banner", () => {
  it("is a polite live region with the message", async () => {
    await render(<Banner tone="neutral" message="Updating…" testID="banner" />);
    const banner = screen.getByTestId("banner");
    expect(banner.props.accessibilityLiveRegion).toBe("polite");
    expect(screen.getByText("Updating…")).toBeTruthy();
    expect(StyleSheet.flatten(banner.props.style)).toMatchObject({
      minHeight: size.bannerHeight,
      backgroundColor: palettes.dark.bgSheet,
    });
  });

  it("queues the message for the screen reader on iOS, again when it changes", async () => {
    const view = await render(<Banner tone="info" message="Reconnecting… attempt 1 of 5" busy />);
    if (Platform.OS === "ios") {
      expect(announce).toHaveBeenLastCalledWith("Reconnecting… attempt 1 of 5", { queue: true });
      await view.rerender(<Banner tone="info" message="Reconnecting… attempt 2 of 5" busy />);
      expect(announce).toHaveBeenLastCalledWith("Reconnecting… attempt 2 of 5", { queue: true });
      expect(announce).toHaveBeenCalledTimes(2);
    } else {
      expect(announce).not.toHaveBeenCalled();
    }
  });

  it("shows a spinner while busy", async () => {
    await render(<Banner tone="info" message="Reconnecting…" busy testID="banner" />);
    expect(screen.getByTestId("banner-spinner", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("banner-icon", { includeHiddenElements: true })).toBeNull();
  });

  it("colors the icon and the text by tone", async () => {
    await render(<Banner tone="warning" icon="wifi-off" message="No connection." testID="banner" />);
    const icon = screen.getByTestId("banner-icon", { includeHiddenElements: true });
    expect(icon.props.stroke).toBe(palettes.dark.warning);
    expect(StyleSheet.flatten(screen.getByText("No connection.").props.style)).toMatchObject({
      color: palettes.dark.warningText,
    });
  });

  it("offers its text action as a labelled button", async () => {
    const onPress = jest.fn();
    await render(
      <Banner
        tone="warning"
        icon="wifi-off"
        message="No connection to the desktop."
        action={{ label: "Try again", onPress }}
      />,
    );
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
