// SPDX-License-Identifier: GPL-3.0-or-later
// The root of the app (docs/arquitetura.md §2, ADR-0011): the providers, then
// the layers, bottom to top:
//
//   navigator (the expo-router `Stack`, passed as `children`)
//   → overlays (sheets, dialogs, snackbars: `OverlayHost`)
//   → lock screen (while locked, §4.1)
//   → privacy cover (while the app is not `active`, RF-1.19; always the top).
//
// None of them is a `Modal`, so nothing sits above the cover. While the lock
// screen or the cover is up, everything under it leaves the screen reader tree.
//
// Start-up: the services start (the device key is ensured) and then the app
// shell (settings, lock state, the automatic system prompt). Until then the
// screen is a bare `bg.base`. The navigator mounts on the first unlock (or at
// once when the lock is off or unavailable), so no desktop list exists before
// it (§4.1), and stays mounted under the lock afterwards, keeping the
// navigation. App state changes go to the shell from the first render.
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { type Metrics, SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { selectContentVisible, selectShowLockScreen } from "@/controllers/appShell";
import { useStoreState } from "@ui/hooks/useStoreState";
import { LocaleProvider } from "@ui/i18n/LocaleProvider";
import { OverlayHost, OverlayProvider, OverlayUnderlay, type AppOverlayController } from "@ui/overlay";
import type { Services } from "@ui/services/createServices";
import { ServicesProvider, useServices } from "@ui/services/ServicesContext";
import { ThemeProvider, useTheme } from "@ui/theme";

import { DeepLinkBridge } from "./DeepLinkBridge";
import { LockScreen } from "./LockScreen";
import { PrivacyCover } from "./PrivacyCover";
import { useAppStateBridge } from "./useAppStateBridge";

const HIDDEN: Pick<ViewProps, "importantForAccessibility" | "accessibilityElementsHidden"> = {
  importantForAccessibility: "no-hide-descendants",
  accessibilityElementsHidden: true,
};

const SHOWN: Pick<ViewProps, "importantForAccessibility" | "accessibilityElementsHidden"> = {
  importantForAccessibility: "auto",
  accessibilityElementsHidden: false,
};

type AppLayersProps = {
  readonly children: ReactNode;
};

/** The layers of the root over the services; starts the services and the app shell. */
export function AppLayers({ children }: AppLayersProps) {
  const services = useServices();
  const { appShell } = services;
  const { colors } = useTheme();
  const servicesReady = useStoreState(services.status, (state) => state.ready);
  const showLock = useStoreState(appShell.store, selectShowLockScreen);
  const contentVisible = useStoreState(appShell.store, selectContentVisible);
  const coverVisible = useStoreState(appShell.store, (state) => state.coverVisible);
  const [navigatorMounted, setNavigatorMounted] = useState(false);

  useAppStateBridge(appShell);

  useEffect(() => {
    services
      .start()
      .then(() => appShell.start())
      // A failed start leaves `status.failed` set and the bare background.
      .catch(() => undefined);
  }, [services, appShell]);

  // Mounted on the first unlock, and kept.
  if (servicesReady && contentVisible && !navigatorMounted) {
    setNavigatorMounted(true);
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bgBase }]}>
      {navigatorMounted ? (
        <View style={styles.fill} {...(showLock || coverVisible ? HIDDEN : SHOWN)}>
          <OverlayUnderlay>{children}</OverlayUnderlay>
          <OverlayHost />
        </View>
      ) : null}
      {showLock ? (
        <View style={StyleSheet.absoluteFill} {...(coverVisible ? HIDDEN : SHOWN)}>
          <LockScreen />
        </View>
      ) : null}
      {coverVisible ? <PrivacyCover /> : null}
      <DeepLinkBridge navigatorMounted={navigatorMounted} />
    </View>
  );
}

type AppRootProps = {
  readonly services: Services;
  /** The navigator (the expo-router `Stack`). */
  readonly children: ReactNode;
  /** The overlay store; default a new one. */
  readonly overlays?: AppOverlayController;
  /** Safe area metrics before the first measure; default the window's. Tests pass fixed ones. */
  readonly safeAreaMetrics?: Metrics | null;
};

/** Every provider of the app around the layers. */
export function AppRoot({ services, children, overlays, safeAreaMetrics = initialWindowMetrics }: AppRootProps) {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <KeyboardProvider>
          <ServicesProvider services={services}>
            <LocaleProvider>
              <ThemeProvider>
                <StatusBar style="auto" />
                <OverlayProvider {...(overlays === undefined ? {} : { controller: overlays })}>
                  <AppLayers>{children}</AppLayers>
                </OverlayProvider>
              </ThemeProvider>
            </LocaleProvider>
          </ServicesProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
