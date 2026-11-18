// SPDX-License-Identifier: GPL-3.0-or-later
// Chrome colors in the dark and light modes, mirroring
// docs/design/proposta-de-anatomia.md §2.1 and §2.2 (each key is the anatomy
// token in camelCase, named in its comment). The terminal grid never uses
// these: its colors come from the desktop `theme` message, with
// `bgTerminal` only as the background before the theme arrives.
import type { Rgb } from "@/grid/colorMath";

/** The two modes of the chrome, following the system (RF-2.13). */
export type ColorScheme = "dark" | "light";

/** Every chrome color token. */
export type ChromeColors = {
  /** `bg.base`: background of list screens. */
  readonly bgBase: string;
  /** `bg.bar`: top bar, key bar. */
  readonly bgBar: string;
  /** `bg.row`: row, card. */
  readonly bgRow: string;
  /** `bg.sheet`: sheet, dialog, menu, snackbar. */
  readonly bgSheet: string;
  /** `bg.field`: text field, badge and chip background. */
  readonly bgField: string;
  /** `bg.pressed`: pressed row or item. */
  readonly bgPressed: string;
  /** `bg.selected`: chosen item, tab active on the desktop. */
  readonly bgSelected: string;
  /** `bg.key`: key of the key bar. */
  readonly bgKey: string;
  /** `bg.key.pressed`. */
  readonly bgKeyPressed: string;
  /** `bg.terminal` before the desktop `theme` arrives (then `theme.bg`). */
  readonly bgTerminal: string;
  /** `bg.scrim`: film behind sheets and dialogs. */
  readonly bgScrim: string;
  /** `border.row`. */
  readonly borderRow: string;
  /** `border.sheet`. */
  readonly borderSheet: string;
  /** `border.field`. */
  readonly borderField: string;
  /** `border.field` focus. */
  readonly borderFocus: string;
  /** `scrollbar.thumb`. */
  readonly scrollbarThumb: string;
  /** `scrollbar.track`. */
  readonly scrollbarTrack: string;
  /** `switch.thumb`. */
  readonly switchThumb: string;
  /** `text.title`. */
  readonly textTitle: string;
  /** `text.body`. */
  readonly textBody: string;
  /** `text.secondary`. */
  readonly textSecondary: string;
  /** `text.tertiary`. */
  readonly textTertiary: string;
  /** `text.disabled`: only for disabled items. */
  readonly textDisabled: string;
  /** `text.section`: section label. */
  readonly textSection: string;
  /** `accent`: focus, link, active; in light mode never small text. */
  readonly accent: string;
  /** `accent.text`: action text. */
  readonly accentText: string;
  /** `on.accent`: text on the primary background. */
  readonly onAccent: string;
  /** `primary`: primary button background, switch track on. */
  readonly primary: string;
  /** `success`: also the activity indicator. */
  readonly success: string;
  /** `warning`. */
  readonly warning: string;
  /** `warning.text`. */
  readonly warningText: string;
  /** `error`: also the bell indicator. */
  readonly error: string;
  /** `error.text`. */
  readonly errorText: string;
  /** `destructive`. */
  readonly destructive: string;
  /** `destructive.pressed`. */
  readonly destructivePressed: string;
  /** `ungrouped`: color of a tab without a group. */
  readonly ungrouped: string;
  /** `on.camera`: text and icons over the camera image. */
  readonly onCamera: string;
};

/** Name of a chrome color token. */
export type ColorToken = keyof ChromeColors;

const dark: ChromeColors = {
  bgBase: "#171b21",
  bgBar: "#1b1f26",
  bgRow: "#1c2028",
  bgSheet: "#1a1e25",
  bgField: "#0f1216",
  bgPressed: "#242a33",
  bgSelected: "#282e37",
  bgKey: "#1d222a",
  bgKeyPressed: "#39404b",
  bgTerminal: "#0f1216",
  bgScrim: "rgba(6, 7, 9, 0.45)",
  borderRow: "#262b34",
  borderSheet: "#2e343e",
  borderField: "#333a45",
  borderFocus: "#5ed3bc",
  scrollbarThumb: "rgba(199, 204, 214, 0.45)",
  scrollbarTrack: "rgba(255, 255, 255, 0.06)",
  switchThumb: "#f0f3f6",
  textTitle: "#e6eaef",
  textBody: "#d7dce3",
  textSecondary: "#a8b0bb",
  textTertiary: "#828a96",
  textDisabled: "#5c646f",
  textSection: "#828a96",
  accent: "#5ed3bc",
  accentText: "#5ed3bc",
  onAccent: "#f0f3f6",
  primary: "#3f8f80",
  success: "#86c56a",
  warning: "#e0b060",
  warningText: "#e0b060",
  error: "#ef8a8a",
  errorText: "#ef8a8a",
  destructive: "#e08585",
  destructivePressed: "#2e2224",
  ungrouped: "#7b838f",
  onCamera: "#ffffff",
};

const light: ChromeColors = {
  bgBase: "#eff1f5",
  bgBar: "#e6e9ef",
  bgRow: "#dce0e8",
  bgSheet: "#dce0e8",
  bgField: "#eff1f5",
  bgPressed: "#ccd0da",
  bgSelected: "#ccd0da",
  bgKey: "#dce0e8",
  bgKeyPressed: "#bcc0cc",
  bgTerminal: "#eff1f5",
  bgScrim: "rgba(76, 79, 105, 0.4)",
  borderRow: "#ccd0da",
  borderSheet: "#bcc0cc",
  borderField: "#bcc0cc",
  borderFocus: "#179299",
  scrollbarThumb: "rgba(76, 79, 105, 0.45)",
  scrollbarTrack: "rgba(76, 79, 105, 0.06)",
  switchThumb: "#f0f3f6",
  textTitle: "#4c4f69",
  textBody: "#4c4f69",
  textSecondary: "#5c5f77",
  textTertiary: "#5c5f77",
  textDisabled: "#8c8fa1",
  textSection: "#5c5f77",
  accent: "#179299",
  accentText: "#0d6a70",
  onAccent: "#ffffff",
  primary: "#179299",
  success: "#40a02b",
  warning: "#df8e1d",
  warningText: "#7f4b00",
  error: "#d20f39",
  errorText: "#b80d32",
  destructive: "#d20f39",
  destructivePressed: "#f2dee1",
  ungrouped: "#8c8fa1",
  onCamera: "#ffffff",
};

/** The chrome colors of each mode. */
export const palettes: Readonly<Record<ColorScheme, ChromeColors>> = { dark, light };

/**
 * The camera screen is always dark (§4.3.2): it uses the dark tokens in both
 * modes of the system.
 */
export const cameraColors: ChromeColors = dark;

/**
 * §2.2 Default group palette, used only when the desktop `theme` brings no
 * `group_colors`. Group color is never text: only stripe, dot, swatch and tint.
 */
export const defaultGroupColors: readonly Rgb[] = [
  0xef8a8a, 0xe0b060, 0x5ed3bc, 0x6fa8f5, 0xa68cf0, 0x86c56a,
];

/** An `Rgb` (`0xRRGGBB`) as a CSS color, optionally with alpha (0..1). */
export function rgbToCss(rgb: Rgb, alpha = 1): string {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  if (alpha >= 1) {
    return `#${rgb.toString(16).padStart(6, "0")}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * A `#rrggbb` token with an alpha (0..1), e.g. `bgSheet` at `opacity.zoomChip`
 * behind the zoom chip.
 */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match === null || match[1] === undefined) {
    throw new Error("withAlpha expects a #rrggbb color");
  }
  return rgbToCss(Number.parseInt(match[1], 16), alpha);
}
