// SPDX-License-Identifier: GPL-3.0-or-later
import { createMemoryStore } from "./secureStore";
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings, updateSettings } from "./settings";

describe("settings defaults", () => {
  it("locks the app by default and follows the system language", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      schema: 1,
      language: "system",
      appLock: true,
      bellVibration: true,
    });
  });
});

describe("parseSettings", () => {
  it("accepts a complete document", () => {
    const parsed = parseSettings({ schema: 1, language: "pt_BR", appLock: false, bellVibration: false });
    expect(parsed).toEqual({
      ok: true,
      value: { schema: 1, language: "pt_BR", appLock: false, bellVibration: false },
    });
  });

  it("fills missing fields with defaults", () => {
    expect(parseSettings({ schema: 1 })).toEqual({ ok: true, value: DEFAULT_SETTINGS });
  });

  it.each([
    ["not an object", "x"],
    ["an array", []],
    ["null", null],
    ["a wrong schema", { schema: 2 }],
    ["a missing schema", {}],
    ["an unknown language", { schema: 1, language: "fr_FR" }],
    ["a non-boolean lock", { schema: 1, appLock: "yes" }],
    ["a non-boolean vibration", { schema: 1, bellVibration: 1 }],
    ["an unknown key", { schema: 1, extra: true }],
  ])("rejects %s", (_name, raw) => {
    expect(parseSettings(raw).ok).toBe(false);
  });
});

describe("settings persistence", () => {
  it("returns the defaults when nothing is stored", async () => {
    const log = jest.fn();
    expect(await loadSettings(createMemoryStore(), log)).toEqual(DEFAULT_SETTINGS);
    expect(log).not.toHaveBeenCalled();
  });

  it("round-trips through the store", async () => {
    const store = createMemoryStore();
    const settings = { ...DEFAULT_SETTINGS, language: "en_US" as const, appLock: false };
    await saveSettings(store, settings);
    expect(await loadSettings(store)).toEqual(settings);
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

  it("updates only the given fields", async () => {
    const store = createMemoryStore();
    const next = await updateSettings(store, { appLock: false });
    expect(next).toEqual({ ...DEFAULT_SETTINGS, appLock: false });
    expect(await loadSettings(store)).toEqual(next);
  });
});
