// SPDX-License-Identifier: GPL-3.0-or-later

// The composition root of the app (docs/arquitetura.md §2): the one place that
// puts the storage, the identity, the session registry and the controllers
// together, and hands them to the screens through `ServicesProvider`. The
// platform pieces (secure store, authenticator, sockets, fetch, clipboard,
// haptics, screen capture, version, model, system languages) come in as
// `ServiceDeps`: `nativeServices.ts` passes the real modules and
// `testing.tsx` passes fakes, so the wiring below is the same in both.
//
// Rules this file keeps:
// - the device key is ensured before any session can exist: the registry the
//   screens hold is a stable front that forwards to the registry built for the
//   current key, and has nothing open until `start()` finishes. The root shows
//   a neutral screen until `status.ready`;
// - the key pair lives only in this closure and in the registry (ADR-0003):
//   never in a store, never logged. `identity.keypair()` hands out a copy;
// - recreating the identity (PRD-001 RF-1.3) closes every session, writes the
//   new key, forgets every desktop and builds the registry again on the new
//   key; the old key is wiped from memory;
// - the settings exist once in memory (`src/controllers/settings.ts`); the app
//   shell reads and writes that same object.

import { type StoreApi, createStore } from "zustand/vanilla";
import { type AppShellController, createAppShellController } from "@/controllers/appShell";
import { type DesktopsController, createDesktopsController } from "@/controllers/desktops";
import { type SettingsController, appShellSettings, createSettingsController } from "@/controllers/settings";
import type { SystemLocale } from "@/i18n/locale";
import type { FetchLike } from "@/net/presence";
import { type Platform, type RandomSource, type StaticKeypair, zeroize } from "@/protocol";
import type { Authenticator } from "@/security/authenticate";
import type { Clock, Scheduler } from "@/session/clock";
import type { OpenSocket, SessionHandover } from "@/session/lifecycle";
import { type SessionRegistry, createSessionRegistry } from "@/session/registry";
import type { SessionStore } from "@/session/sessionStore";
import { type Desktop, type DesktopRepository, createDesktopRepository } from "@/storage/desktopList";
import {
  type DeviceIdentityRepository,
  copyKeypair,
  createDeviceIdentityRepository,
  deviceFingerprint,
} from "@/storage/deviceIdentity";
import type { SecureStore } from "@/storage/secureStore";

// ----------------------------------------------------------------- platform pieces

/**
 * The system clipboard: read for paste (PRD-003), written by "Copy" of the
 * device fingerprint (§4.4.2). The text is content: never logged.
 */
export interface ClipboardService {
  getString(): Promise<string>;
  /** Puts `text` on the clipboard; rejects when the platform refuses it. */
  setString(text: string): Promise<void>;
}

/** The haptic feedback the app uses. Failures are swallowed: feedback is never essential. */
export interface HapticsService {
  /** A light impact (key bar, long press). */
  impactLight(): void;
  /** A system notification pattern (bell, results). */
  notify(kind: "success" | "warning" | "error"): void;
}

/** Blocks screenshots and recording while content is shown (RF-1.19). */
export interface ScreenCaptureService {
  prevent(): Promise<void>;
  allow(): Promise<void>;
}

/** Everything the composition takes from the platform. */
export interface ServiceDeps {
  readonly secureStore: SecureStore;
  readonly authenticator: Authenticator;
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  readonly openSocket: OpenSocket;
  readonly fetch: FetchLike;
  readonly clipboard: ClipboardService;
  readonly haptics: HapticsService;
  readonly screenCapture: ScreenCaptureService;
  /** The app version sent in `hello` and shown in Settings. */
  readonly appVersion: string;
  /** The phone model (`expo-device`), the device name before the first pairing; null when unknown. */
  readonly deviceModel: string | null;
  /** `pair-request.platform`. */
  readonly platform: Platform;
  /** The system languages, in preference order (`expo-localization`). */
  readonly systemLocales: () => readonly SystemLocale[];
  /** Source of the key material; defaults to `globalThis.crypto`. Tests only. */
  readonly random?: RandomSource;
}

// ----------------------------------------------------------------- services

export interface ServicesState {
  /** The device key is loaded and the registry is built: the app may show content. */
  readonly ready: boolean;
  /** The last `start()` failed (the secure store could not be read or written). */
  readonly failed: boolean;
  /** `recreateIdentity()` is running. */
  readonly recreating: boolean;
  /** `"ABCD EFGH IJKL MNOP"` of the current key (spec 02 §1); null before `ready`. */
  readonly fingerprint: string | null;
}

export interface IdentityService {
  readonly repository: DeviceIdentityRepository;
  /** A copy of the current key pair (for the pairing); throws before `ready`. */
  keypair(): StaticKeypair;
}

