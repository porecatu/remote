// SPDX-License-Identifier: GPL-3.0-or-later
// The drawing operations of one grid line (ADR-0002 item 2): plain data, no
// Skia, so the layout of a line is testable in Node. `skiaPainter.ts` turns
// them into a recording. Coordinates are in the units of the recording font
// size (`RECORDING_FONT_SIZE`), relative to the top-left corner of the line.
import type { Rgb } from "@/grid/colorMath";

/** A filled rectangle: cell background, box-drawing stroke, block, decoration. */
export type RectOp = {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: Rgb;
};

/**
 * The glyphs of one span. `cells[i]` is one code point (or one whole grapheme
 * the wire marked as such) drawn in the box that starts at `xs[i]` and is
 * `boxWidth` wide (one cell, or two for a wide character).
 */
export type TextOp = {
  readonly kind: "text";
  readonly cells: readonly string[];
  readonly xs: readonly number[];
  readonly boxWidth: number;
  readonly baseline: number;
  readonly color: Rgb;
  readonly bold: boolean;
  readonly italic: boolean;
};

/** A straight stroke (box-drawing diagonals). */
export type LineOp = {
  readonly kind: "line";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly thickness: number;
  readonly color: Rgb;
};

/** A stroked circular arc (rounded box-drawing corners), angles in degrees, clockwise from +x. */
export type ArcOp = {
  readonly kind: "arc";
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly startAngle: number;
  readonly sweepAngle: number;
  readonly thickness: number;
  readonly color: Rgb;
};

export type DrawOp = RectOp | TextOp | LineOp | ArcOp;
