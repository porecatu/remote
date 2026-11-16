// SPDX-License-Identifier: GPL-3.0-or-later
import enUS from "../../locales/en_US.json";
import ptBR from "../../locales/pt_BR.json";
import { DEFAULT_LOCALE, type Locale } from "./locale";
import { pluralCategory } from "./plural";

// The message catalog. Keys are typed from en_US, so a key that does not exist
// is a compile error; a test keeps pt_BR in step with en_US.

export type MessageKey = keyof typeof enUS;

type PluralSuffix = ".one" | ".other";

/** Base of every `<base>.one` / `<base>.other` pair, the keys `tn` takes. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}.one`
    ? `${Base}.other` extends MessageKey
      ? Base
      : never
    : never;
}[MessageKey];

export type MessageParams = Readonly<Record<string, string | number>>;

export type Messages = Readonly<Record<MessageKey, string>>;

export const MESSAGES: Readonly<Record<Locale, Messages>> = {
  en_US: enUS,
  pt_BR: ptBR,
};

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** The `{name}` placeholders of a message, in order of first appearance. */
export function placeholdersOf(message: string): string[] {
  const names: string[] = [];
  for (const match of message.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (name !== undefined && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Replaces `{name}` with the parameter. A missing parameter throws in
 * development and tests (a bug to fix); in a release build the placeholder
 * stays visible instead of crashing the screen.
 */
export function interpolate(message: string, params?: MessageParams): string {
  return message.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = params?.[name];
    if (value === undefined) {
      if (__DEV__) {
        throw new Error(`Missing message parameter "${name}"`);
      }
      return placeholder;
    }
    return String(value);
  });
}

export type Translator = {
  readonly locale: Locale;
  t(key: MessageKey, params?: MessageParams): string;
  tn(key: PluralKey, count: number, params?: MessageParams): string;
};

export function createTranslator(locale: Locale): Translator {
  const messages = MESSAGES[locale];
  return {
    locale,
    t: (key, params) => interpolate(messages[key], params),
    tn: (key, count, params) => {
      const suffix: PluralSuffix = `.${pluralCategory(locale, count)}`;
      const pluralKey = `${key}${suffix}` as MessageKey;
      return interpolate(messages[pluralKey], { ...params, count });
    },
  };
}

let current: Translator = createTranslator(DEFAULT_LOCALE);

export function setLocale(locale: Locale): void {
  current = createTranslator(locale);
}

export function getLocale(): Locale {
  return current.locale;
}

export function t(key: MessageKey, params?: MessageParams): string {
  return current.t(key, params);
}

export function tn(key: PluralKey, count: number, params?: MessageParams): string {
  return current.tn(key, count, params);
}
