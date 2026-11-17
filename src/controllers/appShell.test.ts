// SPDX-License-Identifier: GPL-3.0-or-later
import { LOCK_AFTER_BACKGROUND_MS } from "@/security/appLock";
import type { AuthCapability, AuthResult, AuthenticateOptions, Authenticator } from "@/security/authenticate";
import { createMemoryStore } from "@/storage/secureStore";
import { DEFAULT_SETTINGS, type Settings, loadSettings } from "@/storage/settings";
import {
  type AppShellControllerDeps,
  type AppShellSettings,
  createAppShellController,
  selectContentVisible,
  selectPersistentWarning,
  selectShowLockScreen,
  settingsFromStore,
} from "./appShell";

const PAIR_URL = "porecatu://pair?v=1&k=abc&t=token";
const PAIR_URL_2 = "porecatu://pair?v=1&k=def&t=token2";

/** An authenticator whose prompts stay open until the test answers them. */
function fakeAuthenticator(initial: AuthCapability = "available") {
  let capability: AuthCapability = initial;
  const prompts: { options: AuthenticateOptions; resolve: (result: AuthResult) => void }[] = [];
  const authenticator: Authenticator = {
    capability: () => Promise.resolve(capability),
    authenticate: (options) =>
      new Promise<AuthResult>((resolve) => {
        prompts.push({ options, resolve });
      }),
  };
  return {
    authenticator,
    prompts,
    setCapability(next: AuthCapability) {
      capability = next;
    },
    /** Answers the oldest open prompt. */
    answer(result: AuthResult) {
      const prompt = prompts.shift();
      if (prompt === undefined) {
        throw new Error("no open prompt");
      }
      prompt.resolve(result);
    },
  };
}

