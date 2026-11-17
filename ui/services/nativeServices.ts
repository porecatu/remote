// SPDX-License-Identifier: GPL-3.0-or-later

// The real platform pieces of `createServices`: the native modules of Expo and
// React Native. The only file of the app that imports them for the
// composition; the tests use `testing.tsx` instead.

import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Haptics from "expo-haptics";
import { getLocales } from "expo-localization";
import * as ScreenCapture from "expo-screen-capture";
import { Platform as ReactNativePlatform } from "react-native";
import type { FetchLike } from "@/net/presence";
import { openRelaySocket } from "@/net/relaySocket";
import { Platform } from "@/protocol";
import { createAuthenticator } from "@/security/authenticate";
import { realClock, realScheduler } from "@/session/clock";
import type { OpenSocket } from "@/session/lifecycle";
import { createExpoSecureStore } from "@/storage/secureStore";
import { type HapticsService, type ServiceDeps, type Services, createServices } from "./createServices";

const NOTIFICATION: Readonly<Record<"success" | "warning" | "error", Haptics.NotificationFeedbackType>> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

const haptics: HapticsService = {
  impactLight() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  notify(kind) {
    Haptics.notificationAsync(NOTIFICATION[kind]).catch(() => undefined);
  },
};

const openSocket: OpenSocket = (url, handlers) => openRelaySocket(url, handlers);

const fetchPresence: FetchLike = (url, init) => globalThis.fetch(url, init);

function platform(): Platform {
  switch (ReactNativePlatform.OS) {
    case "android":
      return Platform.android;
    case "ios":
      return Platform.ios;
    default:
      return Platform.other;
  }
}

/** The platform pieces backed by the native modules. */
export function nativeServiceDeps(): ServiceDeps {
  return {
    secureStore: createExpoSecureStore(),
    authenticator: createAuthenticator(),
    clock: realClock,
    scheduler: realScheduler,
    openSocket,
    fetch: fetchPresence,
    clipboard: {
      getString: () => Clipboard.getStringAsync(),
      setString: async (text) => {
        if (!(await Clipboard.setStringAsync(text))) {
          throw new Error("the clipboard refused the text");
        }
      },
    },
    haptics,
    screenCapture: {
      prevent: () => ScreenCapture.preventScreenCaptureAsync(),
      allow: () => ScreenCapture.allowScreenCaptureAsync(),
    },
    appVersion: Constants.expoConfig?.version ?? "0.0.0",
    deviceModel: Device.modelName,
    platform: platform(),
    systemLocales: () => getLocales(),
  };
}

/** The services of the running app. Create once, at the root. */
export function createNativeServices(): Services {
  return createServices(nativeServiceDeps());
}
