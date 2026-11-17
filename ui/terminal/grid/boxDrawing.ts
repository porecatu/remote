// SPDX-License-Identifier: GPL-3.0-or-later
// Box-drawing (U+2500–257F) and block elements (U+2580–259F) as shapes, not
// font glyphs (PRD-003 RF-3.5, ADR-0002 item 4): strokes reach the cell edges
// exactly, so neighbouring cells join with no seam at any zoom. Pure: the
// shapes are drawing operations (./drawOps.ts).
import { blend, type Rgb } from "@/grid/colorMath";

import type { DrawOp } from "./drawOps";

/** Stroke thicknesses of the box-drawing lines, in recording units. */
export interface BoxStrokes {
  /** A light line; the two lines of a double line are light too. */
  readonly light: number;
  /** A heavy line. */
  readonly heavy: number;
}

/** The cell (or the two cells of a wide character) a shape fills. */
export interface ShapeBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const BOX_FIRST = 0x2500;
const BOX_LAST = 0x257f;
const BLOCK_FIRST = 0x2580;
const BLOCK_LAST = 0x259f;

/** Whether a code point is drawn as a shape by {@link shapeOps}. */
export function isShapeCodePoint(codePoint: number): boolean {
  return codePoint >= BOX_FIRST && codePoint <= BLOCK_LAST;
}

// ----------------------------------------------------------------- lines

/** Weight of one arm: none, light, heavy, double. */
type Weight = 0 | 1 | 2 | 3;

/** The four arms of a line character, from the cell centre: up, right, down, left. */
type Arms = readonly [up: Weight, right: Weight, down: Weight, left: Weight];

/**
 * Arms of U+2500..U+257F, four digits each (up, right, down, left; 0 none,
 * 1 light, 2 heavy, 3 double), from the Unicode names. `-` marks the
 * characters drawn by special code (dashes, arcs, diagonals).
 */
const ARMS_TABLE: readonly string[] = [
  // 2500-250F: ─ ━ │ ┃ ┄ ┅ ┆ ┇ ┈ ┉ ┊ ┋ ┌ ┍ ┎ ┏
  "0101", "0202", "1010", "2020", "-", "-", "-", "-", "-", "-", "-", "-", "0110", "0210", "0120", "0220",
  // 2510-251F: ┐ ┑ ┒ ┓ └ ┕ ┖ ┗ ┘ ┙ ┚ ┛ ├ ┝ ┞ ┟
  "0011", "0012", "0021", "0022", "1100", "1200", "2100", "2200", "1001", "1002", "2001", "2002", "1110", "1210", "2110", "1120",
  // 2520-252F: ┠ ┡ ┢ ┣ ┤ ┥ ┦ ┧ ┨ ┩ ┪ ┫ ┬ ┭ ┮ ┯
  "2120", "2210", "1220", "2220", "1011", "1012", "2011", "1021", "2021", "2012", "1022", "2022", "0111", "0112", "0211", "0212",
  // 2530-253F: ┰ ┱ ┲ ┳ ┴ ┵ ┶ ┷ ┸ ┹ ┺ ┻ ┼ ┽ ┾ ┿
  "0121", "0122", "0221", "0222", "1101", "1102", "1201", "1202", "2101", "2102", "2201", "2202", "1111", "1112", "1211", "1212",
  // 2540-254F: ╀ ╁ ╂ ╃ ╄ ╅ ╆ ╇ ╈ ╉ ╊ ╋ ╌ ╍ ╎ ╏
  "2111", "1121", "2121", "2112", "2211", "1122", "1221", "2212", "1222", "2122", "2221", "2222", "-", "-", "-", "-",
  // 2550-255F: ═ ║ ╒ ╓ ╔ ╕ ╖ ╗ ╘ ╙ ╚ ╛ ╜ ╝ ╞ ╟
  "0303", "3030", "0310", "0130", "0330", "0013", "0031", "0033", "1300", "3100", "3300", "1003", "3001", "3003", "1310", "3130",
  // 2560-256F: ╠ ╡ ╢ ╣ ╤ ╥ ╦ ╧ ╨ ╩ ╪ ╫ ╬ ╭ ╮ ╯
  "3330", "1013", "3031", "3033", "0313", "0131", "0333", "1303", "3101", "3303", "1313", "3131", "3333", "-", "-", "-",
  // 2570-257F: ╰ ╱ ╲ ╳ ╴ ╵ ╶ ╷ ╸ ╹ ╺ ╻ ╼ ╽ ╾ ╿
  "-", "-", "-", "-", "0001", "1000", "0100", "0010", "0002", "2000", "0200", "0020", "0201", "1020", "0102", "2010",
];

