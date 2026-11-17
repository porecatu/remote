// SPDX-License-Identifier: GPL-3.0-or-later

// Math of the terminal viewport (PRD-003 RF-3.6 to RF-3.13, anatomy §4.7):
// font size and zoom, "fit the width", scroll limits, following the cursor,
// the axis lock of a one-finger drag, the scroll anchor while history grows
// and the per-tab zoom memory. Pure: no React, no Skia, no clock. The gesture
// helpers carry the "worklet" directive so the grid gestures can call them on
// the UI thread (ADR-0010); in Node they are plain functions.
//
// Units are points (the layout unit of React Native). Coordinates of the
// content, top to bottom: the history rows the view holds (oldest on top),
// then the live rows of the grid, with no separator (anatomy §4.7). `scrollX`
// is the content x at the left edge of the viewport; `scrollTop` is the
// content y at its top edge. Both start at 0 and grow right and down.
//
// The size in columns × rows is always the desktop's (RF-3.6): nothing here
// asks for another size, it only scales and scrolls.

import type { TabId } from "../protocol";

/**
 * Terminal font limits, in points, and line height as a factor of the font.
 * Mirror of the anatomy §2.5 tokens `terminal.min-font`, `terminal.read-font`
 * (and its maximum) and `terminal.line-height`, the same values as `terminal`
 * in `ui/theme/tokens.ts` (`src/` does not import from `ui/`; a test keeps the
 * two equal).
 */
export const terminalMetrics = {
  /** `terminal.min-font`: threshold of "fit the width" (RF-3.7). */
  minFont: 8,
  /** `terminal.read-font`: reading size when the width does not fit. */
  readFont: 12,
  /** `terminal.read-font` maximum: the pinch zoom ceiling. */
  maxFont: 24,
  /** `terminal.line-height`, a factor of the font size. */
  lineHeight: 1.3,
} as const;

/** Advance of one cell of Iosevka Fixed, in em (anatomy §4.7, ADR-0009). */
export const CELL_ADVANCE_EM = 0.5;

/** Drag distance that decides the dominant axis (anatomy §4.7, proposal). */
export const AXIS_DECIDE_DISTANCE = 8;

/** A diagonal drag counts only past this distance on both axes (anatomy §4.7). */
export const AXIS_DIAGONAL_DISTANCE = 24;

/** Cells kept beside the cursor when following it (one cell each side). */
export const CURSOR_MARGIN_CELLS = 1;

/**
 * Float tolerance of "at the bottom", in points: a scroll that stops a fraction
 * of a point short of the end is still at the end. Not a design value.
 */
export const AT_BOTTOM_TOLERANCE = 0.5;

/** Size in points. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Scroll offsets in points (see the coordinates at the top of the file). */
export interface ScrollPosition {
  readonly scrollX: number;
  readonly scrollTop: number;
}

/** Size of one cell at a font size. */
export interface CellMetrics {
  /** Width of one column: 0.5 em. */
  readonly cellWidth: number;
  /** Height of one row: 1.3 times the font. */
  readonly lineHeight: number;
}

/** How the zoom was chosen when a tab opens (RF-3.7). */
export type ZoomMode = "fit" | "read";

export interface InitialZoom {
  readonly fontSize: number;
  readonly mode: ZoomMode;
}

/** Pinch zoom limits for a grid width and a viewport width. */
export interface FontRange {
  readonly min: number;
  readonly max: number;
}

