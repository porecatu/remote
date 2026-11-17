// SPDX-License-Identifier: GPL-3.0-or-later
// One grid line → its drawing operations (ADR-0002 item 2, PRD-003 RF-3.4,
// RF-3.5): backgrounds first, then box-drawing shapes and text, then
// underline and strikethrough. Pure: no Skia, no React; `skiaPainter.ts`
// records the operations into a picture once per changed line.
//
// Columns follow the wire (CLAUDE.md, armadilhas): the i-th code point of an
// ordinary span sits at `col + i × width`; a grapheme the wire marked comes
// alone in its span. Nothing here segments text.
//
// Never logs: the grid is private.
import type { GridLine } from "@/grid/gridModel";
import { STYLE_FLAG, type Theme, resolveCellColors } from "@/grid/colorMath";
import type { Color, Line, Style } from "@/protocol";
import { CELL_ADVANCE_EM, terminalMetrics } from "@/terminal/viewport";

import { type BoxStrokes, isShapeCodePoint, shapeOps } from "./boxDrawing";
import type { DrawOp, RectOp, TextOp } from "./drawOps";

/**
 * Font size, in points, the line pictures are recorded at. Zoom is a scale of
 * the canvas (ADR-0002 item 5): a picture recorded once serves every zoom,
 * drawn at `fontSize / RECORDING_FONT_SIZE`. The reading size of the anatomy
 * (`terminal.read-font`) keeps the recording in the range the grid is read at.
 */
export const RECORDING_FONT_SIZE = terminalMetrics.readFont;

/**
 * Vertical metrics of Iosevka Fixed (ADR-0009), in em, read from the tables of
 * the embedded files (`assets/fonts/`, Regular and Medium alike; 1000 units
 * per em): `OS/2` typographic ascender 965 and descender −285, `post`
 * underline position −50 and thickness 50, `OS/2` strikeout position 265 and
 * size 51. They are facts of the font, not design values.
 */
export const FONT_METRICS_EM = {
  ascent: 0.965,
  descent: 0.285,
  underlinePosition: -0.05,
  underlineThickness: 0.05,
  strikeoutPosition: 0.265,
  strikeoutThickness: 0.051,
} as const;

/** Where things go inside one line, in the units of `fontSize`. */
export interface LineMetrics {
  readonly fontSize: number;
  /** One column: 0.5 em. */
  readonly cellWidth: number;
  /** One row: `terminal.line-height` times the font. */
  readonly lineHeight: number;
  /** Baseline from the top of the line: the font's ascent and descent centred in the row. */
  readonly baseline: number;
  /** Top of the underline, from the top of the line. */
  readonly underlineTop: number;
  readonly underlineThickness: number;
  /** Top of the strikethrough, from the top of the line. */
  readonly strikeoutTop: number;
  readonly strikeoutThickness: number;
  /** Box-drawing strokes: light is the font's underline, heavy twice it. */
  readonly strokes: BoxStrokes;
}

/** The metrics of a line at `fontSize` (by default the recording size). */
export function lineMetrics(fontSize: number = RECORDING_FONT_SIZE): LineMetrics {
  const em = FONT_METRICS_EM;
  const lineHeight = fontSize * terminalMetrics.lineHeight;
  const content = (em.ascent + em.descent) * fontSize;
  const baseline = (lineHeight - content) / 2 + em.ascent * fontSize;
  const underlineThickness = em.underlineThickness * fontSize;
  const strikeoutThickness = em.strikeoutThickness * fontSize;
  return {
    fontSize,
    cellWidth: fontSize * CELL_ADVANCE_EM,
    lineHeight,
    baseline,
    underlineTop: baseline - em.underlinePosition * fontSize,
    underlineThickness,
    strikeoutTop: baseline - em.strikeoutPosition * fontSize - strikeoutThickness / 2,
    strikeoutThickness,
    strokes: { light: underlineThickness, heavy: underlineThickness * 2 },
  };
}

/** The colors and flags of a span: an interned style of the model, or a wire style. */
export interface SpanStyle {
  readonly fg: Color;
  readonly bg: Color;
  readonly flags: number;
}

