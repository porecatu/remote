// SPDX-License-Identifier: GPL-3.0-or-later

// State of one grid subscription (spec 03 §5.1-5.4): the screen the desktop
// sent, line by line, with each span's style already resolved against the
// message's style table and interned, so the renderer never allocates a style
// object per cell. Pure: no React, no renderer, no clock, no I/O. It never
// logs: the content of a grid is private (CLAUDE.md, Segurança).

import {
  type Color,
  type Cursor,
  CursorShape,
  type GridAck,
  type GridDiff,
  type GridSnapshot,
  type Line,
  type PaneId,
  type Style,
} from "../protocol";

/** What the caller does with a rejected message: send `error{protocol}` and close (spec 03 §5.3). */
export type ApplyResult =
  | { readonly ok: true; readonly ack: GridAck }
  | { readonly ok: false; readonly error: "protocol" };

/** A style from a message table, interned: equal styles are the same object. */
export type InternedStyle = Readonly<{
  /** Stable text form (`styleKey`); equal keys mean equal styles. */
  key: string;
  fg: Color;
  bg: Color;
  flags: number;
}>;

/**
 * A span with its style resolved. `col` and `width` are the wire values.
 * `grapheme` is the wire's own mark (spec 03 §5.2): `true` when `text` came as
 * a one-element array, so it is a single multi-code-point grapheme in one
 * cell; `false` when it came as text, one code point per cell.
 */
export type GridSpan = Readonly<{
  col: number;
  width: 1 | 2;
  style: InternedStyle;
  text: string;
  grapheme: boolean;
}>;

/**
 * One screen cell. `text` is one code point, or one whole grapheme for a span
 * the wire marked as a grapheme. The right half of a wide cell is
 * `continuation: true` with empty `text` (the renderer paints nothing there).
 */
export type GridCell = Readonly<{
  text: string;
  width: 1 | 2;
  style: InternedStyle;
  continuation: boolean;
}>;

export type GridLine = Readonly<{ wrapped: boolean; spans: readonly GridSpan[] }>;

const COLOR_KEY_DEFAULT = "d";

function colorKey(color: Color): string {
  if (color === null) {
    return COLOR_KEY_DEFAULT;
  }
  return color[0] === 0 ? `i${color[1]}` : `r${color[1]}`;
}

/** Stable text form of a wire style: equal styles give equal keys. */
export function styleKey(style: Style): string {
  return `${colorKey(style[0])}|${colorKey(style[1])}|${style[2]}`;
}

const DEFAULT_STYLE: InternedStyle = Object.freeze({
  key: styleKey([null, null, 0]),
  fg: null,
  bg: null,
  flags: 0,
});

/** The style of a cell that has no span: default colors, no flags. */
export const DEFAULT_CELL_STYLE: InternedStyle = DEFAULT_STYLE;

const BLANK_CELL: GridCell = Object.freeze({
  text: " ",
  width: 1,
  style: DEFAULT_STYLE,
  continuation: false,
});

/** The cell of any coordinate no span covers (and of out-of-range ones). */
export const BLANK_GRID_CELL: GridCell = BLANK_CELL;

/** Above this many distinct styles, a diff triggers a rebuild of the table. */
const MAX_INTERNED_STYLES = 2048;

class StyleTable {
  private readonly byKey = new Map<string, InternedStyle>();

  constructor() {
    this.byKey.set(DEFAULT_STYLE.key, DEFAULT_STYLE);
  }

  get size(): number {
    return this.byKey.size;
  }

  intern(style: Style): InternedStyle {
    const key = styleKey(style);
    const known = this.byKey.get(key);
    if (known !== undefined) {
      return known;
    }
    const created: InternedStyle = Object.freeze({
      key,
      fg: style[0],
      bg: style[1],
      flags: style[2],
    });
    this.byKey.set(key, created);
    return created;
  }