function armsOf(codePoint: number): Arms | null {
  const entry = ARMS_TABLE[codePoint - BOX_FIRST];
  if (entry === undefined || entry.length !== 4) {
    return null;
  }
  const weight = (index: number): Weight => Number(entry[index]) as Weight;
  return [weight(0), weight(1), weight(2), weight(3)];
}

/** Dashed lines: code point → [dashes, horizontal, heavy]. */
const DASHES: ReadonlyMap<number, readonly [number, boolean, boolean]> = new Map([
  [0x2504, [3, true, false]],
  [0x2505, [3, true, true]],
  [0x2506, [3, false, false]],
  [0x2507, [3, false, true]],
  [0x2508, [4, true, false]],
  [0x2509, [4, true, true]],
  [0x250a, [4, false, false]],
  [0x250b, [4, false, true]],
  [0x254c, [2, true, false]],
  [0x254d, [2, true, true]],
  [0x254e, [2, false, false]],
  [0x254f, [2, false, true]],
]);

/** Share of each dash period left empty between two dashes. */
const DASH_GAP_SHARE = 1 / 3;

const UP = 0;
const RIGHT = 1;
const DOWN = 2;
const LEFT = 3;

/**
 * The straight line characters. Each arm runs from (around) the centre to its
 * edge; how far it reaches into the centre depends on the arms across it, so
 * corners, tees and crosses close with no notch, double lines included.
 */
function armOps(arms: Arms, box: ShapeBox, strokes: BoxStrokes, color: Rgb): DrawOp[] {
  const ops: DrawOp[] = [];
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const light = strokes.light;
  // Centre of each line of a double line, from the centre of the cell.
  const gap = light;
  const thickness = (weight: Weight): number => (weight === 2 ? strokes.heavy : light);
  /** Half the width an arm takes across its own axis. */
  const halfWidth = (weight: Weight): number =>
    weight === 0 ? 0 : weight === 3 ? gap + light / 2 : thickness(weight) / 2;

  /** Pushes a stroke of arm `dir`, offset `offset` across it, starting `start` before the centre. */
  const stroke = (dir: number, offset: number, start: number, width: number): void => {
    switch (dir) {
      case UP: {
        const bottom = cy + start;
        ops.push({ kind: "rect", x: cx + offset - width / 2, y: box.y, width, height: bottom - box.y, color });
        return;
      }
      case DOWN: {
        const top = cy - start;
        ops.push({ kind: "rect", x: cx + offset - width / 2, y: top, width, height: box.y + box.height - top, color });
        return;
      }
      case LEFT: {
        const right = cx + start;
        ops.push({ kind: "rect", x: box.x, y: cy + offset - width / 2, width: right - box.x, height: width, color });
        return;
      }
      default: {
        const left = cx - start;
        ops.push({ kind: "rect", x: left, y: cy + offset - width / 2, width: box.x + box.width - left, height: width, color });
      }
    }
  };

  for (let dir = 0; dir < 4; dir += 1) {
    const weight = arms[dir] ?? 0;
    if (weight === 0) {
      continue;
    }
    // The two arms across this one; `before` sits on the negative side of the offset.
    const vertical = dir === UP || dir === DOWN;
    const before = vertical ? (arms[LEFT] ?? 0) : (arms[UP] ?? 0);
    const after = vertical ? (arms[RIGHT] ?? 0) : (arms[DOWN] ?? 0);
    if (weight !== 3) {
      const own = thickness(weight);
      stroke(dir, 0, Math.max(own / 2, halfWidth(before), halfWidth(after)), own);
      continue;
    }
    // A double arm: each of its two lines meets the arm on its own side.
    const reach = (side: Weight, opposite: Weight): number => {
      if (side === 3) {
        return -(gap - light / 2);
      }
      if (side !== 0) {
        return thickness(side) / 2;
      }
      if (opposite === 1 || opposite === 2) {
        return thickness(opposite) / 2;
      }
      return gap + light / 2;
    };
    stroke(dir, -gap, reach(before, after), light);
    stroke(dir, gap, reach(after, before), light);
  }
  return ops;
}