/** A span as the recording reads it (`GridSpan` of the model fits it). */
export interface RecordSpan {
  readonly col: number;
  readonly width: 1 | 2;
  readonly style: SpanStyle;
  readonly text: string;
  readonly grapheme: boolean;
}

/** A line as the recording reads it (`GridLine` of the model fits it). */
export interface RecordLine {
  readonly spans: readonly RecordSpan[];
}

/**
 * A history line (a `Line` of a `scrollback-page` and the page's style table)
 * in the shape of a model line. A style index out of the table makes the span
 * default-styled (the model rejects such a message; a page is drawn as it is).
 */
export function historyLine(line: Line, styles: readonly Style[]): GridLine {
  const spans = line[1].map(([col, width, styleIndex, wireText]) => {
    const style = styles[styleIndex];
    const grapheme = typeof wireText !== "string";
    return {
      col,
      width,
      style: {
        key: "",
        fg: style?.[0] ?? null,
        bg: style?.[1] ?? null,
        flags: style?.[2] ?? 0,
      },
      text: typeof wireText === "string" ? wireText : (wireText[0] ?? ""),
      grapheme,
    };
  });
  return { wrapped: line[0], spans };
}

/** The cells a span covers: each code point (or the one grapheme) with its column. */
export function spanCells(span: RecordSpan): { text: string; col: number }[] {
  if (span.grapheme) {
    return [{ text: span.text, col: span.col }];
  }
  const cells: { text: string; col: number }[] = [];
  let col = span.col;
  for (const codePoint of span.text) {
    cells.push({ text: codePoint, col });
    col += span.width;
  }
  return cells;
}

/**
 * The drawing operations of one line, `cols` columns wide, against the
 * desktop `theme` (RF-3.4): only backgrounds other than the theme background
 * are painted (the canvas is filled with it); `hidden` paints no text and no
 * decoration; bold uses the 500 face, italic is slanted by the painter;
 * box-drawing and blocks become shapes (RF-3.5); a wide character takes two
 * cells. Cells at or past `cols` are dropped.
 */
export function recordLineOps(
  line: RecordLine,
  theme: Theme,
  metrics: LineMetrics,
  cols: number,
): DrawOp[] {
  const { cellWidth, lineHeight } = metrics;
  const backgrounds: RectOp[] = [];
  const marks: DrawOp[] = [];
  const decorations: RectOp[] = [];

  for (const span of line.spans) {
    const flags = span.style.flags;
    const { fg, bg } = resolveCellColors(span.style.fg, span.style.bg, flags, theme);
    const cells = spanCells(span).filter((cell) => cell.col >= 0 && cell.col < cols);
    if (cells.length === 0) {
      continue;
    }
    const first = cells[0]?.col ?? span.col;
    const last = cells[cells.length - 1]?.col ?? span.col;
    const startX = first * cellWidth;
    const endX = Math.min(last + span.width, cols) * cellWidth;

    if (bg !== theme.bg) {
      const previous = backgrounds[backgrounds.length - 1];
      if (previous !== undefined && previous.color === bg && Math.abs(previous.x + previous.width - startX) < 1e-6) {
        backgrounds[backgrounds.length - 1] = { ...previous, width: endX - previous.x };
      } else {
        backgrounds.push({ kind: "rect", x: startX, y: 0, width: endX - startX, height: lineHeight, color: bg });
      }
    }

    if ((flags & STYLE_FLAG.hidden) !== 0) {
      continue;
    }

    const boxWidth = span.width * cellWidth;
    const text: string[] = [];
    const xs: number[] = [];
    for (const cell of cells) {
      if (cell.text === " " || cell.text === "") {
        continue;
      }
      const x = cell.col * cellWidth;
      const codePoint = cell.text.codePointAt(0) ?? 0;
      if (!span.grapheme && isShapeCodePoint(codePoint)) {
        const shapes = shapeOps(codePoint, { x, y: 0, width: boxWidth, height: lineHeight }, fg, bg, metrics.strokes);
        if (shapes !== null) {
          marks.push(...shapes);
          continue;
        }
      }
      text.push(cell.text);
      xs.push(x);
    }
    if (text.length > 0) {
      const op: TextOp = {
        kind: "text",
        cells: text,
        xs,
        boxWidth,
        baseline: metrics.baseline,
        color: fg,
        bold: (flags & STYLE_FLAG.bold) !== 0,
        italic: (flags & STYLE_FLAG.italic) !== 0,
      };
      marks.push(op);
    }
    if ((flags & STYLE_FLAG.underline) !== 0) {
      decorations.push({
        kind: "rect",
        x: startX,
        y: metrics.underlineTop,
        width: endX - startX,
        height: metrics.underlineThickness,
        color: fg,
      });
    }
    if ((flags & STYLE_FLAG.strikethrough) !== 0) {
      decorations.push({
        kind: "rect",
        x: startX,
        y: metrics.strikeoutTop,
        width: endX - startX,
        height: metrics.strikeoutThickness,
        color: fg,
      });
    }
  }
  return [...backgrounds, ...marks, ...decorations];
}

