// SPDX-License-Identifier: GPL-3.0-or-later
import {
  CursorShape,
  decodeMessage,
  encodeMessage,
  type Cursor,
  type GridDiff,
  type GridSnapshot,
  type Line,
  type Style,
} from "../protocol";
import { BLANK_GRID_CELL, DEFAULT_CELL_STYLE, GridModel, styleKey } from "./gridModel";

const PANE = 7;
const CURSOR: Cursor = { row: 0, col: 0, shape: CursorShape.block, visible: true };
const PLAIN: Style = [null, null, 0];
const RED: Style = [[0, 1], null, 0x01];

const empty: Line = [false, []];

/** Passes a host message through the real codec, so the fixtures are valid wire messages. */
function valid<T extends GridSnapshot | GridDiff>(message: T): T {
  const decoded = decodeMessage(encodeMessage(message), "host");
  if (!decoded.ok) {
    throw new Error(`fixture is not a valid message: ${decoded.error.message}`);
  }
  return decoded.message as T;
}

function snapshot(over: Partial<GridSnapshot> = {}): GridSnapshot {
  return valid({
    type: "grid-snapshot",
    pane: PANE,
    seq: 0,
    cols: 6,
    rows: 3,
    history: 10,
    dropped: 3,
    styles: [PLAIN, RED],
    lines: [
      [false, [[0, 1, 0, "ab"], [3, 1, 1, "c"]]],
      empty,
      [true, [[0, 2, 0, "日"]]],
    ],
    cursor: CURSOR,
    alt: false,
    ...over,
  });
}

function diff(seq: number, over: Partial<GridDiff> = {}): GridDiff {
  return valid({
    type: "grid-diff",
    pane: PANE,
    seq,
    history: 10,
    dropped: 3,
    styles: [PLAIN],
    lines: [],
    cursor: CURSOR,
    alt: false,
    ...over,
  });
}

function applied(): GridModel {
  const model = new GridModel();
  expect(model.applySnapshot(snapshot()).ok).toBe(true);
  model.takeDirtyRows();
  return model;
}

describe("applySnapshot", () => {
  it("replaces the whole state and acks after applying", () => {
    const model = new GridModel();
    expect(model.hasState).toBe(false);
    expect(model.expectedSeq).toBe(0);
    const result = model.applySnapshot(snapshot());
    expect(result).toEqual({ ok: true, ack: { type: "grid-ack", pane: PANE, seq: 0 } });
    expect(model.hasState).toBe(true);
    expect(model.cols).toBe(6);
    expect(model.rowsCount).toBe(3);
    expect(model.history).toBe(10);
    expect(model.dropped).toBe(3);
    expect(model.alt).toBe(false);
    expect(model.cursor).toEqual(CURSOR);
    expect(model.seq).toBe(0);
    expect(model.expectedSeq).toBe(1);
    expect(model.takeDirtyRows()).toEqual([0, 1, 2]);
    expect(model.takeDirtyRows()).toEqual([]);
  });

  it("is accepted at any time and the sequence goes on from its seq", () => {
    const model = applied();
    expect(model.applyDiff(diff(1)).ok).toBe(true);
    const result = model.applySnapshot(
      snapshot({ seq: 2, cols: 4, rows: 1, lines: [empty], history: 0, alt: true }),
    );
    expect(result).toEqual({ ok: true, ack: { type: "grid-ack", pane: PANE, seq: 2 } });
    expect(model.cols).toBe(4);
    expect(model.rowsCount).toBe(1);
    expect(model.alt).toBe(true);
    expect(model.takeDirtyRows()).toEqual([0]);
    expect(model.applyDiff(diff(3, { alt: true })).ok).toBe(true);
    expect(model.applyDiff(diff(3)).ok).toBe(false);
  });

  it("rejects a snapshot whose line count is not `rows` and keeps the old state", () => {
    const model = applied();
    expect(model.applySnapshot(snapshot({ seq: 1, rows: 4 }))).toEqual({
      ok: false,
      error: "protocol",
    });
    expect(model.seq).toBe(0);
    expect(model.rowsCount).toBe(3);
  });

  it("rejects a span whose style index is outside the table", () => {
    const model = new GridModel();
    const bad = snapshot({ lines: [[false, [[0, 1, 5, "x"]]], empty, empty] });
    expect(model.applySnapshot(bad)).toEqual({ ok: false, error: "protocol" });
    expect(model.hasState).toBe(false);
  });
});

