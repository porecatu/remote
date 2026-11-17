// SPDX-License-Identifier: GPL-3.0-or-later
import { createMemoryStore } from "./secureStore";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  parseSettings,
  rememberDeviceName,
  saveSettings,
  updateSettings,
} from "./settings";

describe("settings defaults", () => {
  it("locks the app by default, follows the system language and has no device name", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      schema: 2,
      language: "system",
      appLock: true,
      bellVibration: true,
      deviceName: null,
    });
  });
});

describe("parseSettings", () => {
  it("accepts a complete schema 2 document", () => {
    const parsed = parseSettings({
      schema: 2,
      language: "pt_BR",
      appLock: false,
      bellVibration: false,
      deviceName: "Pixel 8",
    });
    expect(parsed).toEqual({
      ok: true,
      value: { schema: 2, language: "pt_BR", appLock: false, bellVibration: false, deviceName: "Pixel 8" },
    });
  });

  it("accepts a null device name", () => {
    expect(parseSettings({ schema: 2, deviceName: null })).toEqual({ ok: true, value: DEFAULT_SETTINGS });
  });

  it("fills missing fields with defaults", () => {
    expect(parseSettings({ schema: 2 })).toEqual({ ok: true, value: DEFAULT_SETTINGS });
  });

  it("migrates a schema 1 document to schema 2 with no device name", () => {
    const parsed = parseSettings({ schema: 1, language: "en_US", appLock: false, bellVibration: true });
    expect(parsed).toEqual({
      ok: true,
      value: { schema: 2, language: "en_US", appLock: false, bellVibration: true, deviceName: null },
    });
    expect(parseSettings({ schema: 1 })).toEqual({ ok: true, value: DEFAULT_SETTINGS });
  });

  it("accepts a stored name of 64 single-byte characters", () => {
    const name = "x".repeat(64);
    expect(parseSettings({ schema: 2, deviceName: name })).toEqual({
      ok: true,
      value: { ...DEFAULT_SETTINGS, deviceName: name },
    });
  });

  it.each([
    ["not an object", "x"],
    ["an array", []],
    ["null", null],
    ["an unknown schema", { schema: 3 }],
    ["a string schema", { schema: "2" }],
    ["a missing schema", {}],
    ["an unknown language", { schema: 2, language: "fr_FR" }],
    ["a non-boolean lock", { schema: 2, appLock: "yes" }],
    ["a non-boolean vibration", { schema: 2, bellVibration: 1 }],
    ["an unknown key", { schema: 2, extra: true }],
    ["an unknown key in schema 1", { schema: 1, extra: true }],
    ["a device name in schema 1", { schema: 1, deviceName: "Pixel 8" }],
    ["a schema 1 with a bad field", { schema: 1, appLock: "yes" }],
  ])("rejects %s", (_name, raw) => {
    expect(parseSettings(raw).ok).toBe(false);
  });

  it.each([
    ["a number", 42],
    ["a boolean", false],
    ["an empty string", ""],
    ["only spaces", "   "],
    ["surrounding spaces", " Pixel 8 "],
    ["a control character", "Pixel\u00008"],
    ["a newline", "Pixel\n8"],
    ["more than 64 characters", "x".repeat(65)],
    ["more than 64 UTF-8 bytes", "é".repeat(40)],
  ])("rejects a device name that is %s", (_name, deviceName) => {
    expect(parseSettings({ schema: 2, deviceName })).toEqual({ ok: false, reason: "device-name" });
  });
});

describe("rememberDeviceName", () => {
  it("stores the name normalized with the pairing rule", () => {
    const next = rememberDeviceName(DEFAULT_SETTINGS, "  My\u0000 Phone\n ");
    expect(next).toEqual({ ...DEFAULT_SETTINGS, deviceName: "My Phone" });
  });

  it("cuts a long name at 64 UTF-8 bytes, and the result parses back", () => {
    const next = rememberDeviceName(DEFAULT_SETTINGS, "é".repeat(40));
    expect(next.deviceName).toBe("é".repeat(32));
    expect(parseSettings(JSON.parse(JSON.stringify(next)))).toEqual({ ok: true, value: next });
  });

  it("replaces the previous name", () => {
    const first = rememberDeviceName(DEFAULT_SETTINGS, "Pixel 8");
    expect(rememberDeviceName(first, "Tablet")).toEqual({ ...DEFAULT_SETTINGS, deviceName: "Tablet" });
  });

  it("keeps the settings when the name normalizes to empty", () => {
    const first = rememberDeviceName(DEFAULT_SETTINGS, "Pixel 8");
    expect(rememberDeviceName(first, " \n ")).toBe(first);
    expect(rememberDeviceName(DEFAULT_SETTINGS, "")).toBe(DEFAULT_SETTINGS);
  });

  it("does not touch the other fields nor the input", () => {
    const settings = { ...DEFAULT_SETTINGS, language: "pt_BR" as const, appLock: false };
    const next = rememberDeviceName(settings, "Pixel 8");
    expect(next).toEqual({ ...settings, deviceName: "Pixel 8" });
    expect(settings.deviceName).toBeNull();
  });
});

