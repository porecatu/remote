// SPDX-License-Identifier: GPL-3.0-or-later
import { DIM_FACTOR, STYLE_FLAG, type Theme, blend } from "@/grid/colorMath";
import { xtermColor } from "@/grid/xtermPalette";
import type { Color } from "@/protocol";

import type { ArcOp, DrawOp, LineOp, RectOp, TextOp } from "./drawOps";
import {
  FONT_METRICS_EM,
  RECORDING_FONT_SIZE,
  type RecordLine,
  type RecordSpan,
  historyLine,
  lineMetrics,
  lineText,
  recordCursorOps,
  recordLineOps,
} from "./lineRecording";

const theme: Theme = {
  fg: 0xd4d4d4,
  bg: 0x1e1e1e,
  cursor: 0xffffff,
  selectionBg: 0x264f78,
  palette: Array.from({ length: 16 }, (_, index) => 0x010101 * (index + 1)),
};

const metrics = lineMetrics(12);
const cw = metrics.cellWidth;
const lh = metrics.lineHeight;

function span(col: number, text: string, over: Partial<RecordSpan> & { fg?: Color; bg?: Color; flags?: number } = {}): RecordSpan {
  return {
    col,
    width: over.width ?? 1,
    style: { fg: over.fg ?? null, bg: over.bg ?? null, flags: over.flags ?? 0 },
    text,
    grapheme: over.grapheme ?? false,
  };
}

function line(...spans: RecordSpan[]): RecordLine {
  return { spans };
}

const texts = (ops: DrawOp[]): TextOp[] => ops.filter((op): op is TextOp => op.kind === "text");
const rects = (ops: DrawOp[]): RectOp[] => ops.filter((op): op is RectOp => op.kind === "rect");

describe("lineMetrics", () => {
  it("uses 0.5 em cells, 1.3 lines and the font's own metrics", () => {
    expect(metrics.cellWidth).toBe(6);
    expect(metrics.lineHeight).toBeCloseTo(15.6);
    // Ascent + descent (1.25 em) centred in 1.3 em: baseline at 0.025 + 0.965 em.
    expect(metrics.baseline).toBeCloseTo(12 * 0.99);
    expect(metrics.underlineThickness).toBeCloseTo(12 * FONT_METRICS_EM.underlineThickness);
    expect(metrics.underlineTop).toBeGreaterThan(metrics.baseline);
    expect(metrics.strikeoutTop).toBeLessThan(metrics.baseline);
    expect(metrics.strokes.heavy).toBeCloseTo(metrics.strokes.light * 2);
  });

  it("records at the reading size by default", () => {
    expect(lineMetrics().fontSize).toBe(RECORDING_FONT_SIZE);
  });
});

describe("recordLineOps: columns", () => {
  it("places the i-th code point at col + i × width", () => {
    const ops = recordLineOps(line(span(2, "abc")), theme, metrics, 80);
    const [text] = texts(ops);
    expect(text?.cells).toEqual(["a", "b", "c"]);
    expect(text?.xs).toEqual([2 * cw, 3 * cw, 4 * cw]);
    expect(text?.boxWidth).toBe(cw);
    expect(text?.baseline).toBe(metrics.baseline);
  });

  it("gives a wide character two cells", () => {
    const ops = recordLineOps(line(span(0, "日本", { width: 2, bg: [0, 1] })), theme, metrics, 80);
    const [text] = texts(ops);
    expect(text?.xs).toEqual([0, 2 * cw]);
    expect(text?.boxWidth).toBe(2 * cw);
    expect(rects(ops)[0]).toMatchObject({ x: 0, width: 4 * cw });
  });

  it("keeps a grapheme the wire marked in one cell", () => {
    const ops = recordLineOps(line(span(5, "👍🏽", { width: 2, grapheme: true })), theme, metrics, 80);
    const [text] = texts(ops);
    expect(text?.cells).toEqual(["👍🏽"]);
    expect(text?.xs).toEqual([5 * cw]);
  });

  it("skips spaces in the text but keeps their columns", () => {
    const [text] = texts(recordLineOps(line(span(0, "a b")), theme, metrics, 80));
    expect(text?.cells).toEqual(["a", "b"]);
    expect(text?.xs).toEqual([0, 2 * cw]);
  });

  it("drops cells at or past the last column", () => {
    const ops = recordLineOps(line(span(3, "abcd", { bg: [0, 2] })), theme, metrics, 5);
    expect(texts(ops)[0]?.cells).toEqual(["a", "b"]);
    expect(rects(ops)[0]).toMatchObject({ x: 3 * cw, width: 2 * cw });
  });
});

