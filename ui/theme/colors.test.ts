// SPDX-License-Identifier: GPL-3.0-or-later
import { cameraColors, defaultGroupColors, palettes, rgbToCss, withAlpha, type ColorToken } from "./colors";

// Every token of anatomy §2.1 and §2.2, with the camera, scrollbar and
// switch tokens added to §2 for the screens.
const anatomyTokens: readonly ColorToken[] = [
  "bgBase",
  "bgBar",
  "bgRow",
  "bgSheet",
  "bgField",
  "bgPressed",
  "bgSelected",
  "bgKey",
  "bgKeyPressed",
  "bgTerminal",
  "bgScrim",
  "borderRow",
  "borderSheet",
  "borderField",
  "borderFocus",
  "scrollbarThumb",
  "scrollbarTrack",
  "switchThumb",
  "textTitle",
  "textBody",
  "textSecondary",
  "textTertiary",
  "textDisabled",
  "textSection",
  "accent",
  "accentText",
  "onAccent",
  "primary",
  "success",
  "warning",
  "warningText",
  "error",
  "errorText",
  "destructive",
  "destructivePressed",
  "ungrouped",
  "onCamera",
];

const cssColor = /^(#[0-9a-f]{6}|rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (0|1|0?\.\d+)\))$/;

describe("chrome palettes", () => {
  it.each(["dark", "light"] as const)("has every anatomy token in %s mode", (scheme) => {
    const palette = palettes[scheme];
    expect(Object.keys(palette).sort()).toEqual([...anatomyTokens].sort());
    for (const token of anatomyTokens) {
      expect(palette[token]).toMatch(cssColor);
    }
  });

  it("matches the anatomy values in both modes", () => {
    expect(palettes.dark.bgBase).toBe("#171b21");
    expect(palettes.light.bgBase).toBe("#eff1f5");
    expect(palettes.dark.accentText).toBe("#5ed3bc");
    expect(palettes.light.accentText).toBe("#0d6a70");
    expect(palettes.dark.bgScrim).toBe("rgba(6, 7, 9, 0.45)");
    expect(palettes.light.bgScrim).toBe("rgba(76, 79, 105, 0.4)");
    expect(palettes.light.destructivePressed).toBe("#f2dee1");
  });

  it("keeps the camera dark", () => {
    expect(cameraColors).toBe(palettes.dark);
  });

  it("has the six default group colors", () => {
    expect(defaultGroupColors.map((c) => rgbToCss(c))).toEqual([
      "#ef8a8a",
      "#e0b060",
      "#5ed3bc",
      "#6fa8f5",
      "#a68cf0",
      "#86c56a",
    ]);
  });
});

describe("color helpers", () => {
  it("writes an Rgb with alpha", () => {
    expect(rgbToCss(0x0000ff)).toBe("#0000ff");
    expect(rgbToCss(0xef8a8a, 0.14)).toBe("rgba(239, 138, 138, 0.14)");
  });

  it("adds alpha to a hex token", () => {
    expect(withAlpha("#1b1f26", 0.9)).toBe("rgba(27, 31, 38, 0.9)");
    expect(withAlpha("#1b1f26", 0)).toBe("rgba(27, 31, 38, 0)");
    expect(() => withAlpha("rgba(0, 0, 0, 1)", 0.5)).toThrow();
  });
});
