// SPDX-License-Identifier: GPL-3.0-or-later

// Resolution of the protocol `color` (spec 03 §5.2) against the desktop
// theme, plus the color effect of the style flags. Pure: no React, no
// renderer.

import { type Color, STYLE, type Theme as ThemeMessage } from "@/protocol";

import { type Rgb, xtermColor } from "./xtermPalette";

export type { Rgb } from "./xtermPalette";

/**
 * The part of the protocol `theme` message the grid resolves colors against;
 * the whole message fits it. `palette` holds the colors 0..15 (exactly 16).
 */
export type Theme = Pick<ThemeMessage, "fg" | "bg" | "cursor" | "selectionBg" | "palette">;

/** null = default color; [0, i] = indexed; [1, rgb] = direct. */
export type WireColor = Color;

/** Style flags (spec 03 §5.2): the protocol's, with the grid's name for `strike`. */
export const STYLE_FLAG = {
  bold: STYLE.bold,
  italic: STYLE.italic,
  underline: STYLE.underline,
  inverse: STYLE.inverse,
  dim: STYLE.dim,
  strikethrough: STYLE.strike,
  hidden: STYLE.hidden,
} as const;

/**
 * Weight of the foreground when a dim cell is blended into its background:
 * `fg' = bg + (fg - bg) * DIM_FACTOR`, per channel, rounded. 0.66 is the
 * factor the Alacritty terminal uses for dim text. The Porecatu desktop
 * marks dim cells in its grid snapshot but does not paint them dimmed yet.
 */
export const DIM_FACTOR = 0.66;

export type ResolvedColors = { fg: Rgb; bg: Rgb };

const PALETTE_THEME_SIZE = 16;

/** Which default a `null` color stands for. */
export type DefaultRole = "fg" | "bg";

/**
 * Resolves one protocol color. `null` is the theme's `fg` or `bg` according
 * to `role`; `[0, i]` is the theme palette for 0..15 and the xterm table for
 * 16..255; `[1, rgb]` is the direct color (masked to 24 bits).
 */
export function resolveColor(color: WireColor, role: DefaultRole, theme: Theme): Rgb {
  if (color === null) {
    return theme[role];
  }
  if (color[0] === 1) {
    return color[1] & 0xffffff;
  }
  const index = color[1];
  if (index < PALETTE_THEME_SIZE) {
    const themed = theme.palette[index];
    if (themed === undefined) {
      throw new RangeError(`theme palette has no color ${index}`);
    }
    return themed;
  }
  return xtermColor(index);
}

/** Blends `fg` toward `bg` by `factor` (weight of `fg`), per channel. */
export function blend(fg: Rgb, bg: Rgb, factor: number): Rgb {
  const mix = (shift: number): number => {
    const f = (fg >> shift) & 0xff;
    const b = (bg >> shift) & 0xff;
    return Math.round(b + (f - b) * factor);
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/**
 * The final foreground and background of a cell. Order: resolve both
 * colors, swap them for `inverse`, blend the foreground into the background
 * for `dim`, and make the foreground equal the background for `hidden`
 * (hidden wins over dim).
 */
export function resolveCellColors(
  fg: WireColor,
  bg: WireColor,
  flags: number,
  theme: Theme,
): ResolvedColors {
  let fgColor = resolveColor(fg, "fg", theme);
  let bgColor = resolveColor(bg, "bg", theme);
  if ((flags & STYLE_FLAG.inverse) !== 0) {
    [fgColor, bgColor] = [bgColor, fgColor];
  }
  if ((flags & STYLE_FLAG.dim) !== 0) {
    fgColor = blend(fgColor, bgColor, DIM_FACTOR);
  }
  if ((flags & STYLE_FLAG.hidden) !== 0) {
    fgColor = bgColor;
  }
  return { fg: fgColor, bg: bgColor };
}