describe("recordLineOps: colors", () => {
  const colorsOf = (fg: Color, bg: Color, flags = 0) => {
    const ops = recordLineOps(line(span(0, "x", { fg, bg, flags })), theme, metrics, 80);
    return { text: texts(ops)[0], background: rects(ops)[0] };
  };

  it("paints no background for the theme background", () => {
    const { text, background } = colorsOf(null, null);
    expect(text?.color).toBe(theme.fg);
    expect(background).toBeUndefined();
  });

  it("resolves 0-15 from the theme palette", () => {
    const { text, background } = colorsOf([0, 3], [0, 12]);
    expect(text?.color).toBe(theme.palette[3]);
    expect(background?.color).toBe(theme.palette[12]);
    expect(background).toMatchObject({ x: 0, y: 0, width: cw, height: lh });
  });

  it("resolves 16-255 from the xterm table", () => {
    const { text, background } = colorsOf([0, 196], [0, 240]);
    expect(text?.color).toBe(xtermColor(196));
    expect(background?.color).toBe(xtermColor(240));
  });

  it("uses direct colors as they come", () => {
    const { text, background } = colorsOf([1, 0x123456], [1, 0xabcdef]);
    expect(text?.color).toBe(0x123456);
    expect(background?.color).toBe(0xabcdef);
  });

  it("swaps colors for inverse, painting the default foreground as background", () => {
    const { text, background } = colorsOf(null, null, STYLE_FLAG.inverse);
    expect(text?.color).toBe(theme.bg);
    expect(background?.color).toBe(theme.fg);
  });

  it("blends dim text into its background", () => {
    const { text } = colorsOf([1, 0xffffff], [1, 0x000000], STYLE_FLAG.dim);
    expect(text?.color).toBe(blend(0xffffff, 0x000000, DIM_FACTOR));
  });

  it("draws no text and no decoration for hidden, but keeps the background", () => {
    const ops = recordLineOps(
      line(span(0, "secret", { bg: [0, 1], flags: STYLE_FLAG.hidden | STYLE_FLAG.underline })),
      theme,
      metrics,
      80,
    );
    expect(texts(ops)).toHaveLength(0);
    expect(rects(ops)).toHaveLength(1);
    expect(rects(ops)[0]?.color).toBe(theme.palette[1]);
  });

  it("merges neighbouring backgrounds of the same color", () => {
    const ops = recordLineOps(line(span(0, "ab", { bg: [0, 4] }), span(2, "cd", { bg: [0, 4], fg: [0, 2] })), theme, metrics, 80);
    const backgrounds = rects(ops).filter((op) => op.color === theme.palette[4]);
    expect(backgrounds).toEqual([{ kind: "rect", x: 0, y: 0, width: 4 * cw, height: lh, color: theme.palette[4] }]);
  });
});

