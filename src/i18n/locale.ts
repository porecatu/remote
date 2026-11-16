// SPDX-License-Identifier: GPL-3.0-or-later
import { getLocales } from "expo-localization";

// Picks the interface language: the user's choice, or the system's when it is
// in the catalog, or en_US.

export type Locale = "en_US" | "pt_BR";

export type LocaleChoice = "system" | Locale;

export const DEFAULT_LOCALE: Locale = "en_US";

/** The part of an expo-localization `Locale` this module reads. */
export type SystemLocale = { languageCode: string | null; languageTag: string };

const BY_LANGUAGE: Readonly<Record<string, Locale>> = {
  en: "en_US",
  pt: "pt_BR",
};

function languageOf(locale: SystemLocale): string | undefined {
  const code = locale.languageCode ?? locale.languageTag.split(/[-_]/)[0];
  return code?.toLowerCase();
}

/** The first system language, in preference order, that the catalog has. */
export function matchSystemLocale(systemLocales: readonly SystemLocale[]): Locale {
  for (const systemLocale of systemLocales) {
    const language = languageOf(systemLocale);
    const match = language === undefined ? undefined : BY_LANGUAGE[language];
    if (match !== undefined) {
      return match;
    }
  }
  return DEFAULT_LOCALE;
}

export function resolveLocale(
  choice: LocaleChoice,
  systemLocales: readonly SystemLocale[],
): Locale {
  return choice === "system" ? matchSystemLocale(systemLocales) : choice;
}

/** Resolves against the device's language list (`expo-localization`). */
export function resolveSystemLocale(choice: LocaleChoice): Locale {
  if (choice !== "system") {
    return choice;
  }
  try {
    return matchSystemLocale(getLocales());
  } catch {
    return DEFAULT_LOCALE;
  }
}