function dashOps(
  dashes: number,
  horizontal: boolean,
  heavy: boolean,
  box: ShapeBox,
  strokes: BoxStrokes,
  color: Rgb,
): DrawOp[] {
  const width = heavy ? strokes.heavy : strokes.light;
  const length = horizontal ? box.width : box.height;
  const period = length / dashes;
  const dash = period * (1 - DASH_GAP_SHARE);
  const ops: DrawOp[] = [];
  for (let i = 0; i < dashes; i += 1) {
    const start = i * period + (period - dash) / 2;
    if (horizontal) {
      ops.push({ kind: "rect", x: box.x + start, y: box.y + box.height / 2 - width / 2, width: dash, height: width, color });
    } else {
      ops.push({ kind: "rect", x: box.x + box.width / 2 - width / 2, y: box.y + start, width, height: dash, color });
    }
  }
  return ops;
}

/** ╭ ╮ ╯ ╰: a quarter circle joined to straight ends. */
function arcOps(codePoint: number, box: ShapeBox, strokes: BoxStrokes, color: Rgb): DrawOp[] {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radius = Math.min(box.width, box.height) / 2;
  const light = strokes.light;
  const goesDown = codePoint === 0x256d || codePoint === 0x256e;
  const goesRight = codePoint === 0x256d || codePoint === 0x2570;
  const centerX = goesRight ? cx + radius : cx - radius;
  const centerY = goesDown ? cy + radius : cy - radius;
  const startAngle = goesDown ? (goesRight ? 180 : 270) : goesRight ? 90 : 0;
  const ops: DrawOp[] = [
    { kind: "arc", cx: centerX, cy: centerY, radius, startAngle, sweepAngle: 90, thickness: light, color },
  ];
  // Vertical end, from the arc to the top or bottom edge.
  const vTop = goesDown ? centerY : box.y;
  const vBottom = goesDown ? box.y + box.height : centerY;
  if (vBottom - vTop > 0) {
    ops.push({ kind: "rect", x: cx - light / 2, y: vTop, width: light, height: vBottom - vTop, color });
  }
  // Horizontal end, from the arc to the left or right edge.
  const hLeft = goesRight ? centerX : box.x;
  const hRight = goesRight ? box.x + box.width : centerX;
  if (hRight - hLeft > 0) {
    ops.push({ kind: "rect", x: hLeft, y: cy - light / 2, width: hRight - hLeft, height: light, color });
  }
  return ops;
}

function diagonalOps(codePoint: number, box: ShapeBox, strokes: BoxStrokes, color: Rgb): DrawOp[] {
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;
  const ops: DrawOp[] = [];
  if (codePoint === 0x2571 || codePoint === 0x2573) {
    ops.push({ kind: "line", x1: left, y1: bottom, x2: right, y2: top, thickness: strokes.light, color });
  }
  if (codePoint === 0x2572 || codePoint === 0x2573) {
    ops.push({ kind: "line", x1: left, y1: top, x2: right, y2: bottom, thickness: strokes.light, color });
  }
  return ops;
}

// ----------------------------------------------------------------- blocks

const QUADRANT_UPPER_LEFT = 1;
const QUADRANT_UPPER_RIGHT = 2;
const QUADRANT_LOWER_LEFT = 4;
const QUADRANT_LOWER_RIGHT = 8;

/** U+2596..U+259F as quadrant masks. */
const QUADRANTS: readonly number[] = [
  QUADRANT_LOWER_LEFT,
  QUADRANT_LOWER_RIGHT,
  QUADRANT_UPPER_LEFT,
  QUADRANT_UPPER_LEFT | QUADRANT_LOWER_LEFT | QUADRANT_LOWER_RIGHT,
  QUADRANT_UPPER_LEFT | QUADRANT_LOWER_RIGHT,
  QUADRANT_UPPER_LEFT | QUADRANT_UPPER_RIGHT | QUADRANT_LOWER_LEFT,
  QUADRANT_UPPER_LEFT | QUADRANT_UPPER_RIGHT | QUADRANT_LOWER_RIGHT,
  QUADRANT_UPPER_RIGHT,
  QUADRANT_UPPER_RIGHT | QUADRANT_LOWER_LEFT,
  QUADRANT_UPPER_RIGHT | QUADRANT_LOWER_LEFT | QUADRANT_LOWER_RIGHT,
];

