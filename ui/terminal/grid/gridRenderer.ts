// SPDX-License-Identifier: GPL-3.0-or-later
// The JS-thread side of the grid render (ADR-0002): from the grid model and
// the history cache to the two pictures the canvas draws, the frame (the
// lines of a window of content rows) and the cursor layer. Line recordings
// come from the line cache, so a new frame records only the lines that
// changed; composing it is one call per line.
//
// Content rows, top to bottom (src/terminal/viewport.ts): the `historyRows`
// history lines the host holds (content row j is history offset
// `historyRows - 1 - j`, absolute index `dropped + j`), then the live rows.
// A history line not cached yet is left blank until its page lands.
//
// Never logs: the grid is private.
import type { SkPicture } from "@shopify/react-native-skia";

import type { GridLine, GridModel } from "@/grid/gridModel";
import type { Theme } from "@/grid/colorMath";
import type { Scrollback, ScrollbackLine } from "@/grid/scrollback";

import { createLineCache, type LineCache, liveSlot } from "./lineCache";
import { type CursorShapeCode, historyLine, recordCursorOps, recordLineOps } from "./lineRecording";
import { type GridPainter, type PlacedPicture, emptyPicture, recordFrame } from "./skiaPainter";

/** What the renderer reads to draw: the controller's grid and history, as they are now. */
export interface RenderSource {
  readonly grid: GridModel | null;
  readonly scrollback: Scrollback | null;
  /** History rows in the content (0 on the alternate screen). */
  readonly historyRows: number;
  /** Lines already dropped from the top of the host's history (absolute index base). */
  readonly dropped: number;
}

/** An inclusive window of content rows. */
export interface RowWindow {
  readonly first: number;
  readonly last: number;
}

export interface GridRenderer {
  /** The frame picture of `window` (content units of the painter's metrics). */
  frame(source: RenderSource, window: RowWindow): SkPicture;
  /** The cursor layer, or an empty picture when the cursor is hidden or absent. */
  cursor(source: RenderSource): SkPicture;
  /** History content rows of `window` not cached yet (blank on screen). */
  missingHistory(source: RenderSource, window: RowWindow): number;
  /** Number of line recordings held. */
  readonly cachedLines: number;
  /** Drops every recording. */
  dispose(): void;
}

/** A renderer drawing with `painter` against the desktop `theme`. */
export function createGridRenderer(painter: GridPainter, theme: Theme): GridRenderer {
  const cache: LineCache<SkPicture> = createLineCache<SkPicture>((picture) => {
    picture.dispose();
  });
  const metrics = painter.metrics;

  function recordLive(line: GridLine, cols: number): SkPicture {
    return painter.record(recordLineOps(line, theme, metrics, cols), cols * metrics.cellWidth);
  }

  function recordHistory(entry: ScrollbackLine, cols: number): SkPicture {
    return recordLive(historyLine(entry.line, entry.styles), cols);
  }

  return {
    frame(source, window) {
      const grid = source.grid;
      if (grid === null) {
        cache.clear();
        return emptyPicture();
      }
      const cols = grid.cols;
      const total = source.historyRows + grid.rowsCount;
      const first = Math.max(0, window.first);
      const last = Math.min(total - 1, window.last);
      const placed: PlacedPicture[] = [];
      for (let row = first; row <= last; row += 1) {
        const y = row * metrics.lineHeight;
        if (row < source.historyRows) {
          const entry = source.scrollback?.lineAt(source.historyRows - 1 - row);
          if (entry !== undefined) {
            const picture = cache.get(source.dropped + row, entry, (line) => recordHistory(line, cols));
            placed.push({ y, picture });
          }
          continue;
        }
        const liveRow = row - source.historyRows;
        const line = grid.lineAt(liveRow);
        if (line !== undefined) {
          placed.push({ y, picture: cache.get(liveSlot(liveRow), line, (it) => recordLive(it, cols)) });
        }
      }
      const historyFirst = source.dropped + first;
      const historyLast = source.dropped + Math.min(last, source.historyRows - 1);
      const liveFirst = Math.max(0, first - source.historyRows);
      const liveLast = last - source.historyRows;
      cache.retain((slot) =>
        slot >= 0
          ? slot >= historyFirst && slot <= historyLast
          : -slot - 1 >= liveFirst && -slot - 1 <= liveLast && -slot - 1 < grid.rowsCount,
      );
      return recordFrame(
        placed,
        cols * metrics.cellWidth,
        first * metrics.lineHeight,
        (last - first + 1) * metrics.lineHeight,
      );
    },

    cursor(source) {
      const grid = source.grid;
      const cursor = grid?.cursor;
      if (grid === null || cursor === undefined || !cursor.visible || cursor.row >= grid.rowsCount) {
        return emptyPicture();
      }
      const col = Math.min(Math.max(cursor.col, 0), Math.max(grid.cols - 1, 0));
      const cell = grid.cellAt(cursor.row, col);
      const ops = recordCursorOps(cursor.shape as CursorShapeCode, col, cell, theme, metrics);
      const line = painter.record(ops, grid.cols * metrics.cellWidth);
      const placed = recordFrame(
        [{ y: (source.historyRows + cursor.row) * metrics.lineHeight, picture: line }],
        grid.cols * metrics.cellWidth,
        0,
        (source.historyRows + grid.rowsCount) * metrics.lineHeight,
      );
      line.dispose();
      return placed;
    },

    missingHistory(source, window) {
      if (source.scrollback === null) {
        return 0;
      }
      const first = Math.max(0, window.first);
      const last = Math.min(source.historyRows - 1, window.last);
      let missing = 0;
      for (let row = first; row <= last; row += 1) {
        if (source.scrollback.lineAt(source.historyRows - 1 - row) === undefined) {
          missing += 1;
        }
      }
      return missing;
    },

    get cachedLines() {
      return cache.size;
    },

    dispose() {
      cache.clear();
    },
  };
}
