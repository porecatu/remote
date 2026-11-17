// SPDX-License-Identifier: GPL-3.0-or-later
import { terminal } from "../../ui/theme/tokens";
import {
  AXIS_DECIDE_DISTANCE,
  AXIS_DIAGONAL_DISTANCE,
  anchorScrollOnHistoryGrowth,
  axisLock,
  axisLockMove,
  axisLockStart,
  bottomScrollTop,
  canScroll,
  cellMetrics,
  clampFontSize,
  clampScroll,
  contentSize,
  createZoomMemory,
  fitWidthFontSize,
  followCursorScrollX,
  fontRange,
  initialZoom,
  isAtBottom,
  isFitWidth,
  lockedDelta,
  rescaleOnResize,
  scrollTopAfterHistoryChange,
  terminalMetrics,
  zoomPercent,
  type AxisLockState,
} from "./viewport";

describe("terminal metrics", () => {
  it("mirrors the terminal tokens of ui/theme (anatomy §2.5)", () => {
    expect(terminalMetrics).toEqual(terminal);
  });

  it("makes a cell 0.5 em wide and a row 1.3 of the font tall", () => {
    expect(cellMetrics(10)).toEqual({ cellWidth: 5, lineHeight: 13 });
    expect(cellMetrics(12).lineHeight).toBeCloseTo(15.6);
  });
});

describe("fit the width and the opening zoom (RF-3.7)", () => {
  it("uses 2·L / cols", () => {
    expect(fitWidthFontSize(80, 360)).toBe(9);
    expect(fitWidthFontSize(90, 360)).toBe(8);
    expect(fitWidthFontSize(120, 360)).toBe(6);
  });

  it("is 0 before the layout or without columns", () => {
    expect(fitWidthFontSize(80, 0)).toBe(0);
    expect(fitWidthFontSize(0, 360)).toBe(0);
  });

  it("opens fitting the width down to 8 pt (anatomy §4.7 examples at 360)", () => {
    expect(initialZoom(80, 360)).toEqual({ fontSize: 9, mode: "fit" });
    expect(initialZoom(90, 360)).toEqual({ fontSize: 8, mode: "fit" });
  });

  it("opens in the 12 pt reading size below 8 pt", () => {
    expect(initialZoom(91, 360).mode).toBe("read");
    expect(initialZoom(120, 360)).toEqual({ fontSize: 12, mode: "read" });
  });

  it("caps a narrow grid at 24 pt", () => {
    expect(initialZoom(20, 360)).toEqual({ fontSize: 24, mode: "fit" });
  });
});

describe("pinch limits", () => {
  it("goes from fit to 24 pt", () => {
    expect(fontRange(80, 360)).toEqual({ min: 9, max: 24 });
    expect(clampFontSize(5, 80, 360)).toBe(9);
    expect(clampFontSize(15, 80, 360)).toBe(15);
    expect(clampFontSize(40, 80, 360)).toBe(24);
  });

  it("keeps fit as the floor of a grid that opens in reading size", () => {
    expect(fontRange(120, 360)).toEqual({ min: 6, max: 24 });
    expect(clampFontSize(4, 120, 360)).toBe(6);
  });

  it("pins a grid narrower than 24 pt at 24 pt", () => {
    expect(fontRange(20, 360)).toEqual({ min: 24, max: 24 });
    expect(clampFontSize(10, 20, 360)).toBe(24);
  });

  it("treats NaN as the floor", () => {
    expect(clampFontSize(Number.NaN, 80, 360)).toBe(9);
  });

  it("tells the fit zoom and the percentage over fit", () => {
    expect(isFitWidth(9, 80, 360)).toBe(true);
    expect(isFitWidth(12, 80, 360)).toBe(false);
    expect(zoomPercent(9, 80, 360)).toBe(100);
    expect(zoomPercent(10.8, 80, 360)).toBe(120);
    expect(zoomPercent(12, 120, 360)).toBe(200);
    expect(zoomPercent(12, 80, 0)).toBe(100);
  });
});