describe("applyDiff", () => {
  it("replaces only the listed lines, resolves styles by the message table, and acks", () => {
    const model = applied();
    const result = model.applyDiff(
      diff(1, {
        history: 12,
        dropped: 5,
        styles: [RED, PLAIN],
        lines: [[1, [false, [[2, 1, 0, "z"]]]]],
        cursor: { row: 1, col: 3, shape: CursorShape.beam, visible: true },
      }),
    );
    expect(result).toEqual({ ok: true, ack: { type: "grid-ack", pane: PANE, seq: 1 } });
    expect(model.history).toBe(12);
    expect(model.dropped).toBe(5);
    expect(model.cursor.col).toBe(3);
    expect(model.cellAt(1, 2).text).toBe("z");
    expect(model.cellAt(1, 2).style.key).toBe(styleKey(RED));
    expect(model.cellAt(0, 0).text).toBe("a");
    expect(model.expectedSeq).toBe(2);
    expect(model.takeDirtyRows()).toEqual([0, 1]);
  });

  it("marks the old and the new cursor rows as dirty when the cursor moves", () => {
    const model = applied();
    model.applyDiff(diff(1, { cursor: { ...CURSOR, row: 2 } }));
    expect(model.takeDirtyRows()).toEqual([0, 2]);
  });

  it("marks nothing when only the same cursor comes", () => {
    const model = applied();
    model.applyDiff(diff(1));
    expect(model.takeDirtyRows()).toEqual([]);
  });

  it("rejects a seq gap, a repeated seq and a seq in the past, changing nothing", () => {
    const model = applied();
    for (const seq of [2, 0, 5]) {
      expect(model.applyDiff(diff(seq, { lines: [[0, empty]] }))).toEqual({
        ok: false,
        error: "protocol",
      });
    }
    expect(model.seq).toBe(0);
    expect(model.cellAt(0, 0).text).toBe("a");
    expect(model.takeDirtyRows()).toEqual([]);
  });

  it("rejects a diff before any snapshot", () => {
    expect(new GridModel().applyDiff(diff(0))).toEqual({ ok: false, error: "protocol" });
  });

  it("rejects a diff of another pane", () => {
    const model = applied();
    expect(model.applyDiff(diff(1, { pane: PANE + 1 }))).toEqual({ ok: false, error: "protocol" });
  });

  it("rejects a row outside the screen and leaves the earlier rows of the message unapplied", () => {
    const model = applied();
    const bad = diff(1, {
      lines: [
        [0, empty],
        [3, empty],
      ],
    });
    expect(model.applyDiff(bad)).toEqual({ ok: false, error: "protocol" });
    expect(model.cellAt(0, 0).text).toBe("a");
    expect(model.seq).toBe(0);
  });

  it("rejects a span whose style index is outside the message table", () => {
    const model = applied();
    const bad = diff(1, { styles: [PLAIN], lines: [[0, [false, [[0, 1, 1, "x"]]]]] });
    expect(model.applyDiff(bad)).toEqual({ ok: false, error: "protocol" });
  });
});

