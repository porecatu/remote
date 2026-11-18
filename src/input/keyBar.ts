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

export type KeyBarId = KeyBarKeyId | KeyBarModifierId;

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

/**
 * Layout of the bar in order, left to right, all of it scrolling (anatomy
 * §4.8): the modifiers and `Esc`/`Tab`, the arrows, navigation, `Paste`, then
 * `F1` to `F12`. The groups are told apart by separators in the bar.
 */
export const KEY_BAR_LAYOUT: readonly (KeyBarId | KeyBarPasteId)[] = [
  "esc",
  "tab",
  "shift",
  "ctrl",
  "alt",
  "left",
  "down",
  "up",
  "right",
  "home",
  "end",
  "pgup",
  "pgdn",
  "paste",
  ...FUNCTION_KEYS,
];

export function isKeyBarKey(id: KeyBarId): id is KeyBarKeyId {
  return Object.hasOwn(KEY_BAR_KEYS, id);
}

export function isKeyBarModifier(id: KeyBarId): id is KeyBarModifierId {
  return id === "ctrl" || id === "alt" || id === "shift";
}

/** The named key a bar button sends, or `null` for a modifier. */
export function namedKeyOf(id: KeyBarId): NamedKey | null {
  return isKeyBarKey(id) ? KEY_BAR_KEYS[id] : null;
}
