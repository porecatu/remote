// SPDX-License-Identifier: GPL-3.0-or-later
import { createTranslator, type Translator } from "./catalog";
import type { Locale } from "./locale";

// "When" of the desktop list (last connection attempt, anatomy §4.2): "now",
// "3 min ago", "2 h ago", "yesterday", or a short date. The ranges are in
// elapsed time up to a day, then in calendar days of the device's time zone.
// The date is built by hand from the catalog: Hermes does not guarantee `Intl`.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type RelativeTime =
  /** Less than a minute ago, or in the future (a clock that ran ahead). */
  | { readonly kind: "now" }
  /** 1 to 59 minutes ago, rounded down. */
  | { readonly kind: "minutes"; readonly count: number }
  /** 1 to 23 hours ago, rounded down (even across midnight). */
  | { readonly kind: "hours"; readonly count: number }
  /** A day or more ago, on the previous calendar day. */
  | { readonly kind: "yesterday" }
  /** Older: the local calendar date (month 1 to 12). */
  | { readonly kind: "date"; readonly day: number; readonly month: number; readonly year: number }
  /** `thenIso` is not a date. */
  | { readonly kind: "unknown" };

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Which range `thenIso` falls in, seen from `nowMs`, in the device's time zone. */
export function describeRelativeTime(thenIso: string, nowMs: number): RelativeTime {
  const thenMs = Date.parse(thenIso);
  if (Number.isNaN(thenMs)) {
    return { kind: "unknown" };
  }
  const elapsed = nowMs - thenMs;
  if (elapsed < MINUTE_MS) {
    return { kind: "now" };
  }
  if (elapsed < HOUR_MS) {
    return { kind: "minutes", count: Math.floor(elapsed / MINUTE_MS) };
  }
  if (elapsed < DAY_MS) {
    return { kind: "hours", count: Math.floor(elapsed / HOUR_MS) };
  }
  const then = new Date(thenMs);
  const now = new Date(nowMs);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameLocalDay(then, yesterday)) {
    return { kind: "yesterday" };
  }
  return {
    kind: "date",
    day: then.getDate(),
    month: then.getMonth() + 1,
    year: then.getFullYear(),
  };
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The text of `describeRelativeTime` in a language. Pass the screen's
 * `Translator` to follow the language in use, or a `Locale`.
 */
export function formatRelativeTime(
  thenIso: string,
  nowMs: number,
  locale: Locale | Translator,
): string {
  const translator = typeof locale === "string" ? createTranslator(locale) : locale;
  const time = describeRelativeTime(thenIso, nowMs);
  switch (time.kind) {
    case "now":
      return translator.t("time.now");
    case "minutes":
      return translator.tn("time.minutes_ago", time.count);
    case "hours":
      return translator.tn("time.hours_ago", time.count);
    case "yesterday":
      return translator.t("time.yesterday");
    case "date":
      return translator.t("time.date", {
        day: twoDigits(time.day),
        month: twoDigits(time.month),
        year: time.year,
      });
    case "unknown":
      return translator.t("time.unknown");
  }
}
