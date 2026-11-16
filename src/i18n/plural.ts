// SPDX-License-Identifier: GPL-3.0-or-later

// Plural rules written by hand: Hermes may lack Intl.PluralRules, and the two
// languages of the catalog need only "one" and "other".

export type PluralCategory = "one" | "other";

export type PluralLocale = "en_US" | "pt_BR";

/**
 * en: "one" when n = 1 exactly (so 1.5 is "other").
 * pt: "one" when the integer part is 0 or 1 (CLDR i = 0..1, so 1.5 is "one").
 */
export function pluralCategory(locale: PluralLocale, n: number): PluralCategory {
  const abs = Math.abs(n);
  if (locale === "pt_BR") {
    const integerPart = Math.trunc(abs);
    return integerPart === 0 || integerPart === 1 ? "one" : "other";
  }
  return abs === 1 ? "one" : "other";
}
