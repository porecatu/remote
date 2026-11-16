// SPDX-License-Identifier: GPL-3.0-or-later
import * as ExpoSecureStore from "expo-secure-store";
import { createExpoSecureStore, createMemoryStore } from "./secureStore";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 6,
  getItemAsync: jest.fn(() => Promise.resolve("value")),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

describe("createMemoryStore", () => {
  it("returns null for a missing key", async () => {
    const store = createMemoryStore();
    expect(await store.get("settings.v1")).toBeNull();
  });

  it("stores, overwrites and deletes", async () => {
    const store = createMemoryStore();
    await store.set("desktops.v1", "a");
    expect(await store.get("desktops.v1")).toBe("a");
    await store.set("desktops.v1", "b");
    expect(await store.get("desktops.v1")).toBe("b");
    await store.delete("desktops.v1");
    expect(await store.get("desktops.v1")).toBeNull();
  });

  it("keeps keys apart and accepts initial content", async () => {
    const store = createMemoryStore({ "device.static_key": "k" });
    expect(await store.get("device.static_key")).toBe("k");
    expect(await store.get("settings.v1")).toBeNull();
  });

  it("accepts only the closed key set at compile time", () => {
    const store = createMemoryStore();
    // @ts-expect-error not a known key
    const bad: () => Promise<string | null> = () => store.get("other");
    expect(typeof bad).toBe("function");
  });
});

describe("createExpoSecureStore", () => {
  it("passes AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY on every call", async () => {
    const store = createExpoSecureStore();
    const options = { keychainAccessible: ExpoSecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
    expect(await store.get("settings.v1")).toBe("value");
    await store.set("desktops.v1", "x");
    await store.delete("device.static_key");
    expect(ExpoSecureStore.getItemAsync).toHaveBeenCalledWith("settings.v1", options);
    expect(ExpoSecureStore.setItemAsync).toHaveBeenCalledWith("desktops.v1", "x", options);
    expect(ExpoSecureStore.deleteItemAsync).toHaveBeenCalledWith("device.static_key", options);
    expect(options.keychainAccessible).toBe(6);
  });
});
