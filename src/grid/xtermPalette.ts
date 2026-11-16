// SPDX-License-Identifier: GPL-3.0-or-later

// The xterm colors 16..255, which the protocol leaves to the client
// (spec 03 §4.3): the 6x6x6 color cube (16..231) and the grayscale ramp
// (232..255). Colors 0..15 come from the theme the desktop sends.

/** A color as `0xRRGGBB`. */
export type Rgb = number;

/** First index the xterm table defines (0..15 belong to the theme). */
export const XTERM_FIRST_INDEX = 16;

/** Last color index. */
export const XTERM_LAST_INDEX = 255;

/** The six channel levels of the color cube. */
export const CUBE_LEVELS: readonly number[] = [0, 95, 135, 175, 215, 255];

const CUBE_START = 16;
const CUBE_SIZE = 6;

/** First index of the grayscale ramp (232..255). */
export const XTERM_GRAY_START = 232;

function pack(r: number, g: number, b: number): Rgb {
  return (r << 16) | (g << 8) | b;
}

function buildPalette(): readonly Rgb[] {
  const colors: Rgb[] = [];
  for (let r = 0; r < CUBE_SIZE; r += 1) {
    for (let g = 0; g < CUBE_SIZE; g += 1) {
      for (let b = 0; b < CUBE_SIZE; b += 1) {
        colors.push(pack(CUBE_LEVELS[r] ?? 0, CUBE_LEVELS[g] ?? 0, CUBE_LEVELS[b] ?? 0));
      }
    }
  }
  for (let i = 0; i < 24; i += 1) {
    const level = 8 + 10 * i;
    colors.push(pack(level, level, level));
  }
  return colors;
}

const PALETTE: readonly Rgb[] = buildPalette();

/** The 240 colors for the indexes 16..255, in index order. */
export const XTERM_PALETTE: readonly Rgb[] = PALETTE;

/**
 * The color of `index` (16..255). Throws `RangeError` outside that range:
 * 0..15 belong to the theme, and the protocol decoder already bounds the
 * index at 255.
 */
export function xtermColor(index: number): Rgb {
  if (!Number.isInteger(index) || index < XTERM_FIRST_INDEX || index > XTERM_LAST_INDEX) {
    throw new RangeError(`xterm color index out of range: ${index}`);
  }
  const color = PALETTE[index - CUBE_START];
  if (color === undefined) {
    throw new RangeError(`xterm color index out of range: ${index}`);
  }
  return color;
}
