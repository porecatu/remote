// SPDX-License-Identifier: GPL-3.0-or-later

// The settings of the app in memory (anatomy §4.4.1, PRD-001 RF-1.2, RF-1.17
// and RF-1.18, PRD-003 RF-3.23): one store for the whole app, read once from
// item `settings.v1` of the secure store and written back on every change.
// The app shell (lock), the language provider, the settings screens and the
// pairing (device name) all read and write through this one object, so there
// is a single copy of the settings in memory. Pure: no React.
//
// Rules this file keeps:
// - a read that fails (the keystore is unavailable) leaves the defaults in
//   memory and sets `loadError`; nothing is written or deleted on its own. An
//   invalid document also yields the defaults (`loadSettings` logs it);
// - a change shows at once (the language switch applies immediately, §4.4.1)
//   and is then persisted with `updateSettings`; a change that cannot be saved
//   is reverted in memory and the promise rejects, so the caller can say so;
// - writes run one at a time, in the order they were asked for, and only
//   after the first read: each one is a read-modify-write of the stored
//   document. A change made before the read finishes shows again once its
//   write completes;
// - nothing is logged here: the device name is content.

import { type StoreApi, createStore } from "zustand/vanilla";
import type { AppShellSettings } from "@/controllers/appShell";
import type { SecureStore } from "@/storage/secureStore";
import { DEFAULT_SETTINGS, type Settings, loadSettings, updateSettings } from "@/storage/settings";

export type SettingsChange = Partial<Omit<Settings, "schema">>;

export interface SettingsState {
  /** The first read finished (successfully or not). */
  readonly loaded: boolean;
  /** The read failed: `settings` holds the defaults, and nothing was written. */
  readonly loadError: boolean;
  /** The settings in effect (the defaults until the read finishes). */
  readonly settings: Settings;
}

export interface SettingsControllerDeps {
  readonly store: SecureStore;
  /** Reads `settings.v1`; defaults to `loadSettings(store)`. Tests only. */
  readonly read?: (store: SecureStore) => Promise<Settings>;
  /** Writes a change; defaults to `updateSettings(store, change)`. Tests only. */
  readonly write?: (store: SecureStore, change: SettingsChange) => Promise<Settings>;
}

export interface SettingsController {
  readonly store: StoreApi<SettingsState>;
  /**
   * Reads the stored settings once; later calls wait for that read. Resolves
   * to the settings in effect at that moment (the defaults when the read
   * failed); never rejects.
   */
  load(): Promise<Settings>;
  /**
   * Applies `change` in memory at once and persists it. Resolves to the
   * settings saved; on a failed write the changed fields go back to what they
   * were and the promise rejects.
   */
  update(change: SettingsChange): Promise<Settings>;
}

const INITIAL: SettingsState = { loaded: false, loadError: false, settings: DEFAULT_SETTINGS };

export function createSettingsController(deps: SettingsControllerDeps): SettingsController {
  const read = deps.read ?? ((store: SecureStore) => loadSettings(store));
  const write = deps.write ?? ((store: SecureStore, change: SettingsChange) => updateSettings(store, change));
  const store = createStore<SettingsState>()(() => INITIAL);
  let loading: Promise<Settings> | null = null;
  let tail: Promise<unknown> = Promise.resolve();

  async function runLoad(): Promise<Settings> {
    let stored: Settings;
    let loadError = false;
    try {
      stored = await read(deps.store);
    } catch {
      stored = DEFAULT_SETTINGS;
      loadError = true;
    }
    store.setState({ loaded: true, loadError, settings: stored });
    return stored;
  }

  function load(): Promise<Settings> {
    loading ??= runLoad();
    return loading.then(() => store.getState().settings);
  }

  function update(change: SettingsChange): Promise<Settings> {
    const before = store.getState().settings;
    const keys = Object.keys(change) as (keyof SettingsChange)[];
    // Show the change now; the stored document follows.
    store.setState({ settings: { ...before, ...change } });
    const task = async (): Promise<Settings> => {
      // The first read goes before any write, so it can never land after one.
      await load();
      try {
        const saved = await write(deps.store, change);
        // The stored form wins for the fields written (the device name is normalized).
        const current = store.getState().settings;
        const merged: Record<string, unknown> = { ...current };
        for (const key of keys) {
          merged[key] = saved[key];
        }
        store.setState({ settings: merged as unknown as Settings });
        return saved;
      } catch (error) {
        // Revert only the fields still holding this change's values.
        const current = store.getState().settings;
        const reverted: Record<string, unknown> = { ...current };
        for (const key of keys) {
          if (Object.is(current[key], change[key])) {
            reverted[key] = before[key];
          }
        }
        store.setState({ settings: reverted as unknown as Settings });
        throw error;
      }
    };
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  }

  return { store, load, update };
}

/** The same object seen as the app shell's settings slice (`createAppShellController`). */
export function appShellSettings(controller: SettingsController): AppShellSettings {
  return {
    load: () => controller.load(),
    update: (change) => controller.update(change),
  };
}
