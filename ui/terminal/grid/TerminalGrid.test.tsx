// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { AccessibilityInfo } from "react-native";
import { GestureHandlerRootView, State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

import { t } from "@/i18n/catalog";
import { createZoomMemory, fitWidthFontSize, terminalMetrics } from "@/terminal/viewport";

import { size } from "../../theme";
import { type TerminalGridHandle, type TerminalGridState, TerminalGrid } from "./TerminalGrid";
import { GRID_GESTURE_IDS } from "./useGridGestures";
import { type FakeGridOptions, TEST_GRID_THEME, createFakeGridSession } from "./testing";

// The grid area: the frame width minus the left and right paddings.
const VIEW_WIDTH = 360 - 2 * size.gridPaddingX;

async function mount(options: FakeGridOptions = {}, props: { onTap?: () => void; theme?: typeof TEST_GRID_THEME | null } = {}) {
  const fake = createFakeGridSession({ cols: 80, rows: 24, ...options });
  const ref = createRef<TerminalGridHandle>();
  const states: TerminalGridState[] = [];
  const memory = createZoomMemory();
  const key = { desktopId: "d", hostInstance: "00", tabId: 1 };
  await render(
    <GestureHandlerRootView>
      <TerminalGrid
        ref={ref}
        session={fake}
        theme={props.theme === undefined ? TEST_GRID_THEME : props.theme}
        title="build"
        zoomKey={key}
        zoomMemory={memory}
        {...(props.onTap === undefined ? {} : { onTap: props.onTap })}
        onStateChange={(state) => states.push(state)}
      />
    </GestureHandlerRootView>,
  );
  await fireEvent(screen.getByTestId("terminal-grid"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 404 } },
  });
  return { fake, ref, states, memory, key };
}

describe("TerminalGrid", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("mounts the Skia canvas under one accessible element named after the tab", async () => {
    await mount();
    expect(screen.getByTestId("terminal-grid-canvas")).toBeTruthy();
    expect(screen.getByLabelText(t("terminal.grid", { title: "build" }))).toBeTruthy();
  });

  it("mounts before the desktop theme arrives", async () => {
    await mount({}, { theme: null });
    expect(screen.getByTestId("terminal-grid-canvas")).toBeTruthy();
  });

  it("asks for the history right above the screen once laid out", async () => {
    const { fake } = await mount({ history: 1000 });
    expect(fake.historyCalls.length).toBeGreaterThan(0);
    const [top, count] = fake.historyCalls[0] ?? [0, 0];
    expect(top - count + 1).toBe(0);
  });

  it("asks for the history at the top when a drag reaches it", async () => {
    const { fake, states } = await mount({ history: 1000 });
    fake.historyCalls.length = 0;
    await act(async () => {
      fireGestureHandler(getByGestureTestId(GRID_GESTURE_IDS.pan), [
        { state: State.BEGAN, translationX: 0, translationY: 0, changeX: 0, changeY: 0 },
        { state: State.ACTIVE, translationX: 0, translationY: 10, changeX: 0, changeY: 10 },
        { state: State.ACTIVE, translationX: 0, translationY: 100_000, changeX: 0, changeY: 99_990 },
        { state: State.END, translationX: 0, translationY: 100_000, velocityX: 0, velocityY: 0 },
      ]);
    });
    expect(fake.historyCalls.some(([top]) => top === 999)).toBe(true);
    expect(states[states.length - 1]?.atBottom).toBe(false);
    // Rows on screen wait for a page: the thin spinner shows.
    expect(screen.getByTestId("terminal-grid-history-spinner")).toBeTruthy();

    await act(async () => {
      while (fake.pending.length > 0) fake.answer();
    });
    expect(screen.queryByTestId("terminal-grid-history-spinner")).toBeNull();
  });

  it("calls onTap on a simple tap", async () => {
    const onTap = jest.fn();
    await mount({}, { onTap });
    await act(async () => {
      fireGestureHandler(getByGestureTestId(GRID_GESTURE_IDS.tap), [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }]);
    });
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("exposes the floating-button actions and their states", async () => {
    const { ref, states, fake, memory, key } = await mount({ cols: 120, cursor: { col: 110 } });
    expect(ref.current?.getState()).toMatchObject({ isFit: false, wide: true, atBottom: true, zoomPercent: Math.round((terminalMetrics.readFont / fitWidthFontSize(120, VIEW_WIDTH)) * 100) });

    await act(async () => {
      ref.current?.setFollowCursor(true);
    });
    expect(states[states.length - 1]?.followingCursor).toBe(true);

    await act(async () => {
      ref.current?.fitWidth();
    });
    expect(ref.current?.getState()).toMatchObject({ isFit: true, wide: false, zoomPercent: 100 });
    expect(memory.get(key)).toBeCloseTo(fitWidthFontSize(120, VIEW_WIDTH));
    expect(memory.get(key)).toBeLessThan(terminalMetrics.minFont);

    await act(async () => {
      fake.diff([[0, "x"]]);
      ref.current?.scrollToBottom();
    });
    expect(ref.current?.getState().atBottom).toBe(true);
  });

  it("gives the screen reader a summary of the last lines only when it is on", async () => {
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValueOnce(true);
    await mount({ lines: ["$ make", "", "cc -o app main.c", "done"] });
    const element = screen.getByLabelText(t("terminal.grid", { title: "build" }));
    expect(element.props.accessibilityValue).toEqual({ text: "$ make\ncc -o app main.c\ndone" });
  });

  it("gives no value without a screen reader", async () => {
    await mount({ lines: ["secret"] });
    const element = screen.getByLabelText(t("terminal.grid", { title: "build" }));
    expect(element.props.accessibilityValue).toBeUndefined();
  });
});
