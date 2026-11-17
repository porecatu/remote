// SPDX-License-Identifier: GPL-3.0-or-later
// The services of `createServices` over fakes, and a `render` that wraps a
// screen in every provider of the root, for the tests of the screens. The
// wiring is the real one (`createServices`); only the platform pieces are
// fake: the secure store in memory, the network on the in-memory relay of
// `src/session/testing.ts`, an authenticator that answers what the test says,
// a clock driven by hand, and haptics, clipboard and screen capture that
// record their calls. Not imported by app code.
import { render, type RenderResult } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";

import type { SystemLocale } from "@/i18n/locale";
import type { FetchLike } from "@/net/presence";
import { Platform, base64UrlEncode, type StaticKeypair } from "@/protocol";
import { type MemoryRelay, createMemoryRelay } from "@/protocol/testing";
import type { AuthCapability, AuthResult, Authenticator } from "@/security/authenticate";
import { type FakeNetwork, type ManualTime, createFakeNetwork, createManualTime } from "@/session/testing";
import { type DesktopList, serializeDesktopList } from "@/storage/desktopList";
import { DEVICE_KEY_ITEM } from "@/storage/deviceIdentity";
import { type SecureStore, type SecureStoreKey, createMemoryStore } from "@/storage/secureStore";
import { DEFAULT_SETTINGS, type Settings } from "@/storage/settings";
import { LocaleProvider } from "@ui/i18n/LocaleProvider";
import { type ColorScheme, ThemeProvider } from "@ui/theme";

import {
  type ClipboardService,
  type HapticsService,
  type ScreenCaptureService,
  type ServiceDeps,
  type Services,
  createServices,
} from "./createServices";
import { ServicesProvider } from "./ServicesContext";

// ----------------------------------------------------------------- fakes

export interface FakeAuthenticator extends Authenticator {
  /** What `capability()` answers from now on (default `available`). */
  setCapability(capability: AuthCapability): void;
  /** What `authenticate()` answers from now on (default success). */
  setResult(result: AuthResult): void;
  /** The prompt message of every `authenticate()` call, in order. */
  readonly prompts: readonly string[];
}

export function createFakeAuthenticator(
  capability: AuthCapability = "available",
  result: AuthResult = { kind: "success" },
): FakeAuthenticator {
  let currentCapability = capability;
  let currentResult = result;
  const prompts: string[] = [];
  return {
    capability: () => Promise.resolve(currentCapability),
    authenticate: (options) => {
      prompts.push(options.promptMessage);
      return Promise.resolve(currentResult);
    },
    setCapability(next) {
      currentCapability = next;
    },
    setResult(next) {
      currentResult = next;
    },
    prompts,
  };
}

export type HapticsCall = "impact-light" | "notify-success" | "notify-warning" | "notify-error";

export interface FakeHaptics extends HapticsService {
  readonly calls: readonly HapticsCall[];
}

export function createFakeHaptics(): FakeHaptics {
  const calls: HapticsCall[] = [];
  return {
    impactLight() {
      calls.push("impact-light");
    },
    notify(kind) {
      calls.push(`notify-${kind}`);
    },
    calls,
  };
}

export interface FakeClipboard extends ClipboardService {
  /** Puts text on the clipboard as another app would (not counted in `writes`). */
  setText(text: string): void;
  /** What the clipboard holds now. */
  readonly text: string;
  /** How many times the app read the clipboard. */
  readonly reads: number;
  /** What the app wrote, in order. */
  readonly writes: readonly string[];
  /** Whether the next writes of the app fail (default false). */
  setWriteFails(fails: boolean): void;
}

export function createFakeClipboard(initial = ""): FakeClipboard {
  let text = initial;
  let reads = 0;
  let writeFails = false;
  const writes: string[] = [];
  return {
    getString() {
      reads += 1;
      return Promise.resolve(text);
    },
    setString(next) {
      if (writeFails) {
        return Promise.reject(new Error("clipboard write failed"));
      }
      writes.push(next);
      text = next;
      return Promise.resolve();
    },
    setText(next) {
      text = next;
    },
    get text() {
      return text;
    },
    get reads() {
      return reads;
    },
    writes,
    setWriteFails(fails) {
      writeFails = fails;
    },
  };
}

export interface FakeScreenCapture extends ScreenCaptureService {
  /** Whether capture is blocked now. */
  readonly prevented: boolean;
  readonly calls: readonly ("prevent" | "allow")[];
}

export function createFakeScreenCapture(): FakeScreenCapture {
  const calls: ("prevent" | "allow")[] = [];
  let prevented = false;
  return {
    prevent() {
      calls.push("prevent");
      prevented = true;
      return Promise.resolve();
    },
    allow() {
      calls.push("allow");
      prevented = false;
      return Promise.resolve();
    },
    get prevented() {
      return prevented;
    },
    calls,
  };
}

export type PresenceAnswer = "online" | "offline" | "unknown";

export interface FakeFetch {
  readonly fetch: FetchLike;
  /** What the presence query answers for a host id (default `unknown`). */
  setPresence(hostId: string, answer: PresenceAnswer): void;
  /** Every URL requested, in order. */
  readonly requests: readonly string[];
}

const PRESENCE_STATUS: Readonly<Record<PresenceAnswer, number>> = {
  online: 204,
  offline: 404,
  unknown: 503,
};

