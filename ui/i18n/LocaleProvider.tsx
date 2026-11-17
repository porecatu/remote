// SPDX-License-Identifier: GPL-3.0-or-later
// The interface language, live (anatomy §4.4.1: the change applies at once,
// with no restart). The provider reads `settings.language` ("system" follows
// the system's languages), sets the catalog's locale (`setLocale`, which the
// controllers' `t()` also read) and publishes it in a context. Components read
// their text through `useT()` (or call `useLocale()`), so a change of language
// reaches them even behind memoized boundaries, such as the screens of the
// navigation stack, without remounting the tree and losing its state.
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { type Translator, createTranslator, getLocale, setLocale } from "@/i18n/catalog";
import { type Locale, resolveLocale } from "@/i18n/locale";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useServices } from "@ui/services/ServicesContext";

const LocaleContext = createContext<Locale | null>(null);

type LocaleProviderProps = {
  readonly children: ReactNode;
};

export function LocaleProvider({ children }: LocaleProviderProps) {
  const services = useServices();
  const language = useStoreState(services.settings.store, (state) => state.settings.language);
  const locale = useMemo(
    () => resolveLocale(language, services.systemLocales()),
    [language, services],
  );
  // Before the children render, so their `t()` already speaks the new language.
  // Idempotent: the catalog holds one locale for the whole app.
  if (getLocale() !== locale) {
    setLocale(locale);
  }
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/**
 * The interface language. Calling it subscribes the component to a change of
 * language. Outside a `LocaleProvider` it is the catalog's current locale.
 */
export function useLocale(): Locale {
  return useContext(LocaleContext) ?? getLocale();
}

/** `t` and `tn` of the current language; the component re-renders when it changes. */
export function useT(): Translator {
  const locale = useLocale();
  return useMemo(() => createTranslator(locale), [locale]);
}