/** Cursor shapes of the protocol (spec 03 §5.3): block, underline, beam. */
export type CursorShapeCode = 0 | 1 | 2;

/** The cell under the cursor as the cursor layer needs it. */
export interface CursorCell {
  readonly text: string;
  readonly width: 1 | 2;
  readonly style: SpanStyle;
  /** The right half of a wide character. */
  readonly continuation: boolean;
}

/**
 * The cursor layer (ADR-0002 item 6, RF-3.4) at column `col` of a line, in the
 * line's coordinates: a block in the theme `cursor` color with the character
 * under it in the theme background; an underline or a beam as thick as a
 * heavy box-drawing stroke. It never blinks (anatomy §1, principle 9).
 */
export function recordCursorOps(
  shape: CursorShapeCode,
  col: number,
  cell: CursorCell,
  theme: Theme,
  metrics: LineMetrics,
): DrawOp[] {
  const { cellWidth, lineHeight } = metrics;
  const x = col * cellWidth;
  const width = cell.width * cellWidth;
  const stroke = metrics.strokes.heavy;
  if (shape === 1) {
    return [{ kind: "rect", x, y: lineHeight - stroke, width, height: stroke, color: theme.cursor }];
  }
  if (shape === 2) {
    return [{ kind: "rect", x, y: 0, width: stroke, height: lineHeight, color: theme.cursor }];
  }
  const ops: DrawOp[] = [{ kind: "rect", x, y: 0, width, height: lineHeight, color: theme.cursor }];
  const hidden = (cell.style.flags & STYLE_FLAG.hidden) !== 0;
  if (!hidden && !cell.continuation && cell.text !== " " && cell.text !== "") {
    const codePoint = cell.text.codePointAt(0) ?? 0;
    const shapes = isShapeCodePoint(codePoint)
      ? shapeOps(codePoint, { x, y: 0, width, height: lineHeight }, theme.bg, theme.cursor, metrics.strokes)
      : null;
    if (shapes !== null) {
      ops.push(...shapes);
    } else {
      ops.push({
        kind: "text",
        cells: [cell.text],
        xs: [x],
        boxWidth: width,
        baseline: metrics.baseline,
        color: theme.bg,
        bold: (cell.style.flags & STYLE_FLAG.bold) !== 0,
        italic: (cell.style.flags & STYLE_FLAG.italic) !== 0,
      });
    }
  }
  return ops;
}

/** The plain text of a line, columns kept with spaces, trailing blanks removed (the accessibility summary). */
export function lineText(line: RecordLine): string {
  let out = "";
  let at = 0;
  for (const span of line.spans) {
    if ((span.style.flags & STYLE_FLAG.hidden) !== 0) {
      continue;
    }
    for (const cell of spanCells(span)) {
      if (cell.col > at) {
        out += " ".repeat(cell.col - at);
        at = cell.col;
      }
      if (cell.col < at) {
        continue;
      }
      out += cell.text;
      at = cell.col + span.width;
    }
  }
  return out.trimEnd();
}