function memorySettings(initial: Partial<Settings> = {}) {
  let current: Settings = { ...DEFAULT_SETTINGS, ...initial };
  const updates: Partial<Omit<Settings, "schema">>[] = [];
  let failNext = false;
  const settings: AppShellSettings = {
    load: () => Promise.resolve(current),
    update: (change) => {
      updates.push(change);
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error("storage"));
      }
      current = { ...current, ...change, schema: 2 } as Settings;
      return Promise.resolve(current);
    },
  };
  return {
    settings,
    updates,
    current: () => current,
    failNextUpdate() {
      failNext = true;
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

function setup(
  options: {
    appLock?: boolean;
    capability?: AuthCapability;
    initialAppState?: AppShellControllerDeps["initialAppState"];
  } = {},
) {
  const auth = fakeAuthenticator(options.capability ?? "available");
  const stored = memorySettings({ appLock: options.appLock ?? true });
  const registry = { enterBackground: jest.fn(), enterForeground: jest.fn() };
  let now = 1_000;
  const log = jest.fn();
  const controller = createAppShellController({
    authenticator: auth.authenticator,
    settings: stored.settings,
    registry,
    clock: { now: () => now },
    log,
    ...(options.initialAppState === undefined ? {} : { initialAppState: options.initialAppState }),
  });
  return {
    controller,
    auth,
    stored,
    registry,
    log,
    state: () => controller.store.getState(),
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("start", () => {
  it("shows nothing before the settings are read", () => {
    const { state } = setup();
    expect(state().ready).toBe(false);
    expect(selectContentVisible(state())).toBe(false);
    expect(selectShowLockScreen(state())).toBe(false);
  });

  it("with the lock on, starts locked and opens the prompt on its own", async () => {
    const { controller, auth, state } = setup();
    await controller.start();
    expect(state().ready).toBe(true);
    expect(state().lock.status).toBe("locked");
    expect(selectShowLockScreen(state())).toBe(true);
    expect(state().authenticating).toBe(true);
    expect(auth.prompts).toHaveLength(1);
    expect(auth.prompts[0]?.options.promptMessage).toBe("Unlock Porecatu Remote");

    auth.answer({ kind: "success" });
    await flush();
    expect(state().lock.status).toBe("unlocked");
    expect(state().authenticating).toBe(false);
    expect(state().lastFailure).toBeNull();
    expect(selectContentVisible(state())).toBe(true);
  });

  it("with the lock off, opens unlocked without a prompt", async () => {
    const { controller, auth, state } = setup({ appLock: false });
    await controller.start();
    expect(state().lock.status).toBe("unlocked");
    expect(auth.prompts).toHaveLength(0);
    expect(selectContentVisible(state())).toBe(true);
  });

  it("runs once", async () => {
    const { controller, auth } = setup();
    await Promise.all([controller.start(), controller.start()]);
    await controller.start();
    expect(auth.prompts).toHaveLength(1);
  });

  it("fails closed when the settings or the capability cannot be read", async () => {
    const authenticator: Authenticator = {
      capability: () => Promise.reject(new Error("native")),
      authenticate: () => new Promise<AuthResult>(() => undefined),
    };
    const controller = createAppShellController({
      authenticator,
      settings: { load: () => Promise.reject(new Error("io")), update: () => Promise.reject(new Error("io")) },
      registry: { enterBackground: jest.fn(), enterForeground: jest.fn() },
      clock: { now: () => 0 },
      log: jest.fn(),
    });
    await controller.start();
    expect(controller.store.getState().lock.status).toBe("locked");
  });

  it("waits for the app to be active before opening the prompt", async () => {
    const { controller, auth, state } = setup({ initialAppState: "background" });
    expect(state().coverVisible).toBe(true);
    await controller.start();
    expect(state().lock.status).toBe("locked");
    expect(auth.prompts).toHaveLength(0);
    controller.appStateChanged("active");
    await flush();
    expect(auth.prompts).toHaveLength(1);
  });
});

describe("unlock failures", () => {
  it("a cancelled prompt stays locked, shows the failure and does not reopen on its own", async () => {
    const { controller, auth, state } = setup();
    await controller.start();
    // iOS reports `inactive` while the system prompt is up.
    controller.appStateChanged("inactive");
    auth.answer({ kind: "failure", reason: "cancelled" });
    await flush();
    controller.appStateChanged("active");
    await flush();
    expect(state().lock.status).toBe("locked");
    expect(state().lastFailure).toBe("cancelled");
    expect(state().authenticating).toBe(false);
    expect(auth.prompts).toHaveLength(0);

    // The button tries again.
    void controller.unlock();
    expect(auth.prompts).toHaveLength(1);
    auth.answer({ kind: "success" });
    await flush();
    expect(state().lock.status).toBe("unlocked");
    expect(state().lastFailure).toBeNull();
  });

  it("lockout stays locked with its own failure, and the button opens the prompt again", async () => {
    const { controller, auth, state } = setup();
    await controller.start();
    auth.answer({ kind: "failure", reason: "lockout" });
    await flush();
    expect(state().lock.status).toBe("locked");
    expect(state().lastFailure).toBe("lockout");
    void controller.unlock();
    expect(auth.prompts).toHaveLength(1);
  });

  it("a prompt that throws never unlocks", async () => {
    const controller = createAppShellController({
      authenticator: {
        capability: () => Promise.resolve("available"),
        authenticate: () => Promise.reject(new Error("native")),
      },
      settings: memorySettings().settings,
      registry: { enterBackground: jest.fn(), enterForeground: jest.fn() },
      clock: { now: () => 0 },
      log: jest.fn(),
    });
    await controller.start();
    await flush();
    expect(controller.store.getState().lock.status).toBe("locked");
    expect(controller.store.getState().lastFailure).toBe("failed");
  });

  it("only one prompt runs at a time, and unlock does nothing when not locked", async () => {
    const { controller, auth } = setup();
    await controller.start();
    void controller.unlock();
    void controller.unlock();
    expect(auth.prompts).toHaveLength(1);
    auth.answer({ kind: "success" });
    await flush();
    void controller.unlock();
    expect(auth.prompts).toHaveLength(0);
  });
});

describe("device without a lock (RF-1.20)", () => {
  it("opens without a lock and with a persistent warning", async () => {
    const { controller, auth, state } = setup({ capability: "unavailable" });
    await controller.start();
    expect(state().lock.status).toBe("unavailable");
    expect(selectPersistentWarning(state())).toBe(true);
    expect(selectContentVisible(state())).toBe(true);
    expect(selectShowLockScreen(state())).toBe(false);
    expect(auth.prompts).toHaveLength(0);
  });

  it("the warning goes away when the system gets a lock, which then locks and prompts", async () => {
    const { controller, auth, state, advance } = setup({ capability: "unavailable" });
    await controller.start();
    controller.appStateChanged("background");
    auth.setCapability("available");
    advance(5_000);
    controller.appStateChanged("active");
    await flush();
    expect(selectPersistentWarning(state())).toBe(false);
    expect(state().lock.status).toBe("locked");
    expect(auth.prompts).toHaveLength(1);
  });

  it("a prompt that reports the device cannot authenticate opens the app with the warning", async () => {
    const { controller, auth, state } = setup();
    await controller.start();
    auth.answer({ kind: "unavailable" });
    await flush();
    expect(state().lock.status).toBe("unavailable");
    expect(selectPersistentWarning(state())).toBe(true);
  });
});

describe("background", () => {
  async function unlocked(options: Parameters<typeof setup>[0] = {}) {
    const harness = setup(options);
    await harness.controller.start();
    harness.auth.answer({ kind: "success" });
    await flush();
    return harness;
  }

  it("covers the screen whenever the app is not active, lock or no lock", async () => {
    for (const appLock of [true, false]) {
      const { controller, state } = appLock ? await unlocked() : setup({ appLock: false });
      await controller.start();
      expect(state().coverVisible).toBe(false);
      controller.appStateChanged("inactive");
      expect(state().coverVisible).toBe(true);
      controller.appStateChanged("background");
      expect(state().coverVisible).toBe(true);
      controller.appStateChanged("active");
      expect(state().coverVisible).toBe(false);
    }
  });

  it("coming back before 1 minute does not lock", async () => {
    const { controller, auth, state, advance } = await unlocked();
    controller.appStateChanged("inactive");
    controller.appStateChanged("background");
    advance(LOCK_AFTER_BACKGROUND_MS - 1);
    controller.appStateChanged("active");
    await flush();
    expect(state().lock.status).toBe("unlocked");
    expect(auth.prompts).toHaveLength(0);
  });

  it("coming back after 1 minute locks and opens the prompt", async () => {
    const { controller, auth, state, advance } = await unlocked();
    controller.appStateChanged("background");
    advance(LOCK_AFTER_BACKGROUND_MS);
    controller.appStateChanged("active");
    expect(state().lock.status).toBe("locked");
    expect(selectContentVisible(state())).toBe(false);
    await flush();
    expect(auth.prompts).toHaveLength(1);
  });

  it("takes the instant from the argument when given", async () => {
    const { controller, state } = await unlocked();
    controller.appStateChanged("background", 10_000);
    controller.appStateChanged("active", 10_000 + LOCK_AFTER_BACKGROUND_MS);
    expect(state().lock.status).toBe("locked");
  });

  it("a stale failure is cleared when the lock engages again", async () => {
    const { controller, auth, state, advance } = setup();
    await controller.start();
    auth.answer({ kind: "failure", reason: "cancelled" });
    await flush();
    void controller.unlock();
    auth.answer({ kind: "success" });
    await flush();
    // A failed attempt to turn the lock off does not reach the lock screen.
    void controller.setLockEnabled(false);
    await flush();
    auth.answer({ kind: "failure", reason: "cancelled" });
    await flush();
    expect(state().lastFailure).toBeNull();
    controller.appStateChanged("background");
    advance(LOCK_AFTER_BACKGROUND_MS);
    controller.appStateChanged("active");
    expect(state().lock.status).toBe("locked");
    expect(state().lastFailure).toBeNull();
  });

  it("a locked app coming back opens the prompt again", async () => {
    const { controller, auth, state, advance } = setup();
    await controller.start();
    auth.answer({ kind: "failure", reason: "cancelled" });
    await flush();
    controller.appStateChanged("background");
    advance(1_000);
    controller.appStateChanged("active");
    await flush();
    expect(state().lock.status).toBe("locked");
    expect(auth.prompts).toHaveLength(1);
  });

  it("does not open a second prompt when the system prompt sends the app to the background", async () => {
    const { controller, auth } = setup();
    await controller.start();
    // Android: the device passcode screen is another activity.
    controller.appStateChanged("background");
    controller.appStateChanged("active");
    await flush();
    expect(auth.prompts).toHaveLength(1);
  });

  it("tells the registry about background and foreground, once each", async () => {
    const { controller, registry, log } = await unlocked();
    controller.appStateChanged("inactive");
    expect(registry.enterBackground).not.toHaveBeenCalled();
    controller.appStateChanged("background");
    controller.appStateChanged("background");
    expect(registry.enterBackground).toHaveBeenCalledTimes(1);
    controller.appStateChanged("inactive");
    controller.appStateChanged("active");
    expect(registry.enterForeground).toHaveBeenCalledTimes(1);
    controller.appStateChanged("inactive");
    controller.appStateChanged("active");
    expect(registry.enterForeground).toHaveBeenCalledTimes(1);
    expect(log.mock.calls).toEqual([["app_background"], ["app_foreground"]]);
  });
});

describe("setLockEnabled", () => {
  async function unlocked(options: Parameters<typeof setup>[0] = {}) {
    const harness = setup(options);
    await harness.controller.start();
    if (harness.auth.prompts.length > 0) {
      harness.auth.answer({ kind: "success" });
    }
    await flush();
    return harness;
  }

  it("turning off asks for an authentication and only then changes", async () => {
    const { controller, auth, stored, state } = await unlocked();
    const done = controller.setLockEnabled(false);
    await flush();
    expect(auth.prompts).toHaveLength(1);
    expect(auth.prompts[0]?.options.promptMessage).toBe("Turn off the app lock");
    expect(state().lock.appLock).toBe(true);
    expect(state().authenticating).toBe(true);
    auth.answer({ kind: "success" });
    await expect(done).resolves.toBe(false);
    expect(state().lock.appLock).toBe(false);
    expect(state().lock.status).toBe("unlocked");
    expect(stored.current().appLock).toBe(false);
  });

  it("a failed authentication keeps the lock on and saves nothing", async () => {
    const { controller, auth, stored, state } = await unlocked();
    const done = controller.setLockEnabled(false);
    await flush();
    auth.answer({ kind: "failure", reason: "failed" });
    await expect(done).resolves.toBe(true);
    expect(state().lock.appLock).toBe(true);
    expect(state().lock.status).toBe("unlocked");
    expect(stored.updates).toHaveLength(0);
  });

  it("turning off on a device without a lock asks for nothing", async () => {
    const { controller, auth, stored, state } = await unlocked({ capability: "unavailable" });
    await expect(controller.setLockEnabled(false)).resolves.toBe(false);
    expect(auth.prompts).toHaveLength(0);
    expect(selectPersistentWarning(state())).toBe(false);
    expect(stored.current().appLock).toBe(false);
  });

  it("turning on asks for nothing and does not lock right away", async () => {
    const { controller, auth, stored, state } = await unlocked({ appLock: false });
    await expect(controller.setLockEnabled(true)).resolves.toBe(true);
    expect(auth.prompts).toHaveLength(0);
    expect(state().lock.status).toBe("unlocked");
    expect(stored.current().appLock).toBe(true);
  });

  it("turning on with a device without a lock shows the warning", async () => {
    const { controller, state } = await unlocked({ appLock: false, capability: "unavailable" });
    await controller.setLockEnabled(true);
    expect(state().lock.status).toBe("unavailable");
    expect(selectPersistentWarning(state())).toBe(true);
  });

  it("a change that cannot be saved is reverted", async () => {
    const { controller, stored, state } = await unlocked({ appLock: false });
    stored.failNextUpdate();
    await expect(controller.setLockEnabled(true)).resolves.toBe(false);
    expect(state().lock.appLock).toBe(false);
  });

  it("does nothing while locked", async () => {
    const { controller, auth, state } = setup();
    await controller.start();
    await expect(controller.setLockEnabled(false)).resolves.toBe(true);
    expect(auth.prompts).toHaveLength(1);
    expect(state().lock.appLock).toBe(true);
  });
});

describe("pairing deep link", () => {
  it("ignores URLs that are not pairing links", async () => {
    const { controller, state } = setup({ appLock: false });
    await controller.start();
    expect(controller.receiveLink("https://example.com/pair")).toBe(false);
    expect(state().pendingPairingLink).toBeNull();
    expect(controller.takePairingLink()).toBeNull();
  });

  it("is held while locked and released, once, after unlocking", async () => {
    const { controller, auth, state } = setup();
    await controller.start();
    expect(controller.receiveLink(PAIR_URL)).toBe(true);
    expect(state().pendingPairingLink).toBe(PAIR_URL);
    expect(controller.takePairingLink()).toBeNull();
    auth.answer({ kind: "success" });
    await flush();
    expect(controller.takePairingLink()).toBe(PAIR_URL);
    expect(controller.takePairingLink()).toBeNull();
    expect(state().pendingPairingLink).toBeNull();
  });

  it("a link that arrives before start waits for the settings", async () => {
    const { controller } = setup({ appLock: false });
    controller.receiveLink(PAIR_URL);
    expect(controller.takePairingLink()).toBeNull();
    await controller.start();
    expect(controller.takePairingLink()).toBe(PAIR_URL);
  });

  it("is delivered at once while unlocked, and the newest link wins", async () => {
    const { controller, state } = setup({ appLock: false });
    await controller.start();
    controller.receiveLink(PAIR_URL);
    controller.receiveLink(PAIR_URL_2);
    expect(state().pendingPairingLink).toBe(PAIR_URL_2);
    expect(controller.takePairingLink()).toBe(PAIR_URL_2);
    expect(controller.takePairingLink()).toBeNull();
  });

  it("a newer link held while locked replaces an untaken one", async () => {
    const { controller, auth, advance } = setup();
    await controller.start();
    auth.answer({ kind: "success" });
    await flush();
    controller.receiveLink(PAIR_URL);
    controller.appStateChanged("background");
    advance(LOCK_AFTER_BACKGROUND_MS);
    controller.appStateChanged("active");
    expect(controller.takePairingLink()).toBeNull();
    controller.receiveLink(PAIR_URL_2);
    await flush();
    auth.answer({ kind: "success" });
    await flush();
    expect(controller.takePairingLink()).toBe(PAIR_URL_2);
  });

  it("is never logged", async () => {
    const { controller, auth, log } = setup();
    await controller.start();
    controller.receiveLink(PAIR_URL);
    auth.answer({ kind: "success" });
    await flush();
    controller.takePairingLink();
    expect(JSON.stringify(log.mock.calls)).not.toContain("token");
  });
});

describe("settingsFromStore", () => {
  it("reads and writes settings.v1", async () => {
    const store = createMemoryStore();
    const slice = settingsFromStore(store);
    await expect(slice.load()).resolves.toEqual(DEFAULT_SETTINGS);
    await slice.update({ appLock: false });
    await expect(loadSettings(store)).resolves.toMatchObject({ appLock: false });
  });
});