describe("content and scroll", () => {
  it("sizes the content with the history above the live rows", () => {
    expect(contentSize(80, 24, 0, 10)).toEqual({ width: 400, height: 312 });
    expect(contentSize(80, 24, 100, 10)).toEqual({ width: 400, height: 1612 });
  });

  it("clamps both axes inside the content", () => {
    const content = { width: 400, height: 1000 };
    const viewport = { width: 360, height: 600 };
    expect(clampScroll({ scrollX: -5, scrollTop: -1 }, content, viewport)).toEqual({ scrollX: 0, scrollTop: 0 });
    expect(clampScroll({ scrollX: 100, scrollTop: 900 }, content, viewport)).toEqual({ scrollX: 40, scrollTop: 400 });
    expect(clampScroll({ scrollX: 10, scrollTop: 50 }, content, viewport)).toEqual({ scrollX: 10, scrollTop: 50 });
  });

  it("does not scroll an axis where the content fits", () => {
    const viewport = { width: 360, height: 600 };
    const fits = contentSize(80, 24, 0, 9);
    expect(canScroll(fits, viewport)).toEqual({ x: false, y: false });
    expect(clampScroll({ scrollX: 30, scrollTop: 30 }, fits, viewport)).toEqual({ scrollX: 0, scrollTop: 0 });
  });

  it("scrolls the alternate screen only when the grid is taller (RF-3.13)", () => {
    // 24 rows of 11.7 are 280.8 tall.
    const viewport = { width: 360, height: 200 };
    expect(canScroll(contentSize(80, 24, 0, 9), viewport).y).toBe(true);
    expect(canScroll(contentSize(80, 24, 0, 9), { width: 360, height: 600 }).y).toBe(false);
  });

  it("knows the bottom, with a float tolerance", () => {
    expect(bottomScrollTop(1000, 600)).toBe(400);
    expect(bottomScrollTop(300, 600)).toBe(0);
    expect(isAtBottom(400, 1000, 600)).toBe(true);
    expect(isAtBottom(399.7, 1000, 600)).toBe(true);
    expect(isAtBottom(390, 1000, 600)).toBe(false);
    expect(isAtBottom(0, 300, 600)).toBe(true);
  });
});

describe("follow the cursor (RF-3.8)", () => {
  // 12 pt: cells of 6, 120 columns are 720 wide in a 360 viewport.
  const follow = (col: number, scrollX: number): number => followCursorScrollX(col, scrollX, 120, 12, 360);

  it("keeps the scroll while the cursor and its margin are framed", () => {
    expect(follow(10, 0)).toBe(0);
    expect(follow(58, 0)).toBe(0);
  });

  it("moves just enough to keep one cell of margin on the right", () => {
    expect(follow(59, 0)).toBe(6);
    expect(follow(100, 0)).toBe(6 * 102 - 360);
  });

  it("moves just enough to keep one cell of margin on the left", () => {
    expect(follow(50, 400)).toBe(49 * 6);
    expect(follow(0, 400)).toBe(0);
  });

  it("holds the scroll inside the grid", () => {
    expect(follow(119, 0)).toBe(360);
    expect(follow(500, 0)).toBe(360);
    expect(followCursorScrollX(40, 50, 80, 9, 360)).toBe(0);
  });
});

describe("size change on the desktop (RF-3.10)", () => {
  it("keeps the zoom relative to fit and takes the scroll to the cursor", () => {
    // 80 columns at 9 pt is fit (100%); at 120 columns fit is 6 pt.
    expect(rescaleOnResize({ cols: 80, viewportWidth: 360, fontSize: 9, scrollX: 0 }, { cols: 120, viewportWidth: 360, cursorCol: 0 })).toEqual({
      fontSize: 6,
      scrollX: 0,
    });
    // 150% of fit at 80 columns (13.5 pt) becomes 150% of fit at 120 columns (9 pt).
    const next = rescaleOnResize({ cols: 80, viewportWidth: 360, fontSize: 13.5, scrollX: 0 }, { cols: 120, viewportWidth: 360, cursorCol: 110 });
    expect(next.fontSize).toBe(9);
    expect(zoomPercent(next.fontSize, 120, 360)).toBe(150);
    expect(next.scrollX).toBe(4.5 * 112 - 360);
  });

  it("holds the new zoom inside the new limits", () => {
    const next = rescaleOnResize({ cols: 120, viewportWidth: 360, fontSize: 24, scrollX: 0 }, { cols: 80, viewportWidth: 360, cursorCol: 0 });
    expect(next.fontSize).toBe(24);
  });

  it("opens with the initial zoom when there was no layout", () => {
    expect(rescaleOnResize({ cols: 80, viewportWidth: 0, fontSize: 0, scrollX: 0 }, { cols: 80, viewportWidth: 360, cursorCol: 0 }).fontSize).toBe(9);
  });

  it("applies to a new viewport width too (rotation)", () => {
    expect(rescaleOnResize({ cols: 80, viewportWidth: 360, fontSize: 9, scrollX: 0 }, { cols: 80, viewportWidth: 720, cursorCol: 0 }).fontSize).toBe(18);
  });
});