  /** Re-interns an already interned style into this table (same key, same object here). */
  adopt(style: InternedStyle): InternedStyle {
    const known = this.byKey.get(style.key);
    if (known !== undefined) {
      return known;
    }
    this.byKey.set(style.key, style);
    return style;
  }
}

type Row = {
  wrapped: boolean;
  spans: readonly GridSpan[];
  /** Expanded cells, built on the first `cellAt` after a change; `null` = stale. */
  cells: GridCell[] | null;
};

function expandRow(row: Row, cols: number): GridCell[] {
  const cells: GridCell[] = new Array<GridCell>(cols).fill(BLANK_CELL);
  for (const span of row.spans) {
    const step = span.width;
    if (span.grapheme) {
      // The wire marked it: one grapheme, one cell (no segmentation here).
      put(cells, cols, span.col, span.text, step, span.style);
      continue;
    }
    let col = span.col;
    for (const codePoint of span.text) {
      put(cells, cols, col, codePoint, step, span.style);
      col += step;
    }
  }
  return cells;
}

function put(
  cells: GridCell[],
  cols: number,
  col: number,
  text: string,
  width: 1 | 2,
  style: InternedStyle,
): void {
  if (col >= cols) {
    return;
  }
  cells[col] = { text, width, style, continuation: false };
  if (width === 2 && col + 1 < cols) {
    cells[col + 1] = { text: "", width: 2, style, continuation: true };
  }
}

const PROTOCOL_ERROR: ApplyResult = Object.freeze({ ok: false, error: "protocol" });

export class GridModel {
  private paneId: PaneId | null = null;
  private colCount = 0;
  private rowCount = 0;
  private historyCount = 0;
  private droppedCount = 0;
  private altScreen = false;
  private cursorState: Cursor = { row: 0, col: 0, shape: CursorShape.block, visible: false };
  private lastSeq: number | null = null;
  private rows: Row[] = [];
  private table = new StyleTable();
  private readonly dirty = new Set<number>();

  /** `true` once a snapshot has been applied; a diff before that is a protocol error. */
  get hasState(): boolean {
    return this.lastSeq !== null;
  }

  get pane(): PaneId | null {
    return this.paneId;
  }

  get cols(): number {
    return this.colCount;
  }

  get rowsCount(): number {
    return this.rowCount;
  }

  get history(): number {
    return this.historyCount;
  }

  /** Lines already dropped from the top of the pane's history (spec 03 §5.5). */
  get dropped(): number {
    return this.droppedCount;
  }

  get alt(): boolean {
    return this.altScreen;
  }

  get cursor(): Cursor {
    return this.cursorState;
  }

  /** `seq` of the last applied message, or `null` before the first one. */
  get seq(): number | null {
    return this.lastSeq;
  }

  /** The `seq` the next `grid-diff` must carry (0 before the first message). */
  get expectedSeq(): number {
    return this.lastSeq === null ? 0 : this.lastSeq + 1;
  }

  /**
   * Replaces everything. Accepted at any time (spec 03 §5.3); the message's
   * `seq` becomes the last one and the sequence goes on from it. Rejects only
   * a malformed message (line count different from `rows`, style index out of
   * the table).
   */
  applySnapshot(msg: GridSnapshot): ApplyResult {
    if (msg.lines.length !== msg.rows) {
      return PROTOCOL_ERROR;
    }
    const table = new StyleTable();
    const interned = msg.styles.map((style) => table.intern(style));
    const rows: Row[] = [];
    for (const line of msg.lines) {
      const row = buildRow(line, interned);
      if (row === null) {
        return PROTOCOL_ERROR;
      }
      rows.push(row);
    }
    this.table = table;
    this.rows = rows;
    this.paneId = msg.pane;
    this.colCount = msg.cols;
    this.rowCount = msg.rows;
    this.historyCount = msg.history;
    this.droppedCount = msg.dropped;
    this.altScreen = msg.alt;
    this.cursorState = msg.cursor;
    this.lastSeq = msg.seq;
    this.dirty.clear();
    for (let row = 0; row < rows.length; row += 1) {
      this.dirty.add(row);
    }
    return ack(msg.pane, msg.seq);
  }