describe("recordLineOps: styles and decorations", () => {
  it("marks bold and italic for the painter", () => {
    const [text] = texts(recordLineOps(line(span(0, "b", { flags: STYLE_FLAG.bold | STYLE_FLAG.italic })), theme, metrics, 80));
    expect(text).toMatchObject({ bold: true, italic: true });
  });

  it("underlines and strikes through the whole span in the foreground", () => {
    const ops = recordLineOps(
      line(span(1, "a c", { fg: [0, 5], flags: STYLE_FLAG.underline | STYLE_FLAG.strikethrough })),
      theme,
      metrics,
      80,
    );
    const [underline, strike] = rects(ops);
    expect(underline).toMatchObject({ x: cw, width: 3 * cw, y: metrics.underlineTop, height: metrics.underlineThickness, color: theme.palette[5] });
    expect(strike).toMatchObject({ x: cw, width: 3 * cw, y: metrics.strikeoutTop, height: metrics.strikeoutThickness });
    // Decorations go after the text.
    expect(ops.indexOf(underline as DrawOp)).toBeGreaterThan(ops.findIndex((op) => op.kind === "text"));
  });

  it("puts backgrounds before everything else", () => {
    const ops = recordLineOps(line(span(0, "a", { bg: [0, 1] }), span(1, "─", { bg: [0, 2] })), theme, metrics, 80);
    expect(ops[0]).toMatchObject({ kind: "rect", color: theme.palette[1] });
    expect(ops[1]).toMatchObject({ kind: "rect", color: theme.palette[2] });
  });
});

describe("recordLineOps: box drawing and blocks", () => {
  const shapes = (text: string, over: Parameters<typeof span>[2] = {}) =>
    recordLineOps(line(span(0, text, over)), theme, metrics, 80);

  it("turns ─ into a rectangle across the cell, not a glyph", () => {
    const ops = shapes("─");
    expect(texts(ops)).toHaveLength(0);
    const strokes = rects(ops);
    expect(strokes).toHaveLength(2);
    expect(Math.min(...strokes.map((op) => op.x))).toBeCloseTo(0);
    expect(Math.max(...strokes.map((op) => op.x + op.width))).toBeCloseTo(cw);
    for (const stroke of strokes) {
      expect(stroke.height).toBeCloseTo(metrics.strokes.light);
      expect(stroke.y + stroke.height / 2).toBeCloseTo(lh / 2);
    }
  });

  it("reaches the cell edges so neighbours join with no seam", () => {
    const ops = shapes("──");
    const strokes = rects(ops);
    const right = Math.max(...strokes.map((op) => op.x + op.width));
    expect(right).toBeCloseTo(2 * cw);
  });

  it("draws │ top to bottom and ┃ heavier", () => {
    const light = rects(shapes("│"));
    const heavy = rects(shapes("┃"));
    const span = (ops: RectOp[]) => [Math.min(...ops.map((op) => op.y)), Math.max(...ops.map((op) => op.y + op.height))];
    expect(span(light)[0]).toBeCloseTo(0);
    expect(span(light)[1]).toBeCloseTo(lh);
    expect(heavy[0]?.width).toBeCloseTo(metrics.strokes.heavy);
  });

  it("closes a corner: ┌ has a right arm and a down arm meeting at the centre", () => {
    const ops = rects(shapes("┌"));
    expect(ops).toHaveLength(2);
    const horizontal = ops.find((op) => op.width > op.height);
    const vertical = ops.find((op) => op.height > op.width);
    expect(horizontal?.x).toBeLessThanOrEqual(cw / 2 - metrics.strokes.light / 2 + 1e-9);
    expect(vertical?.y).toBeLessThanOrEqual(lh / 2 - metrics.strokes.light / 2 + 1e-9);
    expect((vertical?.y ?? 0) + (vertical?.height ?? 0)).toBeCloseTo(lh);
  });

  it("draws double lines as two light lines", () => {
    const ops = rects(shapes("═"));
    const ys = [...new Set(ops.map((op) => Math.round((op.y + op.height / 2) * 1000)))];
    expect(ys).toHaveLength(2);
    expect(ops.every((op) => Math.abs(op.height - metrics.strokes.light) < 1e-9)).toBe(true);
  });

  it("draws ╔ with the outer and inner corners", () => {
    expect(rects(shapes("╔"))).toHaveLength(4);
  });

  it("draws dashes as separate pieces", () => {
    expect(rects(shapes("┄"))).toHaveLength(3);
    expect(rects(shapes("┊"))).toHaveLength(4);
    expect(rects(shapes("╌"))).toHaveLength(2);
  });

  it("draws rounded corners as arcs and diagonals as lines", () => {
    const arcs = shapes("╭").filter((op): op is ArcOp => op.kind === "arc");
    expect(arcs).toHaveLength(1);
    expect(arcs[0]).toMatchObject({ startAngle: 180, sweepAngle: 90, radius: cw / 2 });
    const lines = shapes("╳").filter((op): op is LineOp => op.kind === "line");
    expect(lines).toHaveLength(2);
  });

  it("fills blocks: full, halves, eighths and quadrants", () => {
    expect(rects(shapes("█", { fg: [0, 2] }))).toEqual([{ kind: "rect", x: 0, y: 0, width: cw, height: lh, color: theme.palette[2] }]);
    expect(rects(shapes("▀"))[0]).toMatchObject({ y: 0, height: lh / 2 });
    expect(rects(shapes("▄"))[0]).toMatchObject({ y: lh / 2, height: lh / 2 });
    expect(rects(shapes("▁"))[0]?.height).toBeCloseTo(lh / 8);
    expect(rects(shapes("▏"))[0]?.width).toBeCloseTo(cw / 8);
    expect(rects(shapes("▐"))[0]).toMatchObject({ x: cw / 2, width: cw / 2 });
    expect(rects(shapes("▚"))).toHaveLength(2);
    expect(rects(shapes("▙"))).toHaveLength(3);
  });

  it("shades by blending the foreground into the background", () => {
    const [shade] = rects(shapes("▒", { fg: [1, 0xffffff], bg: [1, 0x000000] })).filter((op) => op.width === cw && op.color !== 0);
    expect(shade?.color).toBe(blend(0xffffff, 0x000000, 0.5));
  });

  it("draws a box character in a span marked as grapheme as text", () => {
    expect(texts(shapes("─", { grapheme: true }))).toHaveLength(1);
  });
});

