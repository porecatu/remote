// SPDX-License-Identifier: GPL-3.0-or-later
// Turns the drawing operations of a line (./lineRecording.ts) into a Skia
// picture (ADR-0002 items 2 to 4). One picture per line, recorded once and
// reused until the line changes; never a text object per cell per frame.
//
// Text is drawn glyph by glyph at the column of each cell (`drawGlyphs` with
// the positions of the wire), in the embedded Iosevka Fixed (400, and 500 for
// bold; italic is slanted). A code point the font has no glyph for falls back
// to the system fonts through a one-cell paragraph, centred in its cell box
// and shrunk to fit, so it never pushes the next columns (ADR-0002 item 3).
//
// Never logs: the grid is private.
import {
  PaintStyle,
  type SkCanvas,
  type SkFont,
  type SkPaint,
  type SkPicture,
  type SkPoint,
  type SkTypeface,
  Skia,
  StrokeCap,
} from "@shopify/react-native-skia";

import type { Rgb } from "@/grid/colorMath";

import type { ArcOp, DrawOp, LineOp, TextOp } from "./drawOps";
import { type LineMetrics, lineMetrics } from "./lineRecording";

/** The two embedded faces; `null` until loaded (text is then left out). */
export interface GridTypefaces {
  readonly regular: SkTypeface | null;
  readonly medium: SkTypeface | null;
}

/** Slant of the synthetic italic (the embedded family has no italic face). */
const ITALIC_SKEW = -0.2;

/** Opaque alpha of an `0xAARRGGBB` color. */
const OPAQUE = 0xff000000;

export interface GridPainter {
  /** The metrics every recording of this painter uses. */
  readonly metrics: LineMetrics;
  /** Whether a font is loaded; without one, text is left out. */
  readonly hasFont: boolean;
  /** Records `ops` into a picture `width` wide and one line high. */
  record(ops: readonly DrawOp[], width: number): SkPicture;
  /** Draws `ops` straight onto `canvas`. */
  paint(canvas: SkCanvas, ops: readonly DrawOp[]): void;
  /** Releases the fonts and paints. */
  dispose(): void;
}

