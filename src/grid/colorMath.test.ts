// SPDX-License-Identifier: GPL-3.0-or-later
import {
  blend,
  DIM_FACTOR,
  resolveCellColors,
  resolveColor,
  STYLE_FLAG,
  type Theme,
} from "./colorMath";
import { CUBE_LEVELS, XTERM_PALETTE, xtermColor } from "./xtermPalette";

const theme: Theme = {
  fg: 0xc0c0c0,
  bg: 0x101010,
  cursor: 0xffffff,
  selectionBg: 0x333333,
  palette: Array.from({ length: 16 }, (_, i) => 0x010101 * (i + 1)),
};

describe("xterm palette", () => {
  it("has 240 colors for the indexes 16..255", () => {
    expect(XTERM_PALETTE).toHaveLength(240);
  });

  it("matches known values", () => {
    expect(xtermColor(16)).toBe(0x000000);
    expect(xtermColor(21)).toBe(0x0000ff);
    expect(xtermColor(46)).toBe(0x00ff00);
    expect(xtermColor(196)).toBe(0xff0000);
    expect(xtermColor(231)).toBe(0xffffff);
    expect(xtermColor(232)).toBe(0x080808);
    expect(xtermColor(255)).toBe(0xeeeeee);
  });

  it("builds the cube from the six levels", () => {
    expect(CUBE_LEVELS).toEqual([0, 95, 135, 175, 215, 255]);
    // 16 + 36*r + 6*g + b
    expect(xtermColor(16 + 36 * 1 + 6 * 2 + 3)).toBe((95 << 16) | (135 << 8) | 175);
  });

  it("builds the gray ramp as 8 + 10*i", () => {
    for (let i = 0; i < 24; i += 1) {
      const level = 8 + 10 * i;
      expect(xtermColor(232 + i)).toBe((level << 16) | (level << 8) | level);
    }
  });

  it("rejects indexes outside 16..255", () => {
    expect(() => xtermColor(15)).toThrow(RangeError);
    expect(() => xtermColor(256)).toThrow(RangeError);
    expect(() => xtermColor(1.5)).toThrow(RangeError);
  });
});

describe("resolveColor", () => {
  it("maps null to the theme fg or bg", () => {
    expect(resolveColor(null, "fg", theme)).toBe(theme.fg);
    expect(resolveColor(null, "bg", theme)).toBe(theme.bg);
  });

  it("maps 0..15 to the theme palette", () => {
    expect(resolveColor([0, 0], "fg", theme)).toBe(0x010101);
    expect(resolveColor([0, 15], "fg", theme)).toBe(0x101010);
  });

  it("maps 16..255 to the xterm table", () => {
    expect(resolveColor([0, 21], "fg", theme)).toBe(0x0000ff);
    expect(resolveColor([0, 232], "bg", theme)).toBe(0x080808);
  });

  it("passes direct colors through", () => {
    expect(resolveColor([1, 0x123456], "fg", theme)).toBe(0x123456);
  });
});

describe("resolveCellColors", () => {
  it("uses the theme defaults without flags", () => {
    expect(resolveCellColors(null, null, 0, theme)).toEqual({ fg: theme.fg, bg: theme.bg });
  });

  it("ignores flags without a color effect", () => {
    const flags =
      STYLE_FLAG.bold | STYLE_FLAG.italic | STYLE_FLAG.underline | STYLE_FLAG.strikethrough;
    expect(resolveCellColors(null, null, flags, theme)).toEqual({ fg: theme.fg, bg: theme.bg });
  });

  it("swaps fg and bg for inverse", () => {
    expect(resolveCellColors([1, 0xff0000], [1, 0x00ff00], STYLE_FLAG.inverse, theme)).toEqual({
      fg: 0x00ff00,
      bg: 0xff0000,
    });
    expect(resolveCellColors(null, null, STYLE_FLAG.inverse, theme)).toEqual({
      fg: theme.bg,
      bg: theme.fg,
    });
  });

  it("makes fg equal bg for hidden", () => {
    expect(resolveCellColors([1, 0xff0000], [1, 0x00ff00], STYLE_FLAG.hidden, theme)).toEqual({
      fg: 0x00ff00,
      bg: 0x00ff00,
    });
  });

  it("hides after inverse", () => {
    const flags = STYLE_FLAG.hidden | STYLE_FLAG.inverse;
    const { fg, bg } = resolveCellColors([1, 0xff0000], [1, 0x00ff00], flags, theme);
    expect(bg).toBe(0xff0000);
    expect(fg).toBe(0xff0000);
  });

  it("blends fg toward bg for dim", () => {
    const { fg, bg } = resolveCellColors([1, 0xffffff], [1, 0x000000], STYLE_FLAG.dim, theme);
    const channel = Math.round(255 * DIM_FACTOR);
    expect(fg).toBe((channel << 16) | (channel << 8) | channel);
    expect(bg).toBe(0x000000);
  });

  it("dims the foreground that results from inverse", () => {
    const flags = STYLE_FLAG.dim | STYLE_FLAG.inverse;
    const { fg, bg } = resolveCellColors([1, 0x000000], [1, 0xffffff], flags, theme);
    expect(bg).toBe(0x000000);
    expect(fg).toBe(blend(0xffffff, 0x000000, DIM_FACTOR));
  });

  it("lets hidden win over dim", () => {
    const flags = STYLE_FLAG.hidden | STYLE_FLAG.dim;
    const { fg, bg } = resolveCellColors([1, 0xffffff], [1, 0x123456], flags, theme);
    expect(fg).toBe(bg);
  });
});

describe("blend", () => {
  it("returns bg at factor 0 and fg at factor 1", () => {
    expect(blend(0xaabbcc, 0x112233, 0)).toBe(0x112233);
    expect(blend(0xaabbcc, 0x112233, 1)).toBe(0xaabbcc);
  });

  it("blends each channel on its own", () => {
    expect(blend(0xff0000, 0x0000ff, 0.5)).toBe((128 << 16) | 128);
  });
});
