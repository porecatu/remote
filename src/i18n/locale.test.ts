// SPDX-License-Identifier: GPL-3.0-or-later
import { matchSystemLocale, resolveLocale, type SystemLocale } from "./locale";

const loc = (languageTag: string, languageCode: string | null): SystemLocale => ({
  languageTag,
  languageCode,
});

describe("matchSystemLocale", () => {
  it("falls back to en_US for an empty or unknown list", () => {
    expect(matchSystemLocale([])).toBe("en_US");
    expect(matchSystemLocale([loc("ja-JP", "ja"), loc("de-DE", "de")])).toBe("en_US");
  });

  it("maps any Portuguese to pt_BR and any English to en_US", () => {
    expect(matchSystemLocale([loc("pt-BR", "pt")])).toBe("pt_BR");
    expect(matchSystemLocale([loc("pt-PT", "pt")])).toBe("pt_BR");
    expect(matchSystemLocale([loc("en-GB", "en")])).toBe("en_US");
  });

  it("takes the first supported language in preference order", () => {
    expect(matchSystemLocale([loc("ja-JP", "ja"), loc("pt-BR", "pt"), loc("en-US", "en")])).toBe(
      "pt_BR",
    );
  });

  it("reads the tag when the language code is missing", () => {
    expect(matchSystemLocale([loc("pt-BR", null)])).toBe("pt_BR");
    expect(matchSystemLocale([loc("pt_BR", null)])).toBe("pt_BR");
  });
});

describe("resolveLocale", () => {
  const system = [loc("pt-BR", "pt")];

  it("follows the system on 'system'", () => {
    expect(resolveLocale("system", system)).toBe("pt_BR");
    expect(resolveLocale("system", [])).toBe("en_US");
  });

  it("honors the user's explicit choice over the system", () => {
    expect(resolveLocale("en_US", system)).toBe("en_US");
    expect(resolveLocale("pt_BR", [loc("en-US", "en")])).toBe("pt_BR");
  });
});
