// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet, useColorScheme } from "react-native";

import { t } from "@/i18n/catalog";
import { PaneState } from "@/protocol";
import { duration, size, ThemeProvider } from "@ui/theme";

import { TerminalBar, type TerminalBarProps } from "./TerminalBar";

const hidden = { includeHiddenElements: true } as const;

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** The testID of the element a callback handed as the focus origin. */
function originId(mock: jest.Mock): string | undefined {
  const origin = mock.mock.calls.at(-1)?.[0] as { current: { props?: { testID?: string } } | null } | undefined;
  return origin?.current?.props?.testID;
}

type Callbacks = Pick<TerminalBarProps, "onBack" | "onPanePicker" | "onToggleKeyboard" | "onTabMenu">;

function props(over: Partial<TerminalBarProps> = {}): TerminalBarProps & { [K in keyof Callbacks]: jest.Mock } {
  return {
    title: "build",
    detail: "~/projetos/app",
    paneState: PaneState.running,
    exitCode: null,
    paneIndex: 1,
    paneCount: 1,
    keyboardVisible: false,
    keyboardAvailable: true,
    onBack: jest.fn(),
    onPanePicker: jest.fn(),
    onToggleKeyboard: jest.fn(),
    onTabMenu: jest.fn(),
    ...over,
  } as TerminalBarProps & { [K in keyof Callbacks]: jest.Mock };
}

async function renderBar(over: Partial<TerminalBarProps> = {}) {
  const p = props(over);
  const result = await render(
    <ThemeProvider>
      <TerminalBar {...p} />
    </ThemeProvider>,
  );
  return {
    ...p,
    async rerender(next: Partial<TerminalBarProps>) {
      await result.rerender(
        <ThemeProvider>
          <TerminalBar {...p} {...next} />
        </ThemeProvider>,
      );
    },
  };
}

