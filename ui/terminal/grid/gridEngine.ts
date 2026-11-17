// SPDX-License-Identifier: GPL-3.0-or-later
// The JS-thread logic of the grid view (PRD-003 RF-3.6 to RF-3.13, anatomy
// §4.7): it follows the terminal controller and keeps the view state the
// gestures and the canvas share (zoom, scroll, content shape) consistent with
// the grid. No React and no Skia of its own: the shared values are anything
// with a `value`, the renderer is injected, so it runs in Node tests.
//
// - Opening and resizing: the remembered zoom of the tab (RF-3.9) or the
//   opening zoom (RF-3.7); a grid of other dimensions or a new view width
//   keeps the zoom relative to "fit the width" and scrolls to the cursor
//   (RF-3.10, decision 7).
// - History (RF-3.11, RF-3.12): the content holds every history line the host
//   has (offset 0 right above the live screen); the lines near the view are
//   asked for with `requestHistory` (one viewport ahead) and drawn as their
//   pages land; at the bottom the view stays at the bottom, reading the
//   history the text read does not move when output pushes lines or lines
//   drop off the top. No history on the alternate screen (RF-3.13).
// - Follow the cursor (RF-3.8): the horizontal scroll frames the cursor at
//   every change while on.
// - Drawing: only the rows of a window around the view are composed into the
//   frame; the window is composed again when the view nears its edge.
//
// Never logs: the grid is private.
import type { TerminalState, TerminalSession } from "@/controllers/terminalSession";
import {
  type ZoomKey,
  type ZoomMemory,
  bottomScrollTop,
  canScroll,
  cellMetrics,
  clampFontSize,
  clampScroll,
  contentSize,
  fitWidthFontSize,
  followCursorScrollX,
  initialZoom,
  isAtBottom,
  isFitWidth,
  rescaleOnResize,
  scrollTopAfterHistoryChange,
  zoomPercent,
} from "@/terminal/viewport";

import type { RenderSource, RowWindow } from "./gridRenderer";

/** What the grid needs of the terminal controller. */
export type GridSession = Pick<TerminalSession, "store" | "grid" | "scrollback" | "requestHistory">;

/** A value shared with the UI thread (a Reanimated shared value, or a plain box in tests). */
export interface Box<T> {
  value: T;
}

/** The view state shared with the gestures and the canvas. */
export interface EngineValues {
  readonly fontSize: Box<number>;
  readonly scrollX: Box<number>;
  readonly scrollTop: Box<number>;
  readonly viewWidth: Box<number>;
  readonly viewHeight: Box<number>;
  readonly paddingTop: Box<number>;
  readonly cols: Box<number>;
  readonly liveRows: Box<number>;
  readonly historyRows: Box<number>;
  readonly following: Box<boolean>;
}

/** The renderer as the engine uses it (see ./gridRenderer.ts). */
export interface EngineRenderer<P> {
  frame(source: RenderSource, window: RowWindow): P;
  cursor(source: RenderSource): P;
  missingHistory(source: RenderSource, window: RowWindow): number;
}

/** What the screen shows around the grid (floating buttons, zoom chip). */
export interface TerminalGridState {
  /** The view shows the end of the live grid ("back to the end" hides, RF-3.12). */
  readonly atBottom: boolean;
  /** The zoom is "fit the width" ("fit the width" hides, decision 7). */
  readonly isFit: boolean;
  /** The grid is wider than the view ("follow the cursor" shows, RF-3.8). */
  readonly wide: boolean;
  /** "Follow the cursor" is on. */
  readonly followingCursor: boolean;
  /** Zoom as a percentage of "fit the width" (100 = fit). */
  readonly zoomPercent: number;
  /** The zoom chip shows: during a pinch and `duration.zoom-chip` after it. */
  readonly zoomChipVisible: boolean;
  /** A history page is loading for rows the view shows blank. */
  readonly loadingHistory: boolean;
}

export const INITIAL_GRID_STATE: TerminalGridState = {
  atBottom: true,
  isFit: true,
  wide: false,
  followingCursor: false,
  zoomPercent: 100,
  zoomChipVisible: false,
  loadingHistory: false,
};