describe("recordCursorOps", () => {
  const cell = { text: "a", width: 1 as const, style: { fg: null, bg: null, flags: 0 }, continuation: false };

  it("draws a block in the cursor color with the character in the background color", () => {
    const ops = recordCursorOps(0, 3, cell, theme, metrics);
    expect(ops[0]).toEqual({ kind: "rect", x: 3 * cw, y: 0, width: cw, height: lh, color: theme.cursor });
    expect(ops[1]).toMatchObject({ kind: "text", cells: ["a"], xs: [3 * cw], color: theme.bg });
  });

  it("draws an underline and a beam as thin bars", () => {
    expect(recordCursorOps(1, 0, cell, theme, metrics)).toEqual([
      { kind: "rect", x: 0, y: lh - metrics.strokes.heavy, width: cw, height: metrics.strokes.heavy, color: theme.cursor },
    ]);
    expect(recordCursorOps(2, 2, cell, theme, metrics)).toEqual([
      { kind: "rect", x: 2 * cw, y: 0, width: metrics.strokes.heavy, height: lh, color: theme.cursor },
    ]);
  });

  it("covers both cells of a wide character", () => {
    expect(recordCursorOps(0, 0, { ...cell, text: "日", width: 2 }, theme, metrics)[0]).toMatchObject({ width: 2 * cw });
  });
});

describe("historyLine and lineText", () => {
  it("reads a wire line with its page's style table", () => {
    const converted = historyLine(
      [true, [[0, 1, 1, "ab"], [4, 2, 0, ["👍🏽"]]]],
      [
        [null, null, 0],
        [[0, 1], null, STYLE_FLAG.bold],
      ],
    );
    expect(converted.wrapped).toBe(true);
    expect(converted.spans[0]).toMatchObject({ col: 0, text: "ab", grapheme: false, style: { fg: [0, 1], flags: STYLE_FLAG.bold } });
    expect(converted.spans[1]).toMatchObject({ col: 4, width: 2, text: "👍🏽", grapheme: true });
  });

  it("gives the text of a line with its columns, without trailing blanks", () => {
    expect(lineText(line(span(0, "ls"), span(4, "-la"), span(10, "   ")))).toBe("ls  -la");
    expect(lineText(line(span(0, "a", { flags: STYLE_FLAG.hidden }), span(2, "b")))).toBe("  b");
  });
});