function clamp(value: number, min: number, max: number): number {
  "worklet";
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/** Cell width (0.5 em) and row height (1.3 of the font) at `fontSize`. */
export function cellMetrics(fontSize: number): CellMetrics {
  "worklet";
  return {
    cellWidth: fontSize * CELL_ADVANCE_EM,
    lineHeight: fontSize * terminalMetrics.lineHeight,
  };
}

/**
 * The font size that makes `cols` columns fill `viewportWidth` exactly:
 * `2 · L / cols` (anatomy §4.7). 0 while there is no width or no column (the
 * viewport is not laid out yet): wait for the layout before choosing a zoom.
 */
export function fitWidthFontSize(cols: number, viewportWidth: number): number {
  "worklet";
  if (!(cols > 0) || !(viewportWidth > 0)) {
    return 0;
  }
  return viewportWidth / (cols * CELL_ADVANCE_EM);
}

/**
 * Pinch limits (RF-3.7, anatomy §4.7): from "fit the width" to 24 pt. When
 * "fit" is below `terminal.min-font` (a wide grid that opens in reading size),
 * the floor is still "fit": the whole width can always be brought on screen.
 * When "fit" is above 24 pt (a narrow grid), both limits are 24 pt and the
 * grid fits with room to spare.
 */
export function fontRange(cols: number, viewportWidth: number): FontRange {
  "worklet";
  const max = terminalMetrics.maxFont;
  return { min: Math.min(fitWidthFontSize(cols, viewportWidth), max), max };
}

/**
 * The zoom a tab opens with when it has no remembered zoom (RF-3.7): "fit the
 * width" when that font is at least `terminal.min-font`, capped at the 24 pt
 * maximum; otherwise the reading size (12 pt) with horizontal scroll.
 */
export function initialZoom(cols: number, viewportWidth: number): InitialZoom {
  "worklet";
  const fit = fitWidthFontSize(cols, viewportWidth);
  if (fit >= terminalMetrics.minFont) {
    return { fontSize: Math.min(fit, terminalMetrics.maxFont), mode: "fit" };
  }
  return { fontSize: terminalMetrics.readFont, mode: "read" };
}

/** `size` held inside the pinch limits ({@link fontRange}). */
export function clampFontSize(size: number, cols: number, viewportWidth: number): number {
  "worklet";
  const range = fontRange(cols, viewportWidth);
  return clamp(size, range.min, range.max);
}

/** Whether `fontSize` is the "fit the width" zoom (the floor of the pinch). */
export function isFitWidth(fontSize: number, cols: number, viewportWidth: number): boolean {
  "worklet";
  return Math.abs(fontSize - fontRange(cols, viewportWidth).min) < 1e-3;
}

/**
 * Zoom as a whole percentage of "fit the width" (100 = fit), for the zoom chip
 * of the pinch (anatomy §4.7, "120%"). 100 while there is no layout.
 */
export function zoomPercent(fontSize: number, cols: number, viewportWidth: number): number {
  "worklet";
  const base = fontRange(cols, viewportWidth).min;
  if (!(base > 0)) {
    return 100;
  }
  return Math.round((fontSize / base) * 100);
}

/**
 * Size of the content: `cols` columns by the live `rows` plus the
 * `historyLines` rows of history above them (0 on the alternate screen,
 * RF-3.13).
 */
export function contentSize(
  cols: number,
  rows: number,
  historyLines: number,
  fontSize: number,
): Size {
  "worklet";
  const { cellWidth, lineHeight } = cellMetrics(fontSize);
  return { width: cols * cellWidth, height: (rows + historyLines) * lineHeight };
}

/** The largest scroll offsets: 0 on an axis where the content fits. */
export function maxScroll(content: Size, viewport: Size): ScrollPosition {
  "worklet";
  return {
    scrollX: Math.max(0, content.width - viewport.width),
    scrollTop: Math.max(0, content.height - viewport.height),
  };
}

/**
 * Which axes can scroll: horizontal when the grid is wider than the screen
 * (RF-3.8; also when "follow the cursor" shows), vertical when the content is
 * taller (on the alternate screen, only when the grid itself is, RF-3.13).
 */
export function canScroll(content: Size, viewport: Size): { readonly x: boolean; readonly y: boolean } {
  "worklet";
  const limit = maxScroll(content, viewport);
  return { x: limit.scrollX > 0, y: limit.scrollTop > 0 };
}

/** `scroll` held inside the content on both axes. */
export function clampScroll(scroll: ScrollPosition, content: Size, viewport: Size): ScrollPosition {
  "worklet";
  const limit = maxScroll(content, viewport);
  return {
    scrollX: clamp(scroll.scrollX, 0, limit.scrollX),
    scrollTop: clamp(scroll.scrollTop, 0, limit.scrollTop),
  };
}

/** `scrollTop` that shows the end of the live grid (RF-3.12 "back to the end"). */
export function bottomScrollTop(contentHeight: number, viewportHeight: number): number {
  "worklet";
  return Math.max(0, contentHeight - viewportHeight);
}

/** Whether the view shows the end of the live grid (else "back to the end" shows, RF-3.12). */
export function isAtBottom(scrollTop: number, contentHeight: number, viewportHeight: number): boolean {
  "worklet";
  return scrollTop >= bottomScrollTop(contentHeight, viewportHeight) - AT_BOTTOM_TOLERANCE;
}

/**
 * `scrollX` that frames the cursor column with one cell of margin on each side
 * (RF-3.8): unchanged while the cursor is already framed, otherwise the
 * smallest move that frames it, held inside the grid. A cursor past the last
 * column (pending wrap) counts as the last column.
 */
export function followCursorScrollX(
  cursorCol: number,
  scrollX: number,
  cols: number,
  fontSize: number,
  viewportWidth: number,
): number {
  "worklet";
  const { cellWidth } = cellMetrics(fontSize);
  const limit = Math.max(0, cols * cellWidth - viewportWidth);
  const col = clamp(cursorCol, 0, Math.max(0, cols - 1));
  const left = (col - CURSOR_MARGIN_CELLS) * cellWidth;
  const right = (col + 1 + CURSOR_MARGIN_CELLS) * cellWidth;
  let next = scrollX;
  if (right - left >= viewportWidth || left < scrollX) {
    next = left;
  } else if (right > scrollX + viewportWidth) {
    next = right - viewportWidth;
  }
  return clamp(next, 0, limit);
}

/** Zoom and horizontal scroll of a grid before a size change. */
export interface ResizeFrom {
  readonly cols: number;
  readonly viewportWidth: number;
  readonly fontSize: number;
  readonly scrollX: number;
}

/** The grid after a size change, with its cursor column. */
export interface ResizeTo {
  readonly cols: number;
  readonly viewportWidth: number;
  readonly cursorCol: number;
}

/**
 * A `grid-snapshot` with other dimensions (RF-3.10; also a new viewport width,
 * such as a rotation): the zoom keeps its ratio to "fit the width" (the same
 * percentage of {@link zoomPercent}), held inside the new pinch limits, and the
 * horizontal scroll goes to the cursor. Without a previous layout, the
 * opening zoom ({@link initialZoom}). No animation (anatomy §4.7).
 */
export function rescaleOnResize(from: ResizeFrom, to: ResizeTo): { readonly fontSize: number; readonly scrollX: number } {
  "worklet";
  const oldBase = fontRange(from.cols, from.viewportWidth).min;
  const fontSize =
    oldBase > 0 && from.fontSize > 0
      ? clampFontSize((from.fontSize / oldBase) * fontRange(to.cols, to.viewportWidth).min, to.cols, to.viewportWidth)
      : initialZoom(to.cols, to.viewportWidth).fontSize;
  const scaled = from.fontSize > 0 ? from.scrollX * (fontSize / from.fontSize) : 0;
  return {
    fontSize,
    scrollX: followCursorScrollX(to.cursorCol, scaled, to.cols, fontSize, to.viewportWidth),
  };
}

/**
 * Keeps the text being read in place (RF-3.12) when `addedLines` rows were
 * inserted above it in the content (a scrollback page loaded on top), or left
 * it when negative (history lines dropped from the top). With the absolute
 * line index of `src/grid/scrollback.ts`, `addedLines` is the index of the old
 * first content row minus the index of the new one.
 */
export function anchorScrollOnHistoryGrowth(scrollTop: number, addedLines: number, lineHeight: number): number {
  "worklet";
  return scrollTop + addedLines * lineHeight;
}

/** The content around a change of the history (RF-3.12). */
export interface HistoryChange {
  readonly scrollTop: number;
  /** {@link isAtBottom} before the change. */
  readonly wasAtBottom: boolean;
  /** Absolute index (scrollback.ts) of the first content row before the change. */
  readonly previousTopIndex: number;
  /** Absolute index of the first content row after the change. */
  readonly nextTopIndex: number;
  readonly lineHeight: number;
  /** Content height after the change. */
  readonly contentHeight: number;
  readonly viewportHeight: number;
}

/**
 * `scrollTop` after the history or the live grid changed: at the bottom, it
 * stays at the bottom (the live grid keeps showing); reading the history, the
 * text read does not move ({@link anchorScrollOnHistoryGrowth}), held inside
 * the new content.
 */
export function scrollTopAfterHistoryChange(change: HistoryChange): number {
  "worklet";
  const limit = bottomScrollTop(change.contentHeight, change.viewportHeight);
  if (change.wasAtBottom) {
    return limit;
  }
  const anchored = anchorScrollOnHistoryGrowth(
    change.scrollTop,
    change.previousTopIndex - change.nextTopIndex,
    change.lineHeight,
  );
  return clamp(anchored, 0, limit);
}

/**
 * Axis of a one-finger drag (anatomy §4.7): `none` until the drag travels
 * {@link AXIS_DECIDE_DISTANCE}, then the dominant axis, and `free` (both axes)
 * once it passes {@link AXIS_DIAGONAL_DISTANCE} on both.
 */
export type DragAxis = "none" | "x" | "y" | "free";

export interface AxisLockState {
  readonly axis: DragAxis;
}

/** State at the start of a drag. */
export function axisLockStart(): AxisLockState {
  "worklet";
  return { axis: "none" };
}

/**
 * Next state for the drag's total translation since it started (`dx`, `dy`,
 * as the gesture's `translationX`/`translationY`). The dominant axis is
 * decided once, when the drag reaches 8 pt (a tie goes to `y`, the history);
 * a locked drag turns `free` past 24 pt on both axes, and `free` stays.
 */
export function axisLockMove(state: AxisLockState, dx: number, dy: number): AxisLockState {
  "worklet";
  if (state.axis === "free") {
    return state;
  }
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  let axis: DragAxis = state.axis;
  if (axis === "none") {
    if (Math.hypot(dx, dy) < AXIS_DECIDE_DISTANCE) {
      return state;
    }
    axis = ax > ay ? "x" : "y";
  }
  if (ax > AXIS_DIAGONAL_DISTANCE && ay > AXIS_DIAGONAL_DISTANCE) {
    axis = "free";
  }
  return axis === state.axis ? state : { axis };
}

/**
 * The part of an incremental move (`dx`, `dy` since the last event) that
 * scrolls on `axis`: nothing while undecided, one axis while locked.
 */
export function lockedDelta(axis: DragAxis, dx: number, dy: number): { readonly dx: number; readonly dy: number } {
  "worklet";
  switch (axis) {
    case "none":
      return { dx: 0, dy: 0 };
    case "x":
      return { dx, dy: 0 };
    case "y":
      return { dx: 0, dy };
    case "free":
      return { dx, dy };
  }
}

/**
 * The axis lock as one namespace. Inside a worklet, call the standalone
 * functions ({@link axisLockStart}, {@link axisLockMove}, {@link lockedDelta}).
 */
export const axisLock = {
  start: axisLockStart,
  move: axisLockMove,
  delta: lockedDelta,
} as const;

/**
 * A tab whose zoom is remembered (RF-3.9). The `host_instance` is part of the
 * key: tab ids restart with the desktop, so a zoom never carries across a
 * desktop restart.
 */
export interface ZoomKey {
  /** Local id of the desktop (registry). */
  readonly desktopId: string;
  /** Lowercase hex of the desktop's `host_instance`. */
  readonly hostInstance: string;
  readonly tabId: TabId;
}

/**
 * Zoom chosen per tab during the app session (RF-3.9, anatomy §4.7): memory
 * only, never persisted.
 */
export interface ZoomMemory {
  /** The remembered font size of the tab, if any. */
  get(key: ZoomKey): number | undefined;
  set(key: ZoomKey, fontSize: number): void;
  /** Forgets one tab (back to the opening zoom). */
  delete(key: ZoomKey): void;
  /** Forgets every tab of one desktop, or everything. */
  clear(desktopId?: string): void;
  readonly size: number;
}

function zoomKeyString(key: ZoomKey): string {
  return JSON.stringify([key.desktopId, key.hostInstance, key.tabId]);
}

/** Creates an empty in-memory {@link ZoomMemory}. */
export function createZoomMemory(): ZoomMemory {
  const entries = new Map<string, { readonly desktopId: string; readonly fontSize: number }>();
  return {
    get(key) {
      return entries.get(zoomKeyString(key))?.fontSize;
    },
    set(key, fontSize) {
      if (Number.isFinite(fontSize) && fontSize > 0) {
        entries.set(zoomKeyString(key), { desktopId: key.desktopId, fontSize });
      }
    },
    delete(key) {
      entries.delete(zoomKeyString(key));
    },
    clear(desktopId) {
      if (desktopId === undefined) {
        entries.clear();
        return;
      }
      for (const [name, entry] of entries) {
        if (entry.desktopId === desktopId) {
          entries.delete(name);
        }
      }
    },
    get size() {
      return entries.size;
    },
  };
}
