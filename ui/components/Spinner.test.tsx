// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, useColorScheme } from "react-native";

import { palettes } from "../theme/colors";
import { ThemeProvider } from "../theme/ThemeProvider";
import { duration, icon } from "../theme/tokens";
import { Spinner } from "./Spinner";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Spinner", () => {
  it("draws loader-circle in accent at the spinner size", async () => {
    await render(<Spinner testID="spinner" />);
    const root = screen.getByTestId("spinner", { includeHiddenElements: true });
    expect(root).toBeTruthy();
    const rotor = screen.getByTestId("spinner-rotor", { includeHiddenElements: true });
    expect(rotor).toHaveAnimatedStyle({ width: icon.spinner.size, height: icon.spinner.size });
    const glyph = screen.getByTestId("spinner-icon", { includeHiddenElements: true });
    expect(glyph.props.stroke).toBe(palettes.dark.accent);
    expect(glyph.props.width).toBe(icon.spinner.size);
  });

  it("turns once per duration.spinner, linearly", async () => {
    await render(<Spinner testID="spinner" />);
    const rotor = screen.getByTestId("spinner-rotor", { includeHiddenElements: true });
    await act(async () => {
      jest.advanceTimersByTime(duration.spinner / 2);
    });
    expect(rotor).toHaveAnimatedStyle({ transform: [{ rotate: "180deg" }] });
  });

  it("keeps turning with reduce motion on (anatomy §2.9, §5 item 6)", async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValueOnce(true);
    await render(
      <ThemeProvider>
        <Spinner testID="spinner" />
      </ThemeProvider>,
    );
    const rotor = screen.getByTestId("spinner-rotor", { includeHiddenElements: true });
    await act(async () => {
      jest.advanceTimersByTime(duration.spinner / 4);
    });
    expect(rotor).toHaveAnimatedStyle({ transform: [{ rotate: "90deg" }] });
  });

  it("is hidden from the screen reader without a label", async () => {
    await render(<Spinner testID="spinner" />);
    expect(screen.queryByTestId("spinner")).toBeNull();
  });

  it("is a busy progress indicator with a label", async () => {
    await render(<Spinner accessibilityLabel="Connecting…" />);
    const spinner = screen.getByRole("progressbar", { name: "Connecting…" });
    expect(spinner).toBeBusy();
  });
});