export function createFakeFetch(): FakeFetch {
  const answers = new Map<string, PresenceAnswer>();
  const requests: string[] = [];
  return {
    fetch: (url) => {
      requests.push(url);
      const hostId = url.slice(url.lastIndexOf("/") + 1);
      return Promise.resolve({ status: PRESENCE_STATUS[answers.get(hostId) ?? "unknown"] });
    },
    setPresence(hostId, answer) {
      answers.set(hostId, answer);
    },
    requests,
  };
}

// ----------------------------------------------------------------- services

export interface TestFakes {
  readonly secureStore: SecureStore;
  readonly relay: MemoryRelay;
  readonly network: FakeNetwork;
  readonly time: ManualTime;
  readonly authenticator: FakeAuthenticator;
  readonly fetch: FakeFetch;
  readonly clipboard: FakeClipboard;
  readonly haptics: FakeHaptics;
  readonly screenCapture: FakeScreenCapture;
}

export type TestServices = Services & { readonly fakes: TestFakes };

export interface TestServicesOptions {
  /** Items already in the secure store. */
  readonly items?: Partial<Record<SecureStoreKey, string>>;
  /** Stored as `device.static_key`, so a fake host can know the device (`testKeypair`). */
  readonly deviceKey?: StaticKeypair;
  /** Stored as `settings.v1` over the defaults. */
  readonly settings?: Partial<Omit<Settings, "schema">>;
  /** Stored as `desktops.v1`. */
  readonly desktops?: DesktopList;
  /** The relay the fake network talks to (share it with a fake host). */
  readonly relay?: MemoryRelay;
  readonly time?: ManualTime;
  readonly capability?: AuthCapability;
  readonly authResult?: AuthResult;
  readonly clipboardText?: string;
  readonly appVersion?: string;
  readonly deviceModel?: string | null;
  readonly platform?: Platform;
  readonly systemLocales?: readonly SystemLocale[];
  /** Replaces any platform piece outright. */
  readonly deps?: Partial<ServiceDeps>;
}

const EN_US: readonly SystemLocale[] = [{ languageCode: "en", languageTag: "en-US" }];

/** The services over fakes. Not started: `renderWithServices` starts them, or call `start()`. */
export function createTestServices(options: TestServicesOptions = {}): TestServices {
  const items: Partial<Record<SecureStoreKey, string>> = { ...options.items };
  if (options.deviceKey !== undefined) {
    items[DEVICE_KEY_ITEM] = base64UrlEncode(options.deviceKey.privateKey);
  }
  if (options.settings !== undefined) {
    items["settings.v1"] = JSON.stringify({ ...DEFAULT_SETTINGS, ...options.settings });
  }
  if (options.desktops !== undefined) {
    items["desktops.v1"] = serializeDesktopList(options.desktops);
  }
  const relay = options.relay ?? createMemoryRelay();
  const fakes: TestFakes = {
    secureStore: createMemoryStore(items),
    relay,
    network: createFakeNetwork(relay),
    time: options.time ?? createManualTime(),
    authenticator: createFakeAuthenticator(options.capability, options.authResult),
    fetch: createFakeFetch(),
    clipboard: createFakeClipboard(options.clipboardText),
    haptics: createFakeHaptics(),
    screenCapture: createFakeScreenCapture(),
  };
  const systemLocales = options.systemLocales ?? EN_US;
  const services = createServices({
    secureStore: fakes.secureStore,
    authenticator: fakes.authenticator,
    clock: fakes.time.clock,
    scheduler: fakes.time.scheduler,
    openSocket: fakes.network.openSocket,
    fetch: fakes.fetch.fetch,
    clipboard: fakes.clipboard,
    haptics: fakes.haptics,
    screenCapture: fakes.screenCapture,
    appVersion: options.appVersion ?? "0.0.0-test",
    deviceModel: options.deviceModel === undefined ? "Test Phone" : options.deviceModel,
    platform: options.platform ?? Platform.android,
    systemLocales: () => systemLocales,
    ...options.deps,
  });
  return { ...services, fakes };
}

// ----------------------------------------------------------------- render

/** A phone in portrait with a notch and a home indicator. */
export const TEST_SAFE_AREA: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export interface RenderWithServicesOptions {
  /** Default: `createTestServices()`. */
  readonly services?: TestServices;
  /** Await `services.start()` before rendering (default true). */
  readonly start?: boolean;
  /** Forces the chrome mode; default: the system's (mocked). */
  readonly scheme?: ColorScheme;
}

export type RenderWithServicesResult = RenderResult & { readonly services: TestServices };

/**
 * Renders `ui` inside the providers of the root: services, language, theme,
 * safe area (fixed metrics), gesture root and keyboard. `rerender` keeps them.
 */
export async function renderWithServices(
  ui: ReactElement,
  options: RenderWithServicesOptions = {},
): Promise<RenderWithServicesResult> {
  const services = options.services ?? createTestServices();
  if (options.start !== false) {
    await services.start();
  }
  const scheme = options.scheme;
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ServicesProvider services={services}>
        <LocaleProvider>
          <ThemeProvider {...(scheme === undefined ? {} : { scheme })}>
            <SafeAreaProvider initialMetrics={TEST_SAFE_AREA}>
              <GestureHandlerRootView>
                <KeyboardProvider>{children}</KeyboardProvider>
              </GestureHandlerRootView>
            </SafeAreaProvider>
          </ThemeProvider>
        </LocaleProvider>
      </ServicesProvider>
    );
  }
  const result = await render(ui, { wrapper: Wrapper });
  return { ...result, services };
}
