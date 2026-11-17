// SPDX-License-Identifier: GPL-3.0-or-later
import { Platform } from "react-native";

import { monoFaceName, monoFamily, monoFontFiles, monoWeight } from "./fonts";
import { typeStyle } from "./typography";

describe("mono faces", () => {
  it("uses the PostScript name on iOS and the file name on Android", () => {
    expect(monoFaceName("ios", 400)).toBe("Iosevka-Fixed");
    expect(monoFaceName("ios", 500)).toBe("Iosevka-Fixed-Medium");
    expect(monoFaceName("android", 400)).toBe("IosevkaFixed-Regular");
    expect(monoFaceName("android", 500)).toBe("IosevkaFixed-Medium");
  });

  it("maps 600 to the 500 face", () => {
    expect(monoWeight("600")).toBe(500);
    expect(monoWeight(500)).toBe(500);
    expect(monoWeight("400")).toBe(400);
  });

  it("resolves the family on this platform", () => {
    expect(monoFamily(500)).toBe(monoFaceName(Platform.OS, 500));
  });

  it("exposes the font files for Skia", () => {
    expect(monoFontFiles[400]).toBeDefined();
    expect(monoFontFiles[500]).toBeDefined();
  });
});

describe("type styles", () => {
  it("sets no family on the system roles", () => {
    expect(typeStyle("rowTitle")).toEqual({ fontSize: 16, fontWeight: "500", lineHeight: 20 });
  });

  it("sets the mono face, without fontWeight, on the mono roles", () => {
    expect(typeStyle("key")).toEqual({
      fontFamily: monoFamily(500),
      fontSize: 13,
      lineHeight: 16,
    });
  });

  it("uppercases the section label", () => {
    expect(typeStyle("section")).toMatchObject({ letterSpacing: 0.6, textTransform: "uppercase" });
  });
});