export interface Services {
  /** Readiness of the composition and the fingerprint of the current key. */
  readonly status: StoreApi<ServicesState>;
  /**
   * Loads the settings and ensures the device key (RF-1.1), then builds the
   * registry. Runs once; a failed start can be tried again by calling it again.
   * It does not start the app shell nor load the desktop list: the root does.
   */
  start(): Promise<void>;
  readonly secureStore: SecureStore;
  readonly settings: SettingsController;
  readonly identity: IdentityService;
  readonly repository: DesktopRepository;
  /** Stable for the life of the app, also across `recreateIdentity()`. */
  readonly registry: SessionRegistry;
  readonly desktops: DesktopsController;
  readonly appShell: AppShellController;
  readonly authenticator: Authenticator;
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  readonly openSocket: OpenSocket;
  readonly fetch: FetchLike;
  readonly clipboard: ClipboardService;
  readonly haptics: HapticsService;
  readonly screenCapture: ScreenCaptureService;
  readonly appVersion: string;
  readonly deviceModel: string | null;
  readonly platform: Platform;
  readonly systemLocales: () => readonly SystemLocale[];
  /** Wall clock, ISO 8601 UTC. */
  nowIso(): string;
  /**
   * Recreates the device identity (RF-1.3): closes every session, writes a new
   * key, forgets every desktop, builds the registry on the new key and reloads
   * the list. Rejects when the new key could not be written (nothing is lost
   * then) or the list could not be cleared.
   */
  recreateIdentity(): Promise<void>;
}

const NOT_READY = "services not ready";

export function createServices(deps: ServiceDeps): Services {
  const { secureStore, clock, scheduler, openSocket } = deps;
  const nowIso = (): string => clock.iso();

  const status = createStore<ServicesState>()(() => ({
    ready: false,
    failed: false,
    recreating: false,
    fingerprint: null,
  }));

  const settings = createSettingsController({ store: secureStore });
  const repository = createDesktopRepository(secureStore);
  const identityRepository = createDeviceIdentityRepository(
    secureStore,
    repository,
    deps.random === undefined ? {} : { random: deps.random },
  );

  // The key in use and the registry built on it. Both change only in `start`
  // and `recreateIdentity`.
  let device: StaticKeypair | null = null;
  let current: SessionRegistry | null = null;

  function buildRegistry(key: StaticKeypair): SessionRegistry {
    return createSessionRegistry({
      device: key,
      appVersion: deps.appVersion,
      openSocket,
      clock,
      scheduler,
      repository,
      ...(deps.random === undefined ? {} : { random: deps.random }),
    });
  }

  /** Puts a new key in use: a new registry, the old key wiped. */
  function adoptKey(key: StaticKeypair): void {
    const previous = device;
    device = key;
    current = buildRegistry(key);
    if (previous !== null) {
      zeroize(previous.privateKey);
    }
    status.setState({ fingerprint: deviceFingerprint(key) });
  }

  function live(): SessionRegistry {
    if (current === null) {
      throw new Error(NOT_READY);
    }
    return current;
  }

  // The front the controllers and screens hold.
  const registry: SessionRegistry = {
    open: (desktop: Desktop): SessionStore => live().open(desktop),
    openPaired: (desktop: Desktop, handover: SessionHandover): SessionStore =>
      live().openPaired(desktop, handover),
    get: (desktopId) => current?.get(desktopId),
    close: (desktopId) => {
      current?.close(desktopId);
    },
    closeAll: () => {
      current?.closeAll();
    },
    openIds: () => current?.openIds() ?? [],
    enterBackground: () => {
      current?.enterBackground();
    },
    enterForeground: () => {
      current?.enterForeground();
    },
  };

  const desktops = createDesktopsController({
    repository,
    registry,
    fetch: deps.fetch,
    clock,
    scheduler,
    nowIso,
  });

  const appShell = createAppShellController({
    authenticator: deps.authenticator,
    settings: appShellSettings(settings),
    registry,
    clock,
  });

  let starting: Promise<void> | null = null;

  async function runStart(): Promise<void> {
    status.setState({ failed: false });
    try {
      // Never rejects: a failed read leaves the defaults.
      await settings.load();
      const ensured = await identityRepository.ensure();
      adoptKey(ensured.keypair);
      status.setState({ ready: true });
    } catch (error) {
      starting = null;
      status.setState({ failed: true });
      throw error;
    }
  }

  async function recreateIdentity(): Promise<void> {
    if (status.getState().recreating) {
      return;
    }
    status.setState({ recreating: true });
    try {
      registry.closeAll();
      try {
        adoptKey(await identityRepository.recreate());
      } catch (error) {
        // The new key may have been written before the list failed to clear:
        // follow what the secure store holds now.
        await followStoredKey();
        throw error;
      } finally {
        await desktops.reload();
      }
    } finally {
      status.setState({ recreating: false });
    }
  }

  async function followStoredKey(): Promise<void> {
    try {
      const stored = await identityRepository.inspect();
      if (stored.status !== "ok") {
        return;
      }
      if (device !== null && deviceFingerprint(device) === deviceFingerprint(stored.keypair)) {
        zeroize(stored.keypair.privateKey);
        return;
      }
      adoptKey(stored.keypair);
    } catch {
      // Nothing better to do: the key in memory stays.
    }
  }

  return {
    status,
    start() {
      starting ??= runStart();
      return starting;
    },
    secureStore,
    settings,
    identity: {
      repository: identityRepository,
      keypair() {
        if (device === null) {
          throw new Error(NOT_READY);
        }
        return copyKeypair(device);
      },
    },
    repository,
    registry,
    desktops,
    appShell,
    authenticator: deps.authenticator,
    clock,
    scheduler,
    openSocket,
    fetch: deps.fetch,
    clipboard: deps.clipboard,
    haptics: deps.haptics,
    screenCapture: deps.screenCapture,
    appVersion: deps.appVersion,
    deviceModel: deps.deviceModel,
    platform: deps.platform,
    systemLocales: deps.systemLocales,
    nowIso,
    recreateIdentity,
  };
}
