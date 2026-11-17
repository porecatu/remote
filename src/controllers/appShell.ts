// SPDX-License-Identifier: GPL-3.0-or-later

// The controller of the app shell (PRD-001 RF-1.5, RF-1.17 to RF-1.20; PRD-002
// RF-2.5; docs/arquitetura.md §2): the biometric lock, the privacy cover of the
// app switcher, the `porecatu://pair` deep link held while the app is locked,
// and the foreground/background signal for the session registry. It wires the
// pure state machines (`reduceAppLock`, `reduceDeepLink`) to the authenticator,
// the settings and the registry. Pure: no React; the root layout reads `store`
// and calls the actions.
//
// Rules this file keeps:
// - the app starts locked when the lock is on and the device can authenticate,
//   and the system prompt opens on its own (anatomy §4.1). Before `start()`
//   finishes the state is the locked default: nothing is shown;
// - a device that cannot authenticate opens the app with a persistent warning
//   and no lock (RF-1.20); the capability is read again on every return from
//   the background, so the warning goes away once the system has a lock;
// - the prompt opens on its own only when the lock screen appears: at start
//   and on a return from the background. A return from `inactive` alone (the
//   system prompt itself makes iOS report `inactive`) does not open it again,
//   so a cancelled prompt does not loop. Only one authentication runs at a time;
// - the cover is up whenever the app is not `active`, lock or no lock (RF-1.19);
// - coming back after 1 minute or more in the background locks (RF-1.17), and
//   the registry hears every change of background/foreground (it closes the
//   sessions after 30 s and reconnects them on return, RF-2.5);
// - turning the lock off asks for an authentication, except when the device
//   cannot authenticate; turning it on asks for nothing (RF-1.18, §4.4.1). A
//   change that cannot be saved is reverted in memory;
// - a pairing link is handed out only while content is visible, once; the
//   newest link wins. The link carries a single-use token: never logged.
//
// Logged: only `app_background` and `app_foreground`, with no fields.

import { type StoreApi, createStore } from "zustand/vanilla";
import { t } from "@/i18n/catalog";
import { type EventName, logEvent } from "@/log";
import { type DeepLinkState, createDeepLinkState, isPairingLink, reduceDeepLink } from "@/pairing/deepLink";
import {
  type AppLockEvent,
  type AppLockState,
  createAppLockState,
  hasPersistentWarning,
  isContentVisible,
  reduceAppLock,
} from "@/security/appLock";
import type { AuthCapability, AuthFailure, AuthResult, Authenticator } from "@/security/authenticate";
import type { Clock } from "@/session/clock";
import type { SessionRegistry } from "@/session/registry";
import type { SecureStore } from "@/storage/secureStore";
import { type Settings, loadSettings, updateSettings } from "@/storage/settings";

// ----------------------------------------------------------------- types

/** The app states the shell tells apart (React Native `AppState`, mapped by the caller). */
export type AppStateKind = "active" | "inactive" | "background";

export interface AppShellState {
  /** `start()` finished: the lock state reflects the settings and the device. */
  readonly ready: boolean;
  /** The last app state reported by `appStateChanged`. */
  readonly appState: AppStateKind;
  /** The lock state machine (`src/security/appLock.ts`). */
  readonly lock: AppLockState;
  /** A system prompt is open (to unlock or to turn the lock off). */
  readonly authenticating: boolean;
  /**
   * Why the last unlock attempt failed, for the text of the lock screen;
   * cleared when the lock engages again and on success. A failed attempt to
   * turn the lock off does not set it.
   */
  readonly lastFailure: AuthFailure | null;
  /** The neutral screen covers everything: the app is not `active` (RF-1.19). */
  readonly coverVisible: boolean;
  /**
   * The pairing URI waiting for the pairing flow, held while locked. A secret
   * (single-use token): never shown, never logged; read it with `takePairingLink`.
   */
  readonly pendingPairingLink: string | null;
}

/** The settings slice the shell reads and writes. */
export interface AppShellSettings {
  load(): Promise<Settings>;
  update(change: Partial<Omit<Settings, "schema">>): Promise<Settings>;
}

export interface AppShellControllerDeps {
  readonly authenticator: Authenticator;
  readonly settings: AppShellSettings;
  readonly registry: Pick<SessionRegistry, "enterBackground" | "enterForeground">;
  readonly clock: Pick<Clock, "now">;
  /** The app state when the controller is created; defaults to `active`. */
  readonly initialAppState?: AppStateKind;
  readonly log?: (name: EventName) => void;
}