/** A painter for the embedded faces, recording at `metrics` (by default the recording size). */
export function createGridPainter(faces: GridTypefaces, metrics: LineMetrics = lineMetrics()): GridPainter {
  const paints = new Map<string, SkPaint>();
  const fonts = new Map<string, SkFont>();
  const hasFont = faces.regular !== null;

  function paintFor(color: Rgb, kind: "fill" | "text" | "stroke", width = 0): SkPaint {
    const key = `${kind}|${color}|${width}`;
    let paint = paints.get(key);
    if (paint === undefined) {
      paint = Skia.Paint();
      paint.setColor(Skia.Color(OPAQUE + color));
      // Rectangles stay crisp so neighbouring cells tile with no seam.
      paint.setAntiAlias(kind !== "fill");
      if (kind === "stroke") {
        paint.setStyle(PaintStyle.Stroke);
        paint.setStrokeWidth(width);
        paint.setStrokeCap(StrokeCap.Butt);
      }
      paints.set(key, paint);
    }
    return paint;
  }

  function fontFor(bold: boolean, italic: boolean): SkFont | null {
    const face = bold ? (faces.medium ?? faces.regular) : faces.regular;
    if (face === null) {
      return null;
    }
    const key = `${bold ? 1 : 0}${italic ? 1 : 0}`;
    let font = fonts.get(key);
    if (font === undefined) {
      font = Skia.Font(face, metrics.fontSize);
      font.setSubpixel(true);
      if (italic) {
        font.setSkewX(ITALIC_SKEW);
      }
      fonts.set(key, font);
    }
    return font;
  }

  function drawFallback(canvas: SkCanvas, text: string, x: number, op: TextOp): void {
    try {
      const builder = Skia.ParagraphBuilder.Make({
        textStyle: { color: Skia.Color(OPAQUE + op.color), fontSize: metrics.fontSize },
      });
      builder.addText(text);
      const paragraph = builder.build();
      paragraph.layout(Number.MAX_SAFE_INTEGER);
      const width = paragraph.getMaxIntrinsicWidth();
      const height = paragraph.getHeight();
      if (width > 0 && height > 0) {
        const scale = Math.min(1, op.boxWidth / width, metrics.lineHeight / height);
        canvas.save();
        canvas.translate(x + (op.boxWidth - width * scale) / 2, (metrics.lineHeight - height * scale) / 2);
        canvas.scale(scale, scale);
        paragraph.paint(canvas, 0, 0);
        canvas.restore();
      }
      paragraph.dispose();
      builder.dispose();
    } catch {
      // No system font manager (tests) or no fallback face: the cell stays empty.
    }
  }

  function drawText(canvas: SkCanvas, op: TextOp): void {
    const font = fontFor(op.bold, op.italic);
    if (font === null) {
      return;
    }
    const paint = paintFor(op.color, "text");
    // Single code points go through the font in one call; graphemes always fall back.
    const singles: number[] = [];
    let joined = "";
    op.cells.forEach((cell, index) => {
      const codePoint = cell.codePointAt(0);
      if (codePoint !== undefined && String.fromCodePoint(codePoint).length === cell.length) {
        singles.push(index);
        joined += cell;
      }
    });
    const ids = joined.length > 0 ? font.getGlyphIDs(joined, singles.length) : [];
    const glyphs: number[] = [];
    const positions: SkPoint[] = [];
    const wide = op.boxWidth > metrics.cellWidth;
    const widths = wide && ids.length > 0 ? font.getGlyphWidths(ids) : [];
    let single = 0;
    op.cells.forEach((cell, index) => {
      const x = op.xs[index] ?? 0;
      if (singles[single] !== index) {
        drawFallback(canvas, cell, x, op);
        return;
      }
      const id = ids[single] ?? 0;
      const advance = widths[single] ?? metrics.cellWidth;
      single += 1;
      if (id === 0) {
        drawFallback(canvas, cell, x, op);
        return;
      }
      glyphs.push(id);
      positions.push(Skia.Point(wide ? x + (op.boxWidth - advance) / 2 : x, op.baseline));
    });
    if (glyphs.length > 0) {
      canvas.drawGlyphs(glyphs, positions, 0, 0, font, paint);
    }
  }

  function drawLine(canvas: SkCanvas, op: LineOp): void {
    canvas.drawLine(op.x1, op.y1, op.x2, op.y2, paintFor(op.color, "stroke", op.thickness));
  }

  function drawArc(canvas: SkCanvas, op: ArcOp): void {
    const path = Skia.PathBuilder.Make()
      .addArc(
        Skia.XYWHRect(op.cx - op.radius, op.cy - op.radius, op.radius * 2, op.radius * 2),
        op.startAngle,
        op.sweepAngle,
      )
      .build();
    canvas.drawPath(path, paintFor(op.color, "stroke", op.thickness));
  }

  function paint(canvas: SkCanvas, ops: readonly DrawOp[]): void {
    for (const op of ops) {
      switch (op.kind) {
        case "rect":
          canvas.drawRect(Skia.XYWHRect(op.x, op.y, op.width, op.height), paintFor(op.color, "fill"));
          break;
        case "text":
          drawText(canvas, op);
          break;
        case "line":
          drawLine(canvas, op);
          break;
        case "arc":
          drawArc(canvas, op);
          break;
      }
    }
  }

  return {
    metrics,
    hasFont,
    record(ops, width) {
      const recorder = Skia.PictureRecorder();
      const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, Math.max(width, 1), metrics.lineHeight));
      paint(canvas, ops);
      const picture = recorder.finishRecordingAsPicture();
      recorder.dispose();
      return picture;
    },
    paint,
    dispose() {
      for (const item of paints.values()) item.dispose();
      for (const item of fonts.values()) item.dispose();
      paints.clear();
      fonts.clear();
    },
  };
}

/** One line picture placed at `y` (content units) in a frame. */
export interface PlacedPicture {
  readonly y: number;
  readonly picture: SkPicture;
}

/**
 * Records the frame: the line pictures stacked at their `y`, in a picture as
 * big as `bounds` (content units). Drawing a nested picture only references
 * it, so a frame costs one call per line, not per cell.
 */
export function recordFrame(
  lines: readonly PlacedPicture[],
  width: number,
  top: number,
  height: number,
): SkPicture {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, top, Math.max(width, 1), Math.max(height, 1)));
  for (const line of lines) {
    canvas.save();
    canvas.translate(0, line.y);
    canvas.drawPicture(line.picture);
    canvas.restore();
  }
  const picture = recorder.finishRecordingAsPicture();
  recorder.dispose();
  return picture;
}

/** An empty picture (nothing to draw yet). */
export function emptyPicture(): SkPicture {
  const recorder = Skia.PictureRecorder();
  recorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  const picture = recorder.finishRecordingAsPicture();
  recorder.dispose();
  return picture;
}
