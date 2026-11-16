// SPDX-License-Identifier: GPL-3.0-or-later
import * as ExpoSecureStore from "expo-secure-store";

// The only door to persistent storage (ADR-0003). Nothing goes to AsyncStorage
// or to a plain file. The key set is closed: a new item needs a new union member.

export type SecureStoreKey = "device.static_key" | "desktops.v1" | "settings.v1";

export interface SecureStore {
  get(key: SecureStoreKey): Promise<string | null>;
  set(key: SecureStoreKey, value: string): Promise<void>;
  delete(key: SecureStoreKey): Promise<void>;
}

/** Real implementation over expo-secure-store (Keychain on iOS, Keystore on Android). */
export function createExpoSecureStore(): SecureStore {
  const options: ExpoSecureStore.SecureStoreOptions = {
    keychainAccessible: ExpoSecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  };
  return {
    get: (key) => ExpoSecureStore.getItemAsync(key, options),
    set: (key, value) => ExpoSecureStore.setItemAsync(key, value, options),
    delete: (key) => ExpoSecureStore.deleteItemAsync(key, options),
  };
}

/** In-memory implementation, for tests. */
export function createMemoryStore(initial?: Partial<Record<SecureStoreKey, string>>): SecureStore {
  const items = new Map<SecureStoreKey, string>();
  if (initial !== undefined) {
    for (const [key, value] of Object.entries(initial) as [SecureStoreKey, string][]) {
      items.set(key, value);
    }
  }
  return {
    get: (key) => Promise.resolve(items.get(key) ?? null),
    set: (key, value) => {
      items.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      items.delete(key);
      return Promise.resolve();
    },
  };
}