export interface AppShellController {
  readonly store: StoreApi<AppShellState>;
  /**
   * Reads the settings and the device capability, sets the initial lock state
   * and, when locked and active, opens the system prompt. Runs once; later
   * calls return the first one's promise.
   */
  start(): Promise<void>;
  /** The "Unlock" button: opens the system prompt. Does nothing unless locked and idle. */
  unlock(): Promise<void>;
  /**
   * The app state changed. `nowMs` defaults to `clock.now()`. Covers the
   * screen when not `active`, starts the background clock of the lock and
   * tells the registry.
   */
  appStateChanged(state: AppStateKind, nowMs?: number): void;
  /**
   * The settings switch. Turning off asks for an authentication (none when the
   * device cannot authenticate); turning on asks for nothing. Resolves to the
   * value of the setting afterwards.
   */
  setLockEnabled(enabled: boolean): Promise<boolean>;
  /** A URL from the system (`Linking`). True when it is a pairing link (held or ready). */
  receiveLink(url: string): boolean;
  /** The pairing URI, once, and only while content is visible; otherwise null. */
  takePairingLink(): string | null;
}

// ----------------------------------------------------------------- selectors

/** Desktop and terminal content may be shown (not locked and started). */
export function selectContentVisible(state: AppShellState): boolean {
  return state.ready && isContentVisible(state.lock);
}

/** The lock screen (§4.1) is on screen. */
export function selectShowLockScreen(state: AppShellState): boolean {
  return state.ready && state.lock.status === "locked";
}

/** The persistent "this device cannot be locked" band (RF-1.20). */
export function selectPersistentWarning(state: AppShellState): boolean {
  return state.ready && hasPersistentWarning(state.lock);
}

// ----------------------------------------------------------------- settings

/** The settings slice over the secure store (`settings.v1`). */
export function settingsFromStore(store: SecureStore): AppShellSettings {
  return {
    load: () => loadSettings(store),
    update: (change) => updateSettings(store, change),
  };
}

// ----------------------------------------------------------------- controller

const FAILED: AuthResult = { kind: "failure", reason: "failed" };