  /**
   * Replaces the listed lines. `seq` must be the last one plus one and a
   * snapshot must have come before; otherwise nothing changes and the result
   * is `{ ok: false, error: "protocol" }` (spec 03 §5.3).
   */
  applyDiff(msg: GridDiff): ApplyResult {
    if (this.lastSeq === null || msg.seq !== this.lastSeq + 1 || msg.pane !== this.paneId) {
      return PROTOCOL_ERROR;
    }
    const interned = msg.styles.map((style) => this.table.intern(style));
    const replaced: [number, Row][] = [];
    for (const [rowIndex, line] of msg.lines) {
      if (rowIndex >= this.rowCount) {
        return PROTOCOL_ERROR;
      }
      const row = buildRow(line, interned);
      if (row === null) {
        return PROTOCOL_ERROR;
      }
      replaced.push([rowIndex, row]);
    }
    const previousCursor = this.cursorState;
    for (const [rowIndex, row] of replaced) {
      this.rows[rowIndex] = row;
      this.dirty.add(rowIndex);
    }
    this.historyCount = msg.history;
    this.droppedCount = msg.dropped;
    this.altScreen = msg.alt;
    this.cursorState = msg.cursor;
    if (!sameCursor(previousCursor, msg.cursor)) {
      // The cursor is painted over its row: both the old and the new row repaint.
      this.markCursorRow(previousCursor.row);
      this.markCursorRow(msg.cursor.row);
    }
    this.lastSeq = msg.seq;
    if (this.table.size > MAX_INTERNED_STYLES) {
      this.compactStyles();
    }
    return ack(msg.pane, msg.seq);
  }

  /** The cell at a coordinate; blank (default style) where no span covers it or out of range. */
  cellAt(row: number, col: number): GridCell {
    if (row < 0 || row >= this.rowCount || col < 0 || col >= this.colCount) {
      return BLANK_CELL;
    }
    const line = this.rows[row];
    if (line === undefined) {
      return BLANK_CELL;
    }
    line.cells ??= expandRow(line, this.colCount);
    return line.cells[col] ?? BLANK_CELL;
  }

  /** The spans of a line, for a renderer that paints by run. `undefined` out of range. */
  lineAt(row: number): GridLine | undefined {
    return this.rows[row];
  }

  /** Rows changed since the last call, ascending; clears the set. */
  takeDirtyRows(): number[] {
    const rows = [...this.dirty].sort((a, b) => a - b);
    this.dirty.clear();
    return rows;
  }

  /** Number of distinct interned styles; exposed for tests and diagnostics. */
  get styleCount(): number {
    return this.table.size;
  }

  private markCursorRow(row: number): void {
    if (row >= 0 && row < this.rowCount) {
      this.dirty.add(row);
    }
  }

  private compactStyles(): void {
    const table = new StyleTable();
    for (const row of this.rows) {
      row.spans = row.spans.map((span) => ({ ...span, style: table.adopt(span.style) }));
      row.cells = null;
    }
    this.table = table;
  }
}

function ack(pane: PaneId, seq: number): ApplyResult {
  return { ok: true, ack: { type: "grid-ack", pane, seq } };
}

function sameCursor(a: Cursor, b: Cursor): boolean {
  return a.row === b.row && a.col === b.col && a.shape === b.shape && a.visible === b.visible;
}

function buildRow(line: Line, styles: readonly InternedStyle[]): Row | null {
  const spans: GridSpan[] = [];
  for (const [col, width, style, wireText] of line[1]) {
    const interned = styles[style];
    if (interned === undefined) {
      return null;
    }
    const grapheme = typeof wireText !== "string";
    const text = typeof wireText === "string" ? wireText : (wireText[0] ?? "");
    spans.push({ col, width, style: interned, text, grapheme });
  }
  return { wrapped: line[0], spans, cells: null };
}