describe("cellAt", () => {
  it("places a plain span's code points at col + i, and fills gaps with a blank cell", () => {
    const model = applied();
    expect(model.cellAt(0, 0).text).toBe("a");
    expect(model.cellAt(0, 1).text).toBe("b");
    expect(model.cellAt(0, 2)).toBe(BLANK_GRID_CELL);
    expect(model.cellAt(0, 3).text).toBe("c");
    expect(model.cellAt(0, 3).style.flags).toBe(0x01);
    expect(model.cellAt(1, 4)).toBe(BLANK_GRID_CELL);
    expect(BLANK_GRID_CELL.style).toBe(DEFAULT_CELL_STYLE);
  });

  it("places the code points of a wide span at col + i * width", () => {
    const wide = snapshot({ lines: [[false, [[1, 2, 0, "日本"]]], empty, empty] });
    const model = new GridModel();
    model.applySnapshot(wide);
    expect(model.cellAt(0, 1)).toMatchObject({ text: "日", width: 2, continuation: false });
    expect(model.cellAt(0, 2)).toMatchObject({ text: "", width: 2, continuation: true });
    expect(model.cellAt(0, 3)).toMatchObject({ text: "本", width: 2, continuation: false });
    expect(model.cellAt(0, 4).continuation).toBe(true);
    expect(model.cellAt(0, 0)).toBe(BLANK_GRID_CELL);
  });

  it("puts a grapheme span (one-element array on the wire) in one cell", () => {
    const family = "👨‍👩‍👧";
    const flag = "🇧🇷";
    const accent = "é";
    const model = new GridModel();
    model.applySnapshot(
      snapshot({
        cols: 12,
        lines: [
          [
            false,
            [
              [0, 2, 0, [family]],
              [2, 2, 0, [flag]],
              [5, 1, 0, [accent]],
              [6, 1, 0, "xy"],
            ],
          ],
          empty,
          empty,
        ],
      }),
    );
    expect(model.cellAt(0, 0)).toMatchObject({ text: family, width: 2, continuation: false });
    expect(model.cellAt(0, 1).continuation).toBe(true);
    expect(model.cellAt(0, 2).text).toBe(flag);
    expect(model.cellAt(0, 4)).toBe(BLANK_GRID_CELL);
    expect(model.cellAt(0, 5).text).toBe(accent);
    expect(model.cellAt(0, 6).text).toBe("x");
    expect(model.cellAt(0, 7).text).toBe("y");
    expect(model.lineAt(0)?.spans.map((span) => span.grapheme)).toEqual([true, true, true, false]);
  });

  it("does not guess: text with a combining mark is one code point per cell", () => {
    // Without the wire's array form there is no grapheme span, whatever the text holds.
    const model = new GridModel();
    model.applySnapshot(snapshot({ cols: 6, lines: [[false, [[0, 1, 0, "é"]]], empty, empty] }));
    expect(model.cellAt(0, 0).text).toBe("e");
    expect(model.cellAt(0, 1).text).toBe("́");
  });

  it("clips what falls past the last column and answers blank out of range", () => {
    const model = new GridModel();
    model.applySnapshot(snapshot({ cols: 3, lines: [[false, [[2, 2, 0, "日a"]]], empty, empty] }));
    expect(model.cellAt(0, 2).text).toBe("日");
    expect(model.cellAt(0, 3)).toBe(BLANK_GRID_CELL);
    expect(model.cellAt(-1, 0)).toBe(BLANK_GRID_CELL);
    expect(model.cellAt(3, 0)).toBe(BLANK_GRID_CELL);
    expect(model.cellAt(0, 99)).toBe(BLANK_GRID_CELL);
  });

  it("sees the new content of a line after a diff", () => {
    const model = applied();
    expect(model.cellAt(0, 0).text).toBe("a");
    model.applyDiff(diff(1, { lines: [[0, [false, [[0, 1, 0, "Q"]]]]] }));
    expect(model.cellAt(0, 0).text).toBe("Q");
    expect(model.cellAt(0, 1)).toBe(BLANK_GRID_CELL);
  });
});

describe("styles", () => {
  it("builds the same key for equal styles and a different one otherwise", () => {
    expect(styleKey([[1, 0x112233], [0, 4], 3])).toBe(styleKey([[1, 0x112233], [0, 4], 3]));
    expect(styleKey([[1, 5], null, 0])).not.toBe(styleKey([[0, 5], null, 0]));
    expect(styleKey([null, [0, 5], 0])).not.toBe(styleKey([[0, 5], null, 0]));
    expect(styleKey([null, null, 1])).not.toBe(styleKey(PLAIN));
  });

  it("interns: equal styles are one object, across lines, tables and messages", () => {
    const model = new GridModel();
    model.applySnapshot(
      snapshot({
        styles: [RED, PLAIN, RED],
        lines: [
          [false, [[0, 1, 0, "a"], [1, 1, 2, "b"]]],
          [false, [[0, 1, 0, "c"]]],
          empty,
        ],
      }),
    );
    expect(model.cellAt(0, 0).style).toBe(model.cellAt(0, 1).style);
    expect(model.cellAt(0, 0).style).toBe(model.cellAt(1, 0).style);
    const before = model.cellAt(0, 0).style;
    model.applyDiff(diff(1, { styles: [[[0, 1], null, 0x01]], lines: [[2, [false, [[0, 1, 0, "d"]]]]] }));
    expect(model.cellAt(2, 0).style).toBe(before);
  });

  it("interns the default style as the shared default", () => {
    const model = applied();
    expect(model.cellAt(0, 0).style).toBe(DEFAULT_CELL_STYLE);
  });

  it("rebuilds the table when diffs make it grow past the limit, keeping what is on screen", () => {
    const model = applied();
    let seq = 1;
    for (let i = 0; i < 2100; i += 1) {
      model.applyDiff(
        diff(seq, {
          styles: [[[1, i], null, 0]],
          lines: [[1, [false, [[0, 1, 0, "x"]]]]],
        }),
      );
      seq += 1;
    }
    expect(model.styleCount).toBeLessThan(2048);
    expect(model.cellAt(1, 0).style.fg).toEqual([1, 2099]);
    expect(model.cellAt(0, 3).style.flags).toBe(0x01);
  });
});

describe("lineAt", () => {
  it("gives the wrapped flag and the spans, and undefined out of range", () => {
    const model = applied();
    expect(model.lineAt(2)?.wrapped).toBe(true);
    expect(model.lineAt(0)?.spans).toHaveLength(2);
    expect(model.lineAt(3)).toBeUndefined();
  });
});
