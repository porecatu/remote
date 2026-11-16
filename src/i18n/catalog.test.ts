// SPDX-License-Identifier: GPL-3.0-or-later
import {
  MESSAGES,
  createTranslator,
  getLocale,
  interpolate,
  placeholdersOf,
  setLocale,
  t,
  tn,
  type MessageKey,
} from "./catalog";

const en = MESSAGES.en_US;
const pt = MESSAGES.pt_BR;
const keys = Object.keys(en) as MessageKey[];

describe("catalog completeness", () => {
  it("has exactly the same keys in both languages", () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
  });

  it("uses the same {parameters} for every key in both languages", () => {
    for (const key of keys) {
      expect({ key, params: placeholdersOf(pt[key]).sort() }).toEqual({
        key,
        params: placeholdersOf(en[key]).sort(),
      });
    }
  });

  it("has no empty message", () => {
    for (const key of keys) {
      expect(en[key].trim()).not.toBe("");
      expect(pt[key].trim()).not.toBe("");
    }
  });

  it('never says "guia"/"guias" in pt_BR (it is "abas")', () => {
    for (const key of keys) {
      expect({ key, hit: /guias?/i.test(pt[key]) }).toEqual({ key, hit: false });
    }
  });

  it("has a one and an other form for every plural key", () => {
    for (const key of keys) {
      if (key.endsWith(".one")) {
        expect(keys).toContain(`${key.slice(0, -4)}.other`);
      }
      if (key.endsWith(".other")) {
        expect(keys).toContain(`${key.slice(0, -6)}.one`);
      }
    }
  });

  // Coverage of the protocol's codes lives in protocolMessages.test.ts, which
  // walks the arrays of @porecatu/protocol instead of a local list.
});

describe("interpolation", () => {
  it("replaces named parameters", () => {
    expect(t("pane_state.exited_code", { code: 130 })).toBe("Exited with code 130");
    expect(createTranslator("pt_BR").t("pane_state.exited_code", { code: 0 })).toBe(
      "Encerrado com código 0",
    );
  });

  it("replaces every occurrence and accepts strings", () => {
    expect(interpolate("{a} and {a} and {b}", { a: "x", b: 2 })).toBe("x and x and 2");
  });

  it("throws on a missing parameter in tests", () => {
    expect(() => t("pane_state.exited_code")).toThrow('Missing message parameter "code"');
    expect(() => t("connection.attempt", { attempt: 1 })).toThrow(
      'Missing message parameter "total"',
    );
  });

  it("leaves messages without placeholders alone", () => {
    expect(t("common.cancel")).toBe("Cancel");
  });

  it("finds placeholders", () => {
    expect(placeholdersOf("{a} {b} {a}")).toEqual(["a", "b"]);
    expect(placeholdersOf("none")).toEqual([]);
  });
});

describe("plural messages", () => {
  const en = createTranslator("en_US");
  const pt = createTranslator("pt_BR");

  it("picks the right form in en_US", () => {
    expect(en.tn("workspace.tab_count", 0)).toBe("0 tabs");
    expect(en.tn("workspace.tab_count", 1)).toBe("1 tab");
    expect(en.tn("workspace.tab_count", 2)).toBe("2 tabs");
    expect(en.tn("workspace.tab_count", 1.5)).toBe("1.5 tabs");
  });

  it("picks the right form in pt_BR", () => {
    expect(pt.tn("workspace.tab_count", 0)).toBe("0 aba");
    expect(pt.tn("workspace.tab_count", 1)).toBe("1 aba");
    expect(pt.tn("workspace.tab_count", 2)).toBe("2 abas");
    expect(pt.tn("workspace.tab_count", 1.5)).toBe("1.5 aba");
  });

  it("passes extra parameters", () => {
    expect(en.tn("paste.summary", 3, { chars: 120 })).toBe("3 lines, 120 characters");
    expect(pt.tn("paste.summary", 1, { chars: 5 })).toBe("1 linha, 5 caracteres");
  });
});

describe("current locale", () => {
  afterEach(() => {
    setLocale("en_US");
  });

  it("defaults to en_US and switches", () => {
    expect(getLocale()).toBe("en_US");
    expect(t("common.close")).toBe("Close");
    setLocale("pt_BR");
    expect(getLocale()).toBe("pt_BR");
    expect(t("common.close")).toBe("Fechar");
    expect(tn("workspace.pane_count", 2)).toBe("2 painéis");
  });
});