export function createAppShellController(deps: AppShellControllerDeps): AppShellController {
  const { authenticator, settings, registry, clock } = deps;
  const log = deps.log ?? ((name: EventName) => logEvent(name));
  const initialAppState = deps.initialAppState ?? "active";

  const store = createStore<AppShellState>()(() => ({
    ready: false,
    appState: initialAppState,
    // Locked until the settings say otherwise: nothing shows before `start()`.
    lock: createAppLockState(true, "available"),
    authenticating: false,
    lastFailure: null,
    coverVisible: initialAppState !== "active",
    pendingPairingLink: null,
  }));

  // Deep link: `deepLink.pending` is a link held while locked; `readyLink` one
  // released and not taken yet. Both live only in memory.
  let deepLink: DeepLinkState = createDeepLinkState();
  let readyLink: string | null = null;
  // The app went to the background (as reported here) since the last `active`.
  let wentBackground = false;
  // The lock screen appeared while the app was not active: prompt on `active`.
  let promptWhenActive = false;
  let starting: Promise<void> | null = null;

  const publishLink = (): Partial<AppShellState> => ({
    pendingPairingLink: deepLink.pending ?? readyLink,
  });

  /** Sets a new lock state, running what its transitions ask for. */
  function applyLock(next: AppLockState, extra: Partial<AppShellState> = {}): void {
    const before = store.getState().lock;
    const update: { -readonly [K in keyof AppShellState]?: AppShellState[K] } = { lock: next };
    if (!isContentVisible(before) && isContentVisible(next)) {
      const step = reduceDeepLink(deepLink, { type: "unlocked" });
      deepLink = step.state;
      if (step.deliver !== null) {
        readyLink = step.deliver;
      }
    }
    if (before.status !== "locked" && next.status === "locked") {
      update.lastFailure = null;
    }
    store.setState({ ...update, ...extra, ...publishLink() });
  }

  function dispatch(event: AppLockEvent, extra: Partial<AppShellState> = {}): void {
    applyLock(reduceAppLock(store.getState().lock, event), extra);
  }

  async function readCapability(): Promise<AuthCapability> {
    try {
      return await authenticator.capability();
    } catch {
      // Fail closed: a broken check must not open a locked app.
      return "available";
    }
  }

  async function authenticate(promptMessage: string): Promise<AuthResult> {
    try {
      return await authenticator.authenticate({ promptMessage });
    } catch {
      return FAILED;
    }
  }

  /** Opens the prompt on its own if the lock screen is up and the app is active. */
  function promptIfLocked(): void {
    const state = store.getState();
    if (!state.ready || state.lock.status !== "locked") {
      return;
    }
    if (state.appState !== "active") {
      promptWhenActive = true;
      return;
    }
    promptWhenActive = false;
    void unlock();
  }

  async function unlock(): Promise<void> {
    const state = store.getState();
    if (!state.ready || state.authenticating || state.lock.status !== "locked") {
      return;
    }
    store.setState({ authenticating: true });
    const result = await authenticate(t("app_lock.unlock_reason"));
    const lastFailure = result.kind === "failure" ? result.reason : null;
    dispatch({ type: "auth-result", result }, { authenticating: false, lastFailure });
  }

  async function runStart(): Promise<void> {
    let appLock = true;
    try {
      appLock = (await settings.load()).appLock;
    } catch {
      // Fail closed: the default is the lock on.
    }
    const capability = await readCapability();
    applyLock(createAppLockState(appLock, capability), { ready: true });
    promptIfLocked();
  }

  async function onForeground(): Promise<void> {
    const capability = await readCapability();
    dispatch({ type: "capability", capability });
    promptIfLocked();
  }

  function appStateChanged(next: AppStateKind, nowMs?: number): void {
    const previous = store.getState().appState;
    if (next === previous) {
      return;
    }
    const now = nowMs ?? clock.now();
    store.setState({ appState: next, coverVisible: next !== "active" });

    if (next === "background") {
      if (!wentBackground) {
        wentBackground = true;
        dispatch({ type: "background", now });
        registry.enterBackground();
        log("app_background");
      }
      return;
    }
    if (next !== "active") {
      return;
    }
    if (wentBackground) {
      wentBackground = false;
      dispatch({ type: "foreground", now });
      registry.enterForeground();
      log("app_foreground");
      if (store.getState().ready) {
        void onForeground();
      }
      return;
    }
    if (promptWhenActive) {
      promptIfLocked();
    }
  }

  async function persistAppLock(appLock: boolean): Promise<void> {
    try {
      await settings.update({ appLock });
    } catch {
      dispatch({ type: "config", appLock: !appLock });
    }
  }

  async function setLockEnabled(enabled: boolean): Promise<boolean> {
    const state = store.getState();
    if (!state.ready || state.authenticating || state.lock.appLock === enabled) {
      return state.lock.appLock;
    }

    if (enabled) {
      const capability = await readCapability();
      const withCapability = reduceAppLock(store.getState().lock, { type: "capability", capability });
      applyLock(reduceAppLock(withCapability, { type: "config", appLock: true }));
      await persistAppLock(true);
      return store.getState().lock.appLock;
    }

    dispatch({ type: "disable-requested" });
    const requested = store.getState().lock;
    if (!requested.appLock) {
      // `unavailable`: nothing to ask for (RF-1.20).
      await persistAppLock(false);
      return store.getState().lock.appLock;
    }
    if (!requested.pendingDisable) {
      // Locked: the settings are not reachable; nothing changes.
      return true;
    }
    store.setState({ authenticating: true });
    const result = await authenticate(t("settings.app_lock_disable_reason"));
    dispatch({ type: "auth-result", result }, { authenticating: false });
    if (store.getState().lock.appLock) {
      return true;
    }
    await persistAppLock(false);
    return store.getState().lock.appLock;
  }

  function receiveLink(url: string): boolean {
    if (!isPairingLink(url)) {
      return false;
    }
    const locked = !selectContentVisible(store.getState());
    const step = reduceDeepLink(deepLink, { type: "link", url, locked });
    deepLink = step.state;
    // The newest link wins: an older one released but not taken is stale.
    readyLink = step.deliver;
    store.setState(publishLink());
    return true;
  }

  function takePairingLink(): string | null {
    if (!selectContentVisible(store.getState()) || readyLink === null) {
      return null;
    }
    const link = readyLink;
    readyLink = null;
    store.setState(publishLink());
    return link;
  }

  return {
    store,
    start() {
      starting ??= runStart();
      return starting;
    },
    unlock,
    appStateChanged,
    setLockEnabled,
    receiveLink,
    takePairingLink,
  };
}