export interface GridEngineDeps<P> {
  readonly session: GridSession;
  readonly values: EngineValues;
  readonly frame: Box<P>;
  readonly cursor: Box<P>;
  readonly zoomMemory: ZoomMemory;
  readonly zoomKey: () => ZoomKey | null;
  /** How long the zoom chip stays after a pinch (`duration.zoom-chip`). */
  readonly zoomChipMs: number;
  /** The state changed. */
  readonly publish: (state: TerminalGridState) => void;
  /** The live grid changed (for the accessibility summary). */
  readonly onContentChange?: () => void;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export interface GridEngine<P> {
  /** Starts following the controller. */
  start(): void;
  /** A new renderer (font or theme changed), or none (no theme yet). */
  setRenderer(renderer: EngineRenderer<P> | null): void;
  /** The view was laid out (`height` already without `grid.padding-top`). */
  setViewport(width: number, height: number): void;
  /** The scroll or the zoom moved (UI-thread report, or a gesture settled). */
  viewChanged(): void;
  /** The pinch reached `percent`. */
  zoomed(percent: number): void;
  /** A gesture ended. */
  settled(gesture: "pan" | "pinch"): void;
  /** A horizontal drag turned "follow the cursor" off. */
  followStopped(): void;
  scrollToBottom(): void;
  setFollowCursor(on: boolean): void;
  fitWidth(): void;
  getState(): TerminalGridState;
  /** The current source of the drawing (for the accessibility summary). */
  source(): RenderSource;
  dispose(): void;
}

interface Shape {
  readonly historyRows: number;
  readonly dropped: number;
  readonly liveRows: number;
  readonly alt: boolean;
  readonly generation: number;
}

function sameState(a: TerminalGridState, b: TerminalGridState): boolean {
  return (
    a.atBottom === b.atBottom &&
    a.isFit === b.isFit &&
    a.wide === b.wide &&
    a.followingCursor === b.followingCursor &&
    a.zoomPercent === b.zoomPercent &&
    a.zoomChipVisible === b.zoomChipVisible &&
    a.loadingHistory === b.loadingHistory
  );
}

export function createGridEngine<P>(deps: GridEngineDeps<P>): GridEngine<P> {
  const { session, values } = deps;
  const setTimer = deps.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const clearTimer =
    deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let renderer: EngineRenderer<P> | null = null;
  /** Grid width and view width the zoom was last chosen for. */
  let layout: { readonly cols: number; readonly width: number } | null = null;
  let shape: Shape | null = null;
  let composed: RowWindow | null = null;
  let chipVisible = false;
  let chipTimer: unknown = null;
  let published: TerminalGridState = INITIAL_GRID_STATE;
  let unsubscribe: (() => void) | null = null;
  let disposed = false;

  // ------------------------------------------------------------ reading

  function state(): TerminalState {
    return session.store.getState();
  }

  function currentShape(): Shape {
    const s = state();
    const grid = session.grid();
    const alt = (grid?.alt ?? s.alt) || s.history.alt;
    return {
      historyRows: alt ? 0 : s.history.lines,
      dropped: s.history.dropped,
      liveRows: grid?.rowsCount ?? s.rows,
      alt,
      generation: s.history.generation,
    };
  }

  function source(): RenderSource {
    const now = shape ?? currentShape();
    return {
      grid: session.grid(),
      scrollback: now.historyRows > 0 ? session.scrollback() : null,
      historyRows: now.historyRows,
      dropped: now.dropped,
    };
  }

  function lineHeight(): number {
    return cellMetrics(values.fontSize.value).lineHeight;
  }

  function content() {
    return contentSize(values.cols.value, values.liveRows.value, values.historyRows.value, values.fontSize.value);
  }

  function view() {
    return { width: values.viewWidth.value, height: values.viewHeight.value };
  }

  function totalRows(): number {
    return values.historyRows.value + values.liveRows.value;
  }

  /** Content rows the view shows (the `grid.padding-top` strip included). */
  function visibleRows(): RowWindow {
    const lh = lineHeight();
    if (!(lh > 0)) {
      return { first: 0, last: -1 };
    }
    const top = Math.max(0, values.scrollTop.value - values.paddingTop.value);
    const first = Math.floor(top / lh);
    const last = Math.min(totalRows() - 1, Math.floor((values.scrollTop.value + values.viewHeight.value) / lh));
    return { first, last };
  }

  /** Rows of one view height: the margin composed and prefetched around the view. */
  function marginRows(): number {
    const lh = lineHeight();
    return lh > 0 ? Math.max(1, Math.ceil(values.viewHeight.value / lh)) : 1;
  }

  // ------------------------------------------------------------ writing

  function clampView(): void {
    const scroll = clampScroll({ scrollX: values.scrollX.value, scrollTop: values.scrollTop.value }, content(), view());
    values.scrollX.value = scroll.scrollX;
    values.scrollTop.value = scroll.scrollTop;
  }

  function cursorCol(): number {
    return session.grid()?.cursor.col ?? 0;
  }

  function follow(): void {
    if (!values.following.value) {
      return;
    }
    values.scrollX.value = followCursorScrollX(
      cursorCol(),
      values.scrollX.value,
      values.cols.value,
      values.fontSize.value,
      values.viewWidth.value,
    );
  }

  /** Sets the zoom keeping the view at the bottom, or the text at the top of the view, in place. */
  function applyFont(next: number, scrollX: number | null): void {
    const previous = values.fontSize.value;
    const wasAtBottom = isAtBottom(values.scrollTop.value, content().height, values.viewHeight.value);
    values.fontSize.value = next;
    const ratio = previous > 0 ? next / previous : 1;
    values.scrollX.value = scrollX ?? values.scrollX.value * ratio;
    values.scrollTop.value = wasAtBottom
      ? bottomScrollTop(content().height, values.viewHeight.value)
      : values.scrollTop.value * ratio;
  }

  /** Chooses the zoom for the grid width and the view width (RF-3.7, RF-3.9, RF-3.10). */
  function ensureZoom(): void {
    const cols = values.cols.value;
    const width = values.viewWidth.value;
    if (!(cols > 0) || !(width > 0)) {
      return;
    }
    if (layout === null) {
      const key = deps.zoomKey();
      const remembered = key === null ? undefined : deps.zoomMemory.get(key);
      const font =
        remembered === undefined ? initialZoom(cols, width).fontSize : clampFontSize(remembered, cols, width);
      values.fontSize.value = font;
      values.scrollX.value = 0;
      values.scrollTop.value = bottomScrollTop(content().height, values.viewHeight.value);
    } else if (layout.cols !== cols || layout.width !== width) {
      const next = rescaleOnResize(
        {
          cols: layout.cols,
          viewportWidth: layout.width,
          fontSize: values.fontSize.value,
          scrollX: values.scrollX.value,
        },
        { cols, viewportWidth: width, cursorCol: cursorCol() },
      );
      applyFont(next.fontSize, next.scrollX);
    }
    layout = { cols, width };
  }

  function rememberZoom(): void {
    const key = deps.zoomKey();
    if (key !== null && values.fontSize.value > 0) {
      deps.zoomMemory.set(key, values.fontSize.value);
    }
  }

  /** The view is laid out and has a zoom: there are rows to show. */
  function laidOut(): boolean {
    return lineHeight() > 0 && values.viewHeight.value > 0;
  }

  function compose(): void {
    if (renderer === null || !laidOut()) {
      composed = null;
      return;
    }
    const visible = visibleRows();
    const margin = marginRows();
    const window = {
      first: Math.max(0, visible.first - margin),
      last: Math.min(totalRows() - 1, visible.last + margin),
    };
    const src = source();
    composed = window;
    deps.frame.value = renderer.frame(src, window);
    deps.cursor.value = renderer.cursor(src);
  }

  /** Composes again when the view nears an edge of the composed window. */
  function composeIfNeeded(): void {
    if (renderer === null || !laidOut()) {
      return;
    }
    const visible = visibleRows();
    const half = Math.floor(marginRows() / 2);
    const last = totalRows() - 1;
    if (
      composed === null ||
      (visible.first < composed.first + half && composed.first > 0) ||
      (visible.last > composed.last - half && composed.last < last) ||
      visible.first < composed.first ||
      visible.last > composed.last
    ) {
      compose();
    }
  }

  /** Asks for the history lines of the view and one view above and below it, when not cached. */
  function requestHistory(): void {
    const now = shape;
    if (now === null || now.historyRows === 0 || !laidOut()) {
      return;
    }
    const scrollback = session.scrollback();
    if (scrollback === null) {
      return;
    }
    const visible = visibleRows();
    const margin = marginRows();
    const top = Math.max(0, visible.first - margin);
    const bottom = Math.min(now.historyRows - 1, visible.last + margin);
    if (top > bottom) {
      return;
    }
    const count = bottom - top + 1;
    if (scrollback.hasRange(now.historyRows - 1 - bottom, count)) {
      return;
    }
    session.requestHistory(now.historyRows - 1 - top, count);
  }

  function computeState(): TerminalGridState {
    const c = content();
    const v = view();
    const cols = values.cols.value;
    const font = values.fontSize.value;
    const loading =
      renderer !== null &&
      state().history.loadingPages > 0 &&
      renderer.missingHistory(source(), visibleRows()) > 0;
    return {
      atBottom: isAtBottom(values.scrollTop.value, c.height, v.height),
      isFit: !(font > 0) || isFitWidth(font, cols, v.width),
      wide: canScroll(c, v).x,
      followingCursor: values.following.value,
      zoomPercent: font > 0 ? zoomPercent(font, cols, v.width) : 100,
      zoomChipVisible: chipVisible,
      loadingHistory: loading,
    };
  }

  function publish(): void {
    const next = computeState();
    if (!sameState(next, published)) {
      published = next;
      deps.publish(next);
    }
  }

  // ------------------------------------------------------------ sync

  /** The grid, the history or their shape changed: bring the view along. */
  function sync(): void {
    const previous = shape;
    const next = currentShape();
    const grid = session.grid();
    const lhBefore = lineHeight();
    const heightBefore = (values.liveRows.value + values.historyRows.value) * lhBefore;
    const wasAtBottom = previous === null || isAtBottom(values.scrollTop.value, heightBefore, values.viewHeight.value);

    shape = next;
    values.cols.value = grid?.cols ?? state().cols;
    values.liveRows.value = next.liveRows;
    values.historyRows.value = next.historyRows;
    ensureZoom();

    const comparable = previous !== null && previous.alt === next.alt && previous.generation === next.generation;
    values.scrollTop.value = scrollTopAfterHistoryChange({
      scrollTop: values.scrollTop.value,
      wasAtBottom,
      previousTopIndex: comparable ? previous.dropped : next.dropped,
      nextTopIndex: next.dropped,
      lineHeight: lineHeight(),
      contentHeight: content().height,
      viewportHeight: values.viewHeight.value,
    });
    follow();
    clampView();
    compose();
    requestHistory();
    publish();
    deps.onContentChange?.();
  }

  function onStoreChange(next: TerminalState, previous: TerminalState): void {
    if (disposed) {
      return;
    }
    if (
      next.version !== previous.version ||
      next.cols !== previous.cols ||
      next.rows !== previous.rows ||
      next.alt !== previous.alt ||
      next.history.lines !== previous.history.lines ||
      next.history.dropped !== previous.history.dropped ||
      next.history.generation !== previous.history.generation
    ) {
      sync();
      return;
    }
    if (next.history.loadingPages !== previous.history.loadingPages) {
      publish();
    }
  }

  // ------------------------------------------------------------ API

  return {
    start() {
      if (unsubscribe !== null || disposed) {
        return;
      }
      unsubscribe = session.store.subscribe(onStoreChange);
      sync();
    },

    setRenderer(next) {
      renderer = next;
      composed = null;
      compose();
      publish();
    },

    setViewport(width, height) {
      const wasAtBottom =
        shape === null || isAtBottom(values.scrollTop.value, content().height, values.viewHeight.value);
      values.viewWidth.value = width;
      values.viewHeight.value = height;
      ensureZoom();
      if (wasAtBottom) {
        values.scrollTop.value = bottomScrollTop(content().height, height);
      }
      follow();
      clampView();
      compose();
      requestHistory();
      publish();
    },

    viewChanged() {
      if (disposed) {
        return;
      }
      composeIfNeeded();
      requestHistory();
      publish();
    },

    zoomed() {
      if (chipTimer !== null) {
        clearTimer(chipTimer);
        chipTimer = null;
      }
      chipVisible = true;
      publish();
    },

    settled(gesture) {
      if (disposed) {
        return;
      }
      if (gesture === "pinch") {
        rememberZoom();
        follow();
        clampView();
        compose();
        if (chipTimer !== null) {
          clearTimer(chipTimer);
        }
        chipTimer = setTimer(() => {
          chipTimer = null;
          chipVisible = false;
          publish();
        }, deps.zoomChipMs);
      } else {
        composeIfNeeded();
      }
      requestHistory();
      publish();
    },

    followStopped() {
      values.following.value = false;
      publish();
    },

    scrollToBottom() {
      values.scrollTop.value = bottomScrollTop(content().height, values.viewHeight.value);
      composeIfNeeded();
      requestHistory();
      publish();
    },

    setFollowCursor(on) {
      values.following.value = on;
      follow();
      clampView();
      publish();
    },

    fitWidth() {
      const cols = values.cols.value;
      const width = values.viewWidth.value;
      const fit = clampFontSize(fitWidthFontSize(cols, width), cols, width);
      if (!(fit > 0)) {
        return;
      }
      applyFont(fit, null);
      follow();
      clampView();
      rememberZoom();
      compose();
      requestHistory();
      publish();
    },

    getState: () => published,

    source,

    dispose() {
      disposed = true;
      unsubscribe?.();
      unsubscribe = null;
      if (chipTimer !== null) {
        clearTimer(chipTimer);
        chipTimer = null;
      }
    },
  };
}
