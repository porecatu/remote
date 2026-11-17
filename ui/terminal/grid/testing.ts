// SPDX-License-Identifier: GPL-3.0-or-later
// Test kit of the grid: a stand-in for the terminal controller over a real
// grid model and a real history cache, driven by hand (snapshots, diffs,
// history pages), the way `createTerminalSession` exposes them.
import { createStore } from "zustand/vanilla";

import type { HistoryView, TerminalState } from "@/controllers/terminalSession";
import { GridModel } from "@/grid/gridModel";
import { Scrollback } from "@/grid/scrollback";
import { CursorShape, type Cursor, type Line, type ScrollbackRequest, type Style } from "@/protocol";

import type { Box, GridSession } from "./gridEngine";

const PANE = 1;
const PLAIN: Style = [null, null, 0];

export interface FakeGridOptions {
  readonly cols?: number;
  readonly rows?: number;
  /** History lines the host holds. */
  readonly history?: number;
  readonly dropped?: number;
  readonly alt?: boolean;
  readonly cursor?: Partial<Cursor>;
  /** Text of each live row (missing rows are empty). */
  readonly lines?: readonly string[];
}

export interface FakeGridSession extends GridSession {
  readonly model: GridModel;
  readonly history: Scrollback;
  /** Every `requestHistory(viewportTopOffset, count)` call. */
  readonly historyCalls: [number, number][];
  /** Requests that went out and are not answered yet. */
  readonly pending: ScrollbackRequest[];
  /** Replaces live rows (a `grid-diff`), optionally growing the history. */
  diff(rows: readonly [number, string][], over?: { history?: number; dropped?: number; cursor?: Partial<Cursor> }): void;
  /** Answers the oldest pending request with lines "H<offset>". */
  answer(): void;
}

function textLine(text: string): Line {
  return [false, text.length === 0 ? [] : [[0, 1, 0, text]]];
}

export function createFakeGridSession(options: FakeGridOptions = {}): FakeGridSession {
  const cols = options.cols ?? 80;
  const rows = options.rows ?? 24;
  let history = options.history ?? 0;
  let dropped = options.dropped ?? 0;
  const alt = options.alt ?? false;
  let cursor: Cursor = { row: 0, col: 0, shape: CursorShape.block, visible: true, ...options.cursor };
  let seq = 0;
  let version = 1;
  let nextId = 0;
  let now = 1000;

  const model = new GridModel();
  model.applySnapshot({
    type: "grid-snapshot",
    pane: PANE,
    seq,
    cols,
    rows,
    history,
    dropped,
    styles: [PLAIN],
    lines: Array.from({ length: rows }, (_, row) => textLine(options.lines?.[row] ?? "")),
    cursor,
    alt,
  });
  const scrollback = new Scrollback({
    pane: PANE,
    nextRequestId: () => {
      nextId += 1;
      return nextId;
    },
  });
  scrollback.onSnapshot({ history, dropped, alt });

  const historyView = (): HistoryView => ({
    lines: history,
    dropped,
    total: history + dropped,
    generation: 1,
    alt,
    loadingPages: scrollback.pendingRequests,
    reachedOldest: alt || history === 0 || scrollback.lineAt(history - 1) !== undefined,
  });

  const store = createStore<TerminalState>(() => ({
    tabId: 1,
    paneId: PANE,
    focusedPaneId: PANE,
    panes: [],
    layout: null,
    paneState: null,
    exitCode: null,
    status: "live",
    unavailable: null,
    stale: false,
    version,
    cursor,
    alt,
    cols,
    rows,
    history: historyView(),
    modifiers: { ctrl: "off", alt: "off" },
    paste: null,
    tabGone: null,
    canType: true,
  }));

  const refresh = (redraw: boolean): void => {
    if (redraw) {
      version += 1;
    }
    store.setState({ version, cursor, history: historyView() });
  };

  const historyCalls: [number, number][] = [];
  const pending: ScrollbackRequest[] = [];

  return {
    store,
    model,
    history: scrollback,
    historyCalls,
    pending,
    grid: () => model,
    scrollback: () => scrollback,
    requestHistory(viewportTopOffset, count) {
      historyCalls.push([viewportTopOffset, count]);
      now += 1;
      const request = scrollback.requestFor(viewportTopOffset, count, now);
      if (request !== null) {
        pending.push(request);
      }
      refresh(false);
      return request !== null;
    },
    diff(changed, over = {}) {
      seq += 1;
      history = over.history ?? history;
      dropped = over.dropped ?? dropped;
      cursor = { ...cursor, ...over.cursor };
      model.applyDiff({
        type: "grid-diff",
        pane: PANE,
        seq,
        history,
        dropped,
        styles: [PLAIN],
        lines: changed.map(([row, text]) => [row, textLine(text)] as const),
        cursor,
        alt,
      });
      scrollback.onDiff({ history, dropped, alt });
      refresh(true);
    },
    answer() {
      const request = pending.shift();
      if (request === undefined) {
        return;
      }
      const lines: Line[] = [];
      for (let offset = request.offset + request.count - 1; offset >= request.offset; offset -= 1) {
        lines.push(textLine(`H${String(offset)}`));
      }
      scrollback.applyPage({
        type: "scrollback-page",
        id: request.id,
        pane: PANE,
        history,
        dropped,
        offset: request.offset,
        styles: [PLAIN],
        lines,
      });
      refresh(true);
    },
  };
}

/** The desktop theme of the tests. */
export const TEST_GRID_THEME = {
  fg: 0xd4d4d4,
  bg: 0x1e1e1e,
  cursor: 0xffffff,
  selectionBg: 0x264f78,
  palette: Array.from({ length: 16 }, (_, index) => 0x101010 * index),
} as const;

/**
 * A box that behaves like a Reanimated 4 shared value read from the JS thread:
 * a write is queued for the UI thread and reads return the last value the UI
 * thread applied, until `flush()` (the UI thread catching up).
 */
export interface DeferredBox<T> extends Box<T> {
  /** The UI thread applies every queued write. */
  flush(): void;
  /** The UI thread writes a value (a gesture): applied at once, and what the next read returns. */
  writeOnUi(next: T): void;
}

export function deferredBox<T>(initial: T): DeferredBox<T> {
  let applied = initial;
  const queue: T[] = [];
  return {
    get value() {
      return applied;
    },
    set value(next: T) {
      queue.push(next);
    },
    flush() {
      while (queue.length > 0) {
        applied = queue.shift() as T;
      }
    },
    writeOnUi(next: T) {
      applied = next;
    },
  };
}
