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

/**
 * The view values the gestures move on the UI thread. They reach the engine as
 * arguments captured on that thread, never by reading the shared values back:
 * see `ViewState`.
 */
export interface UiView {
  readonly fontSize: number;
  readonly scrollX: number;
  readonly scrollTop: number;
}

/**
 * The engine's own copy of the view state. Reanimated 4 writes a shared value
 * from the JS thread asynchronously (`scheduleOnUI`) and keeps returning the
 * old value to JS reads until the UI thread applied it, so code that writes a
 * value and reads it back in the same call (zoom, clamp, compose) saw stale
 * data and left an idle terminal blank. The engine reads only this copy; the
 * shared values are its output.
 */
interface ViewState {
  fontSize: number;
  scrollX: number;
  scrollTop: number;
  viewWidth: number;
  viewHeight: number;
  cols: number;
  liveRows: number;
  historyRows: number;
  following: boolean;
}

type UiKey = keyof UiView;
const UI_KEYS: readonly UiKey[] = ["fontSize", "scrollX", "scrollTop"];

function isUiKey(key: keyof ViewState): key is UiKey {
  return key === "fontSize" || key === "scrollX" || key === "scrollTop";
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
  /** The scroll or the zoom moved (UI-thread report, with the values the UI thread holds). */
  viewChanged(ui: UiView): void;
  /** The pinch reached `percent`. */
  zoomed(percent: number, ui: UiView): void;
  /** A gesture ended. */
  settled(gesture: "pan" | "pinch", ui: UiView): void;
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

  // Every value starts at zero (`false`) in the shared values too. `paddingTop`
  // is read from its shared value: the engine never writes it, so it is not stale.
  const js: ViewState = {
    fontSize: 0,
    scrollX: 0,
    scrollTop: 0,
    viewWidth: 0,
    viewHeight: 0,
    cols: 0,
    liveRows: 0,
    historyRows: 0,
    following: false,
  };

  /**
   * The value the engine last wrote to a UI-owned shared value (the gestures
   * move these too) that a JS read did not yet see applied. While it is set, a
   * read returning anything else is the old value, not a gesture's.
   */
  const unconfirmed: Partial<Record<UiKey, number>> = {};

  /** Takes the values a gesture moved on the UI thread (the last write wins over a concurrent JS one). */
  function adopt(ui: UiView): void {
    for (const key of UI_KEYS) {
      js[key] = ui[key];
      delete unconfirmed[key];
    }
  }

  /** Reads the UI-owned values back at the start of a JS-driven change: a gesture or its momentum may have moved them. */
  function refreshUi(): void {
    for (const key of UI_KEYS) {
      const live = values[key].value;
      const waiting = unconfirmed[key];
      if (waiting === undefined || live === waiting) {
        js[key] = live;
        delete unconfirmed[key];
      }
    }
  }

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
    return cellMetrics(js.fontSize).lineHeight;
  }

  function content() {
    return contentSize(js.cols, js.liveRows, js.historyRows, js.fontSize);
  }

  function view() {
    return { width: js.viewWidth, height: js.viewHeight };
  }

  function totalRows(): number {
    return js.historyRows + js.liveRows;
  }

  /** Content rows the view shows (the `grid.padding-top` strip included). */
  function visibleRows(): RowWindow {
    const lh = lineHeight();
    if (!(lh > 0)) {
      return { first: 0, last: -1 };
    }
    const top = Math.max(0, js.scrollTop - values.paddingTop.value);
    const first = Math.floor(top / lh);
    const last = Math.min(totalRows() - 1, Math.floor((js.scrollTop + js.viewHeight) / lh));
    return { first, last };
  }

  /** Rows of one view height: the margin composed and prefetched around the view. */
  function marginRows(): number {
    const lh = lineHeight();
    return lh > 0 ? Math.max(1, Math.ceil(js.viewHeight / lh)) : 1;
  }

  // ------------------------------------------------------------ writing

  /** Writes a view value: the JS mirror at once, the shared value (UI thread) for the canvas and the gestures. */
  function put<K extends keyof ViewState>(key: K, next: ViewState[K]): void {
    if (js[key] === next) {
      // Nothing to say: writing it back would also undo a gesture's momentum the JS copy has not seen.
      return;
    }
    js[key] = next;
    (values[key] as Box<ViewState[K]>).value = next;
    if (isUiKey(key)) {
      unconfirmed[key] = next as number;
    }
  }

  function clampView(): void {
    const scroll = clampScroll({ scrollX: js.scrollX, scrollTop: js.scrollTop }, content(), view());
    put("scrollX", scroll.scrollX);
    put("scrollTop", scroll.scrollTop);
  }

  function cursorCol(): number {
    return session.grid()?.cursor.col ?? 0;
  }

  function follow(): void {
    if (!js.following) {
      return;
    }
    put("scrollX", followCursorScrollX(cursorCol(), js.scrollX, js.cols, js.fontSize, js.viewWidth));
  }

  /** Sets the zoom keeping the view at the bottom, or the text at the top of the view, in place. */
  function applyFont(next: number, scrollX: number | null): void {
    const previous = js.fontSize;
    const wasAtBottom = isAtBottom(js.scrollTop, content().height, js.viewHeight);
    put("fontSize", next);
    const ratio = previous > 0 ? next / previous : 1;
    put("scrollX", scrollX ?? js.scrollX * ratio);
    put("scrollTop", wasAtBottom ? bottomScrollTop(content().height, js.viewHeight) : js.scrollTop * ratio);
  }

  /** Chooses the zoom for the grid width and the view width (RF-3.7, RF-3.9, RF-3.10). */
  function ensureZoom(): void {
    const cols = js.cols;
    const width = js.viewWidth;
    if (!(cols > 0) || !(width > 0)) {
      return;
    }
    if (layout === null) {
      const key = deps.zoomKey();
      const remembered = key === null ? undefined : deps.zoomMemory.get(key);
      const font =
        remembered === undefined ? initialZoom(cols, width).fontSize : clampFontSize(remembered, cols, width);
      put("fontSize", font);
      put("scrollX", 0);
      put("scrollTop", bottomScrollTop(content().height, js.viewHeight));
    } else if (layout.cols !== cols || layout.width !== width) {
      const next = rescaleOnResize(
        {
          cols: layout.cols,
          viewportWidth: layout.width,
          fontSize: js.fontSize,
          scrollX: js.scrollX,
        },
        { cols, viewportWidth: width, cursorCol: cursorCol() },
      );
      applyFont(next.fontSize, next.scrollX);
    }
    layout = { cols, width };
  }

  function rememberZoom(): void {
    const key = deps.zoomKey();
    if (key !== null && js.fontSize > 0) {
      deps.zoomMemory.set(key, js.fontSize);
    }
  }

  /** The view is laid out and has a zoom: there are rows to show. */
  function laidOut(): boolean {
    return lineHeight() > 0 && js.viewHeight > 0;
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
    const cols = js.cols;
    const font = js.fontSize;
    const loading =
      renderer !== null &&
      state().history.loadingPages > 0 &&
      renderer.missingHistory(source(), visibleRows()) > 0;
    return {
      atBottom: isAtBottom(js.scrollTop, c.height, v.height),
      isFit: !(font > 0) || isFitWidth(font, cols, v.width),
      wide: canScroll(c, v).x,
      followingCursor: js.following,
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
    refreshUi();
    const previous = shape;
    const next = currentShape();
    const grid = session.grid();
    const lhBefore = lineHeight();
    const heightBefore = (js.liveRows + js.historyRows) * lhBefore;
    const wasAtBottom = previous === null || isAtBottom(js.scrollTop, heightBefore, js.viewHeight);

    shape = next;
    put("cols", grid?.cols ?? state().cols);
    put("liveRows", next.liveRows);
    put("historyRows", next.historyRows);
    ensureZoom();

    const comparable = previous !== null && previous.alt === next.alt && previous.generation === next.generation;
    put(
      "scrollTop",
      scrollTopAfterHistoryChange({
        scrollTop: js.scrollTop,
        wasAtBottom,
        previousTopIndex: comparable ? previous.dropped : next.dropped,
        nextTopIndex: next.dropped,
        lineHeight: lineHeight(),
        contentHeight: content().height,
        viewportHeight: js.viewHeight,
      }),
    );
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
      refreshUi();
      const wasAtBottom = shape === null || isAtBottom(js.scrollTop, content().height, js.viewHeight);
      put("viewWidth", width);
      put("viewHeight", height);
      ensureZoom();
      if (wasAtBottom) {
        put("scrollTop", bottomScrollTop(content().height, height));
      }
      follow();
      clampView();
      compose();
      requestHistory();
      publish();
    },

    viewChanged(ui) {
      if (disposed) {
        return;
      }
      adopt(ui);
      composeIfNeeded();
      requestHistory();
      publish();
    },

    zoomed(_percent, ui) {
      if (disposed) {
        return;
      }
      adopt(ui);
      if (chipTimer !== null) {
        clearTimer(chipTimer);
        chipTimer = null;
      }
      chipVisible = true;
      publish();
    },

    settled(gesture, ui) {
      if (disposed) {
        return;
      }
      adopt(ui);
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
      put("following", false);
      publish();
    },

    scrollToBottom() {
      refreshUi();
      put("scrollTop", bottomScrollTop(content().height, js.viewHeight));
      composeIfNeeded();
      requestHistory();
      publish();
    },

    setFollowCursor(on) {
      refreshUi();
      put("following", on);
      follow();
      clampView();
      publish();
    },

    fitWidth() {
      refreshUi();
      const cols = js.cols;
      const width = js.viewWidth;
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