describe("TerminalBar", () => {
  it("shows the title as a header, line 2 in mono and the labelled buttons", async () => {
    const bar = await renderBar();
    expect(screen.getByRole("header", { name: "build" })).toBeOnTheScreen();
    expect(screen.getByTestId("terminal-bar-detail")).toHaveTextContent("~/projetos/app");
    await fireEvent.press(screen.getByRole("button", { name: t("terminal.back") }));
    expect(bar.onBack).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: t("workspace.tab_menu") }));
    expect(bar.onTabMenu).toHaveBeenCalledTimes(1);
    // The button hands itself: the menu gives the focus back to it (§5).
    expect(originId(bar.onTabMenu)).toBe("terminal-bar-menu");
    await fireEvent.press(screen.getByRole("button", { name: t("terminal.show_keyboard") }));
    expect(bar.onToggleKeyboard).toHaveBeenCalledTimes(1);
  });

  it("is 48 high, and 40 in landscape", async () => {
    const bar = await renderBar();
    expect(screen.getByTestId("terminal-bar")).toHaveStyle({ height: size.terminalBarHeight });
    await bar.rerender({ landscape: true });
    expect(screen.getByTestId("terminal-bar")).toHaveStyle({ height: size.terminalBarHeightLandscape });
  });

  it("has no pane chip with one pane, and a 'Pane 2 of 3' chip that opens the picker with more", async () => {
    const bar = await renderBar();
    expect(screen.queryByTestId("terminal-bar-panes")).toBeNull();
    await bar.rerender({ paneIndex: 2, paneCount: 3 });
    const chip = screen.getByRole("button", { name: t("terminal.pane_chip_a11y", { index: 2, total: 3 }) });
    expect(screen.getByText("2/3")).toBeOnTheScreen();
    expect(chip).toHaveStyle({ minWidth: size.targetMin, height: size.targetMin });
    await fireEvent.press(chip);
    expect(bar.onPanePicker).toHaveBeenCalledTimes(1);
    expect(originId(bar.onPanePicker)).toBe("terminal-bar-panes");
  });

  it("names the keyboard button by what it does, and disables it with the reason when input cannot go", async () => {
    const bar = await renderBar({ keyboardVisible: true });
    expect(screen.getByRole("button", { name: t("terminal.hide_keyboard") })).toBeEnabled();
    await bar.rerender({ keyboardVisible: false, keyboardAvailable: false, paneState: PaneState.exited, exitCode: 0 });
    const button = screen.getByRole("button", { name: t("terminal.keyboard_unavailable") });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(bar.onToggleKeyboard).not.toHaveBeenCalled();
  });

  it("shows a state chip only when the pane is not running", async () => {
    const bar = await renderBar();
    expect(screen.queryByTestId("terminal-bar-state")).toBeNull();
    await bar.rerender({ paneState: PaneState.exited, exitCode: 2 });
    expect(screen.getByTestId("terminal-bar-state")).toHaveTextContent(t("workspace.tab_state.exited", { code: 2 }));
    await bar.rerender({ paneState: PaneState.connecting });
    expect(screen.getByTestId("terminal-bar-state")).toHaveTextContent(t("workspace.tab_state.connecting"));
    expect(screen.getByTestId("terminal-bar-state-spinner", hidden)).toBeOnTheScreen();
    await bar.rerender({ paneState: PaneState.awaitingDesktop, detail: null });
    expect(screen.queryByTestId("terminal-bar-detail")).toBeNull();
    expect(screen.getByTestId("terminal-bar-state")).toHaveTextContent(t("workspace.tab_state.awaiting_desktop"));
  });

  it("lights the bell for 2 s at every bell, not at the first render", async () => {
    jest.useFakeTimers();
    const bar = await renderBar({ bellSignal: 3 });
    expect(screen.queryByTestId("terminal-bar-bell")).toBeNull();
    await bar.rerender({ bellSignal: 4 });
    expect(screen.getByLabelText(t("terminal.bell"))).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(duration.bell - 1);
    });
    expect(screen.getByTestId("terminal-bar-bell")).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId("terminal-bar-bell")).toBeNull();
  });

  it("fades the bell out over the 2 s without reduce motion", async () => {
    jest.useFakeTimers();
    const bar = await renderBar({ bellSignal: 0 });
    await bar.rerender({ bellSignal: 1 });
    const bell = screen.getByTestId("terminal-bar-bell");
    expect(bell).toHaveAnimatedStyle({ opacity: 1 });
    await act(async () => {
      jest.advanceTimersByTime(duration.bell / 2);
    });
    expect(bell).not.toHaveAnimatedStyle({ opacity: 1 });
  });

  it("restarts the 2 s when the bell rings again while lit", async () => {
    jest.useFakeTimers();
    const bar = await renderBar({ bellSignal: 0 });
    await bar.rerender({ bellSignal: 1 });
    await act(async () => {
      jest.advanceTimersByTime(duration.bell / 2);
    });
    await bar.rerender({ bellSignal: 2 });
    await act(async () => {
      jest.advanceTimersByTime(duration.bell - 1);
    });
    expect(screen.getByTestId("terminal-bar-bell")).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId("terminal-bar-bell")).toBeNull();
  });

  it("keeps the bell steady, with no fade, when the system reduces motion", async () => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const bar = await renderBar({ bellSignal: 0 });
    await act(async () => {
      await Promise.resolve();
    });
    await bar.rerender({ bellSignal: 1 });
    await act(async () => {
      jest.advanceTimersByTime(duration.bell / 2);
    });
    // No fade: the bell keeps no animated opacity.
    expect(StyleSheet.flatten(screen.getByTestId("terminal-bar-bell").props.style)?.opacity).toBeUndefined();
    await act(async () => {
      jest.advanceTimersByTime(duration.bell / 2);
    });
    expect(screen.queryByTestId("terminal-bar-bell")).toBeNull();
  });
});
