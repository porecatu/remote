// SPDX-License-Identifier: GPL-3.0-or-later
import { type SecureStore, createMemoryStore } from "@/storage/secureStore";
import { DEFAULT_SETTINGS, type Settings, loadSettings } from "@/storage/settings";
import { appShellSettings, createSettingsController } from "./settings";

function stored(settings: Partial<Settings>): string {
  return JSON.stringify({ ...DEFAULT_SETTINGS, ...settings });
}

/** A store whose reads or writes fail on demand. */
function flakyStore(base: SecureStore): SecureStore & { failReads: boolean; failWrites: boolean } {
  const flaky = {
    failReads: false,
    failWrites: false,
    get: (key: Parameters<SecureStore["get"]>[0]) =>
      flaky.failReads ? Promise.reject(new Error("locked")) : base.get(key),
    set: (key: Parameters<SecureStore["set"]>[0], value: string) =>
      flaky.failWrites ? Promise.reject(new Error("locked")) : base.set(key, value),
    delete: (key: Parameters<SecureStore["delete"]>[0]) => base.delete(key),
  };
  return flaky;
}

describe("settings controller", () => {
  it("starts with the defaults, not loaded", () => {
    const controller = createSettingsController({ store: createMemoryStore() });
    expect(controller.store.getState()).toEqual({
      loaded: false,
      loadError: false,
      settings: DEFAULT_SETTINGS,
    });
  });

  it("loads the stored settings once", async () => {
    const store = createMemoryStore({ "settings.v1": stored({ language: "pt_BR", appLock: false }) });
    const read = jest.fn(loadSettings);
    const controller = createSettingsController({ store, read: (s) => read(s) });
    const [first, second] = await Promise.all([controller.load(), controller.load()]);
    expect(first).toEqual(second);
    expect(read).toHaveBeenCalledTimes(1);
    expect(controller.store.getState()).toMatchObject({
      loaded: true,
      loadError: false,
      settings: { language: "pt_BR", appLock: false },
    });
  });

  it("keeps the defaults and deletes nothing when the read fails", async () => {
    const base = createMemoryStore({ "settings.v1": stored({ bellVibration: false }) });
    const store = flakyStore(base);
    store.failReads = true;
    const controller = createSettingsController({ store });
    await expect(controller.load()).resolves.toEqual(DEFAULT_SETTINGS);
    expect(controller.store.getState()).toEqual({
      loaded: true,
      loadError: true,
      settings: DEFAULT_SETTINGS,
    });
    expect(await base.get("settings.v1")).toBe(stored({ bellVibration: false }));
  });

  it("shows a change at once and persists it", async () => {
    const store = createMemoryStore();
    const controller = createSettingsController({ store });
    await controller.load();
    const saving = controller.update({ language: "pt_BR" });
    expect(controller.store.getState().settings.language).toBe("pt_BR");
    await saving;
    expect((await loadSettings(store)).language).toBe("pt_BR");
  });

  it("keeps the stored form of the device name", async () => {
    const store = createMemoryStore();
    const controller = createSettingsController({ store });
    await controller.load();
    await controller.update({ deviceName: "  Pixel 8  " });
    expect(controller.store.getState().settings.deviceName).toBe("Pixel 8");
    expect((await loadSettings(store)).deviceName).toBe("Pixel 8");
  });

  it("reverts a change that cannot be saved and rejects", async () => {
    const store = flakyStore(createMemoryStore());
    const controller = createSettingsController({ store });
    await controller.load();
    store.failWrites = true;
    await expect(controller.update({ bellVibration: false })).rejects.toThrow("locked");
    expect(controller.store.getState().settings.bellVibration).toBe(true);
  });

  it("writes one change at a time, in order", async () => {
    const store = createMemoryStore();
    const controller = createSettingsController({ store });
    await Promise.all([
      controller.update({ language: "pt_BR" }),
      controller.update({ appLock: false }),
      controller.update({ bellVibration: false }),
    ]);
    expect(await loadSettings(store)).toEqual({
      ...DEFAULT_SETTINGS,
      language: "pt_BR",
      appLock: false,
      bellVibration: false,
    });
    expect(controller.store.getState().settings).toEqual(await loadSettings(store));
  });

  it("reads before the first write", async () => {
    const store = createMemoryStore({ "settings.v1": stored({ appLock: false }) });
    const controller = createSettingsController({ store });
    await controller.update({ language: "pt_BR" });
    expect(controller.store.getState()).toMatchObject({
      loaded: true,
      settings: { appLock: false, language: "pt_BR" },
    });
  });

  it("is the app shell's settings slice", async () => {
    const store = createMemoryStore();
    const controller = createSettingsController({ store });
    const slice = appShellSettings(controller);
    await slice.update({ appLock: false });
    expect(controller.store.getState().settings.appLock).toBe(false);
    await expect(slice.load()).resolves.toMatchObject({ appLock: false });
  });
});