/** ░ ▒ ▓: the share of the foreground in the blended color. */
const SHADES: readonly number[] = [0.25, 0.5, 0.75];

const EIGHTHS = 8;

function blockOps(codePoint: number, box: ShapeBox, fg: Rgb, bg: Rgb): DrawOp[] {
  const { x, y, width, height } = box;
  const rect = (rx: number, ry: number, rw: number, rh: number, color: Rgb = fg): DrawOp => ({
    kind: "rect",
    x: rx,
    y: ry,
    width: rw,
    height: rh,
    color,
  });
  if (codePoint === 0x2580) {
    return [rect(x, y, width, height / 2)];
  }
  if (codePoint >= 0x2581 && codePoint <= 0x2588) {
    // Lower one to eight eighths.
    const h = (height * (codePoint - 0x2580)) / EIGHTHS;
    return [rect(x, y + height - h, width, h)];
  }
  if (codePoint >= 0x2589 && codePoint <= 0x258f) {
    // Left seven to one eighths.
    const w = (width * (EIGHTHS - (codePoint - 0x2588))) / EIGHTHS;
    return [rect(x, y, w, height)];
  }
  if (codePoint === 0x2590) {
    return [rect(x + width / 2, y, width / 2, height)];
  }
  if (codePoint >= 0x2591 && codePoint <= 0x2593) {
    return [rect(x, y, width, height, blend(fg, bg, SHADES[codePoint - 0x2591] ?? 0))];
  }
  if (codePoint === 0x2594) {
    return [rect(x, y, width, height / EIGHTHS)];
  }
  if (codePoint === 0x2595) {
    return [rect(x + width - width / EIGHTHS, y, width / EIGHTHS, height)];
  }
  const mask = QUADRANTS[codePoint - 0x2596] ?? 0;
  const halfW = width / 2;
  const halfH = height / 2;
  const ops: DrawOp[] = [];
  if ((mask & QUADRANT_UPPER_LEFT) !== 0) ops.push(rect(x, y, halfW, halfH));
  if ((mask & QUADRANT_UPPER_RIGHT) !== 0) ops.push(rect(x + halfW, y, halfW, halfH));
  if ((mask & QUADRANT_LOWER_LEFT) !== 0) ops.push(rect(x, y + halfH, halfW, halfH));
  if ((mask & QUADRANT_LOWER_RIGHT) !== 0) ops.push(rect(x + halfW, y + halfH, halfW, halfH));
  return ops;
}

// ----------------------------------------------------------------- entry

/**
 * The shapes of a box-drawing or block code point in `box`, in `fg` (blocks
 * that shade blend `fg` into `bg`); `null` for any other code point, which is
 * drawn as text.
 */
export function shapeOps(
  codePoint: number,
  box: ShapeBox,
  fg: Rgb,
  bg: Rgb,
  strokes: BoxStrokes,
): DrawOp[] | null {
  if (codePoint >= BLOCK_FIRST && codePoint <= BLOCK_LAST) {
    return blockOps(codePoint, box, fg, bg);
  }
  if (codePoint < BOX_FIRST || codePoint > BOX_LAST) {
    return null;
  }
  const dash = DASHES.get(codePoint);
  if (dash !== undefined) {
    return dashOps(dash[0], dash[1], dash[2], box, strokes, fg);
  }
  if (codePoint >= 0x256d && codePoint <= 0x2570) {
    return arcOps(codePoint, box, strokes, fg);
  }
  if (codePoint >= 0x2571 && codePoint <= 0x2573) {
    return diagonalOps(codePoint, box, strokes, fg);
  }
  const arms = armsOf(codePoint);
  return arms === null ? null : armOps(arms, box, strokes, fg);
}
