// SPDX-License-Identifier: GPL-3.0-or-later

// Named keys of the `key` message (spec 03, section 6) and the buttons of the
// special-keys bar (PRD-003 RF-3.15). The wire codes belong to the protocol
// package (`NamedKey`); this module maps buttons to them.

import { NamedKey } from "@/protocol";

export const FUNCTION_KEYS = [
  "f1",
  "f2",
  "f3",
  "f4",
  "f5",
  "f6",
  "f7",
  "f8",
  "f9",
  "f10",
  "f11",
  "f12",
] as const;

/** Buttons that send a named key as soon as they are tapped. */
export type KeyBarKeyId =
  | "esc"
  | "tab"
  | "up"
  | "down"
  | "left"
  | "right"
  | "home"
  | "end"
  | "pgup"
  | "pgdn"
  | (typeof FUNCTION_KEYS)[number];

/** Buttons that arm a modifier instead of sending a key (RF-3.16). */
export type KeyBarModifierId = "ctrl" | "alt" | "shift";

/** The "F1-F12" access: opens the function keys, sends nothing itself. */
export type KeyBarId = KeyBarKeyId | KeyBarModifierId | "fn";

export const KEY_BAR_KEYS: Readonly<Record<KeyBarKeyId, NamedKey>> = {
  esc: NamedKey.escape,
  tab: NamedKey.tab,
  up: NamedKey.up,
  down: NamedKey.down,
  left: NamedKey.left,
  right: NamedKey.right,
  home: NamedKey.home,
  end: NamedKey.end,
  pgup: NamedKey.pageUp,
  pgdn: NamedKey.pageDown,
  f1: NamedKey.f1,
  f2: NamedKey.f2,
  f3: NamedKey.f3,
  f4: NamedKey.f4,
  f5: NamedKey.f5,
  f6: NamedKey.f6,
  f7: NamedKey.f7,
  f8: NamedKey.f8,
  f9: NamedKey.f9,
  f10: NamedKey.f10,
  f11: NamedKey.f11,
  f12: NamedKey.f12,
};

/** The "Paste" key: reads the clipboard, sends nothing by itself. */
export type KeyBarPasteId = "paste";

/** Row 1 of the bar, fixed, in order (anatomy §4.8). */
export const KEY_BAR_FIXED = ["esc", "tab", "shift", "ctrl", "alt", "fn", "paste"] as const;

/** The start of the scrolling row 2: navigation keys, in order. */
export const KEY_BAR_NAVIGATION = ["home", "end", "pgup", "pgdn"] as const;

/** A symbol key: typed as text, so an armed modifier applies to it like to the system keyboard. */
export type KeyBarSymbol = {
  readonly text: string;
  /** Last part of the catalog key `keybar.a11y.symbol_<id>`. */
  readonly id: "pipe" | "tilde" | "slash" | "backslash" | "hyphen" | "underscore" | "backtick";
};

/** The symbols the phone keyboard hides behind a second layer, after the navigation keys. */
export const KEY_BAR_SYMBOLS: readonly KeyBarSymbol[] = [
  { text: "|", id: "pipe" },
  { text: "~", id: "tilde" },
  { text: "/", id: "slash" },
  { text: "\\", id: "backslash" },
  { text: "-", id: "hyphen" },
  { text: "_", id: "underscore" },
  { text: "`", id: "backtick" },
];

/** Layout of the bar in order: row 1, then the navigation keys of row 2 (the symbols are not named keys). */
export const KEY_BAR_LAYOUT: readonly (KeyBarId | KeyBarPasteId)[] = [
  ...KEY_BAR_FIXED,
  ...KEY_BAR_NAVIGATION,
];

/** The arrow pad (anatomy §4.7): the top key, then the bottom row left to right. */
export const ARROW_PAD_LAYOUT = {
  top: "up",
  bottom: ["left", "down", "right"],
} as const;

export function isKeyBarKey(id: KeyBarId): id is KeyBarKeyId {
  return Object.hasOwn(KEY_BAR_KEYS, id);
}

export function isKeyBarModifier(id: KeyBarId): id is KeyBarModifierId {
  return id === "ctrl" || id === "alt" || id === "shift";
}

/** The named key a bar button sends, or `null` for modifiers and "fn". */
export function namedKeyOf(id: KeyBarId): NamedKey | null {
  return isKeyBarKey(id) ? KEY_BAR_KEYS[id] : null;
}
