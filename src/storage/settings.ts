// SPDX-License-Identifier: GPL-3.0-or-later
import { logEvent } from "../log";
import { normalizeDeviceName } from "../pairing/pairingFlow";
import type { SecureStore } from "./secureStore";

// App settings: item `settings.v1` of the secure store. The item name stays
// `settings.v1`; the document carries its own `schema` number, and older
// schemas are migrated on read.

export type LanguageSetting = "system" | "en_US" | "pt_BR";

export interface Settings {
  readonly schema: 2;
  readonly language: LanguageSetting;
  /** Biometric / device-code lock, on by default (PRD-001 RF-1.17). */
  readonly appLock: boolean;
  /** Short vibration on the terminal bell (PRD-003 RF-3.23). */
  readonly bellVibration: boolean;
  /**
   * Device name of the last completed pairing (PRD-001 RF-1.2, RF-1.7), already
   * normalized; `null` until the first pairing completes.
   */
  readonly deviceName: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  schema: 2,
  language: "system",
  appLock: true,
  bellVibration: true,
  deviceName: null,
};

const LANGUAGES: readonly string[] = ["system", "en_US", "pt_BR"];
const KEYS_V1: readonly string[] = ["schema", "language", "appLock", "bellVibration"];
const KEYS_V2: readonly string[] = [...KEYS_V1, "deviceName"];

export type SettingsParseResult =
  | { readonly ok: true; readonly value: Settings }
  | { readonly ok: false; readonly reason: string };

/** A stored device name is valid only in its normalized, non-empty form. */
function isStoredDeviceName(value: string): boolean {
  return value !== "" && normalizeDeviceName(value) === value;
}

/**
 * Strict validation of a parsed `settings.v1` document: unknown keys, a wrong
 * schema or a wrong type reject the whole document. Missing fields take their
 * default, so a later field can be added without breaking an older file.
 * Schema 1 (no `deviceName`) is migrated to schema 2 with `deviceName: null`.
 */
export function parseSettings(raw: unknown): SettingsParseResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "shape" };
  }
  const record = raw as Record<string, unknown>;
  const schema = record["schema"];
  if (schema !== 1 && schema !== 2) {
    return { ok: false, reason: "schema" };
  }
  const keys = schema === 1 ? KEYS_V1 : KEYS_V2;
  if (!Object.keys(record).every((key) => keys.includes(key))) {
    return { ok: false, reason: "unknown-key" };
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
  const deviceName = record["deviceName"] ?? DEFAULT_SETTINGS.deviceName;
  if (deviceName !== null && (typeof deviceName !== "string" || !isStoredDeviceName(deviceName))) {
    return { ok: false, reason: "device-name" };
  }
  return {
    ok: true,
    value: {
      schema: 2,
      language: language as LanguageSetting,
      appLock,
      bellVibration,
      deviceName,
    },
  };
}

/**
 * Records the device name of a completed pairing, normalized with the pairing
 * rule (RF-1.7). A name that normalizes to empty leaves the settings unchanged.
 */
export function rememberDeviceName(settings: Settings, name: string): Settings {
  const normalized = normalizeDeviceName(name);
  if (normalized === "" || normalized === settings.deviceName) {
    return settings;
  }
  return { ...settings, deviceName: normalized };
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

/**
 * Applies a partial change and persists the result. A string `deviceName` goes
 * through `rememberDeviceName`; `null` forgets the stored name.
 */
export async function updateSettings(
  store: SecureStore,
  change: Partial<Omit<Settings, "schema">>,
  log: typeof logEvent = logEvent,
): Promise<Settings> {
  const current = await loadSettings(store, log);
  const { deviceName, ...rest } = change;
  let next: Settings = { ...current, ...rest, schema: 2 };
  if (typeof deviceName === "string") {
    next = rememberDeviceName(next, deviceName);
  } else if (deviceName === null) {
    next = { ...next, deviceName: null };
  }
  await saveSettings(store, next);
  return next;
}