describe("axis lock (anatomy §4.7)", () => {
  const run = (moves: readonly (readonly [number, number])[]): AxisLockState =>
    moves.reduce<AxisLockState>((state, [dx, dy]) => axisLockMove(state, dx, dy), axisLockStart());

  it("stays undecided below 8 pt", () => {
    expect(run([[3, 2], [5, 5]]).axis).toBe("none");
    expect(lockedDelta("none", 3, 4)).toEqual({ dx: 0, dy: 0 });
  });

  it("decides the dominant axis at 8 pt", () => {
    expect(run([[AXIS_DECIDE_DISTANCE, 0]]).axis).toBe("x");
    expect(run([[2, -AXIS_DECIDE_DISTANCE]]).axis).toBe("y");
    expect(run([[6, 6]]).axis).toBe("y");
  });

  it("keeps the axis once decided, below 24 pt on both", () => {
    expect(run([[9, 0], [10, 30]]).axis).toBe("x");
    expect(run([[0, 9], [AXIS_DIAGONAL_DISTANCE, 60]]).axis).toBe("y");
    expect(lockedDelta("x", 3, 4)).toEqual({ dx: 3, dy: 0 });
    expect(lockedDelta("y", 3, 4)).toEqual({ dx: 0, dy: 4 });
  });

  it("turns free past 24 pt on both, and stays free", () => {
    expect(run([[9, 0], [25, -25]]).axis).toBe("free");
    expect(run([[9, 0], [25, 25], [0, 0]]).axis).toBe("free");
    expect(lockedDelta("free", 3, 4)).toEqual({ dx: 3, dy: 4 });
  });

  it("returns the same state when nothing changes", () => {
    const state = axisLock.move(axisLock.start(), 9, 0);
    expect(axisLock.move(state, 12, 1)).toBe(state);
    expect(axisLock.delta(state.axis, 1, 1)).toEqual({ dx: 1, dy: 0 });
  });
});

describe("history anchor (RF-3.12)", () => {
  it("moves down by the lines inserted above, up by the lines removed", () => {
    expect(anchorScrollOnHistoryGrowth(100, 500, 13)).toBe(100 + 500 * 13);
    expect(anchorScrollOnHistoryGrowth(1000, -10, 13)).toBe(870);
  });

  it("keeps the text read in place while reading the history", () => {
    // A page of 500 lines loaded on top: the first content row went from index 1000 to 500.
    expect(
      scrollTopAfterHistoryChange({
        scrollTop: 130,
        wasAtBottom: false,
        previousTopIndex: 1000,
        nextTopIndex: 500,
        lineHeight: 13,
        contentHeight: 13 * 1024,
        viewportHeight: 600,
      }),
    ).toBe(130 + 500 * 13);
    // New output below the reading position does not move it.
    expect(
      scrollTopAfterHistoryChange({
        scrollTop: 130,
        wasAtBottom: false,
        previousTopIndex: 500,
        nextTopIndex: 500,
        lineHeight: 13,
        contentHeight: 13 * 1100,
        viewportHeight: 600,
      }),
    ).toBe(130);
  });

  it("stays at the bottom when it was there", () => {
    expect(
      scrollTopAfterHistoryChange({
        scrollTop: 400,
        wasAtBottom: true,
        previousTopIndex: 0,
        nextTopIndex: 0,
        lineHeight: 13,
        contentHeight: 1300,
        viewportHeight: 600,
      }),
    ).toBe(700);
  });

  it("holds the anchored scroll inside the content", () => {
    expect(
      scrollTopAfterHistoryChange({
        scrollTop: 20,
        wasAtBottom: false,
        previousTopIndex: 0,
        nextTopIndex: 10,
        lineHeight: 13,
        contentHeight: 1300,
        viewportHeight: 600,
      }),
    ).toBe(0);
  });
});

describe("zoom memory per tab (RF-3.9)", () => {
  const key = { desktopId: "d1", hostInstance: "aa", tabId: 3 };

  it("remembers the zoom of each tab", () => {
    const memory = createZoomMemory();
    expect(memory.get(key)).toBeUndefined();
    memory.set(key, 14);
    memory.set({ ...key, tabId: 4 }, 10);
    expect(memory.get(key)).toBe(14);
    expect(memory.get({ ...key, tabId: 4 })).toBe(10);
    expect(memory.size).toBe(2);
    memory.delete(key);
    expect(memory.get(key)).toBeUndefined();
  });

  it("never carries a zoom across a desktop restart or to another desktop", () => {
    const memory = createZoomMemory();
    memory.set(key, 14);
    expect(memory.get({ ...key, hostInstance: "bb" })).toBeUndefined();
    expect(memory.get({ ...key, desktopId: "d2" })).toBeUndefined();
  });

  it("ignores sizes that are not a font size", () => {
    const memory = createZoomMemory();
    memory.set(key, Number.NaN);
    memory.set(key, 0);
    expect(memory.size).toBe(0);
  });

  it("clears one desktop or everything", () => {
    const memory = createZoomMemory();
    memory.set(key, 14);
    memory.set({ ...key, desktopId: "d2" }, 10);
    memory.clear("d1");
    expect(memory.get(key)).toBeUndefined();
    expect(memory.get({ ...key, desktopId: "d2" })).toBe(10);
    memory.clear();
    expect(memory.size).toBe(0);
  });

  it("starts empty in each instance (nothing persisted)", () => {
    createZoomMemory().set(key, 14);
    expect(createZoomMemory().get(key)).toBeUndefined();
  });
});