describe("settings persistence", () => {
  it("returns the defaults when nothing is stored", async () => {
    const log = jest.fn();
    expect(await loadSettings(createMemoryStore(), log)).toEqual(DEFAULT_SETTINGS);
    expect(log).not.toHaveBeenCalled();
  });

  it("round-trips a schema 2 document through the store", async () => {
    const store = createMemoryStore();
    const settings = { ...DEFAULT_SETTINGS, language: "en_US" as const, appLock: false, deviceName: "Pixel 8" };
    await saveSettings(store, settings);
    expect(await loadSettings(store)).toEqual(settings);
  });

  it("keeps the item name settings.v1 and writes schema 2", async () => {
    const store = createMemoryStore();
    await saveSettings(store, DEFAULT_SETTINGS);
    expect(JSON.parse((await store.get("settings.v1")) ?? "null")).toEqual(DEFAULT_SETTINGS);
  });

  it("migrates a stored schema 1 document on load, without logging", async () => {
    const log = jest.fn();
    const store = createMemoryStore({
      "settings.v1": JSON.stringify({ schema: 1, language: "pt_BR", appLock: false, bellVibration: true }),
    });
    expect(await loadSettings(store, log)).toEqual({
      schema: 2,
      language: "pt_BR",
      appLock: false,
      bellVibration: true,
      deviceName: null,
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("falls back to the defaults and logs on invalid JSON", async () => {
    const log = jest.fn();
    const store = createMemoryStore({ "settings.v1": "{not json" });
    expect(await loadSettings(store, log)).toEqual(DEFAULT_SETTINGS);
    expect(log).toHaveBeenCalledWith("storage_invalid", { item: "settings.v1", reason: "json" });
  });

  it("falls back to the defaults and logs on an invalid document", async () => {
    const log = jest.fn();
    const store = createMemoryStore({ "settings.v1": JSON.stringify({ schema: 1, appLock: 3 }) });
    expect(await loadSettings(store, log)).toEqual(DEFAULT_SETTINGS);
    expect(log).toHaveBeenCalledWith("storage_invalid", { item: "settings.v1", reason: "app-lock" });
  });

  it("falls back to the defaults and logs only the code on an invalid device name", async () => {
    const log = jest.fn();
    const store = createMemoryStore({
      "settings.v1": JSON.stringify({ schema: 2, appLock: false, deviceName: " secret\n" }),
    });
    expect(await loadSettings(store, log)).toEqual(DEFAULT_SETTINGS);
    expect(log).toHaveBeenCalledWith("storage_invalid", { item: "settings.v1", reason: "device-name" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });

  it("updates only the given fields", async () => {
    const store = createMemoryStore();
    const next = await updateSettings(store, { appLock: false });
    expect(next).toEqual({ ...DEFAULT_SETTINGS, appLock: false });
    expect(await loadSettings(store)).toEqual(next);
  });

  it("upgrades a stored schema 1 document to schema 2 on update", async () => {
    const store = createMemoryStore({ "settings.v1": JSON.stringify({ schema: 1, language: "pt_BR" }) });
    const next = await updateSettings(store, { bellVibration: false });
    expect(next).toEqual({ ...DEFAULT_SETTINGS, language: "pt_BR", bellVibration: false });
    expect(JSON.parse((await store.get("settings.v1")) ?? "null")).toEqual(next);
  });

  it("normalizes a device name through rememberDeviceName", async () => {
    const store = createMemoryStore();
    const next = await updateSettings(store, { deviceName: "  Pixel\u0000 8 \n" });
    expect(next).toEqual({ ...DEFAULT_SETTINGS, deviceName: "Pixel 8" });
    expect(await loadSettings(store)).toEqual(next);
  });

  it("keeps the stored name when the new one normalizes to empty", async () => {
    const store = createMemoryStore();
    await updateSettings(store, { deviceName: "Pixel 8" });
    expect(await updateSettings(store, { deviceName: "   " })).toEqual({ ...DEFAULT_SETTINGS, deviceName: "Pixel 8" });
  });

  it("forgets the name on null", async () => {
    const store = createMemoryStore();
    await updateSettings(store, { deviceName: "Pixel 8" });
    expect(await updateSettings(store, { deviceName: null })).toEqual(DEFAULT_SETTINGS);
  });
});
