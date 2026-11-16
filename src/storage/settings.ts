// SPDX-License-Identifier: GPL-3.0-or-later
import { logEvent } from "../log";
import type { SecureStore } from "./secureStore";

// App settings: item `settings.v1` of the secure store.

export type LanguageSetting = "system" | "en_US" | "pt_BR";

export interface Settings {
  readonly schema: 1;
  readonly language: LanguageSetting;
  /** Biometric / device-code lock, on by default (PRD-001 RF-1.17). */
  readonly appLock: boolean;
  /** Short vibration on the terminal bell (PRD-003 RF-3.23). */
  readonly bellVibration: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  schema: 1,
  language: "system",
  appLock: true,
  bellVibration: true,
};

const LANGUAGES: readonly string[] = ["system", "en_US", "pt_BR"];
const KEYS: readonly string[] = ["schema", "language", "appLock", "bellVibration"];

export type SettingsParseResult =
  | { readonly ok: true; readonly value: Settings }
  | { readonly ok: false; readonly reason: string };

/**
 * Strict validation of a parsed `settings.v1` document: unknown keys, a wrong
 * schema or a wrong type reject the whole document. Missing fields take their
 * default, so a later field can be added without breaking an older file.
 */
export function parseSettings(raw: unknown): SettingsParseResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "shape" };
  }
  const record = raw as Record<string, unknown>;
  if (!Object.keys(record).every((key) => KEYS.includes(key))) {
    return { ok: false, reason: "unknown-key" };
  }
  if (record["schema"] !== 1) {
    return { ok: false, reason: "schema" };
  }
  const language = record["language"] ?? DEFAULT_SETTINGS.language;
  if (typeof language !== "string" || !LANGUAGES.includes(language)) {
    return { ok: false, reason: "language" };
  }
  const appLock = record["appLock"] ?? DEFAULT_SETTINGS.appLock;
  if (typeof appLock !== "boolean") {
    return { ok: false, reason: "app-lock" };
  }
  const bellVibration = record["bellVibration"] ?? DEFAULT_SETTINGS.bellVibration;
  if (typeof bellVibration !== "boolean") {
    return { ok: false, reason: "bell-vibration" };
  }
  return {
    ok: true,
    value: { schema: 1, language: language as LanguageSetting, appLock, bellVibration },
  };
}

/** Loads the settings. Missing or invalid yields the defaults (invalid also logs an event). */
export async function loadSettings(
  store: SecureStore,
  log: typeof logEvent = logEvent,
): Promise<Settings> {
  const text = await store.get("settings.v1");
  if (text === null) {
    return DEFAULT_SETTINGS;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    log("storage_invalid", { item: "settings.v1", reason: "json" });
    return DEFAULT_SETTINGS;
  }
  const parsed = parseSettings(raw);
  if (!parsed.ok) {
    log("storage_invalid", { item: "settings.v1", reason: parsed.reason });
    return DEFAULT_SETTINGS;
  }
  return parsed.value;
}

export async function saveSettings(store: SecureStore, settings: Settings): Promise<void> {
  await store.set("settings.v1", JSON.stringify(settings));
}

/** Applies a partial change and persists the result. */
export async function updateSettings(
  store: SecureStore,
  change: Partial<Omit<Settings, "schema">>,
  log: typeof logEvent = logEvent,
): Promise<Settings> {
  const current = await loadSettings(store, log);
  const next: Settings = { ...current, ...change, schema: 1 };
  await saveSettings(store, next);
  return next;
}
