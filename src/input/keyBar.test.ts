// SPDX-License-Identifier: GPL-3.0-or-later

import { NAMED_KEYS, NamedKey } from "@/protocol";

import {
  FUNCTION_KEYS,
  KEY_BAR_KEYS,
  KEY_BAR_LAYOUT,
  isKeyBarKey,
  isKeyBarModifier,
  namedKeyOf,
} from "./keyBar";

describe("named keys", () => {
  it("are the 26 keys of spec 03 section 6, without duplicates", () => {
    expect(NAMED_KEYS).toHaveLength(26);
    expect(new Set(NAMED_KEYS).size).toBe(NAMED_KEYS.length);
  });

  it("include f1..f12 in order", () => {
    expect(FUNCTION_KEYS).toEqual(Array.from({ length: 12 }, (_, i) => `f${i + 1}`));
    for (const key of FUNCTION_KEYS) {
      expect(NAMED_KEYS).toContain(NamedKey[key]);
    }
  });
});

describe("key bar", () => {
  it("maps every button id to a spec named key", () => {
    for (const named of Object.values(KEY_BAR_KEYS)) {
      expect(NAMED_KEYS).toContain(named);
    }
  });

  it("maps the labelled buttons to the right keys", () => {
    expect(namedKeyOf("esc")).toBe(NamedKey.escape);
    expect(namedKeyOf("tab")).toBe(NamedKey.tab);
    expect(namedKeyOf("pgup")).toBe(NamedKey.pageUp);
    expect(namedKeyOf("pgdn")).toBe(NamedKey.pageDown);
    expect(namedKeyOf("home")).toBe(NamedKey.home);
    expect(namedKeyOf("end")).toBe(NamedKey.end);
    expect(namedKeyOf("up")).toBe(NamedKey.up);
    expect(namedKeyOf("f7")).toBe(NamedKey.f7);
  });

  it("sends no key for modifiers", () => {
    expect(namedKeyOf("ctrl")).toBeNull();
    expect(namedKeyOf("alt")).toBeNull();
    expect(isKeyBarModifier("ctrl")).toBe(true);
    expect(isKeyBarModifier("alt")).toBe(true);
    expect(isKeyBarModifier("shift")).toBe(true);
    expect(namedKeyOf("shift")).toBeNull();
    expect(isKeyBarModifier("esc")).toBe(false);
    expect(isKeyBarKey("ctrl")).toBe(false);
    expect(isKeyBarKey("f1")).toBe(true);
  });

  it("lays out the buttons of RF-3.15 once each, in one row: keys, arrows, navigation, Paste, F1-F12", () => {
    expect(new Set(KEY_BAR_LAYOUT).size).toBe(KEY_BAR_LAYOUT.length);
    expect(KEY_BAR_LAYOUT).toEqual([
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
    ]);
  });
});
