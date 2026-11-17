// SPDX-License-Identifier: GPL-3.0-or-later
// The lock screen (anatomy §4.1, PRD-001 RF-1.17 to RF-1.19): `bg.base`, the
// app name, "Locked" and the "Unlock" button (`button.height`, `lock.button`
// wide). The system prompt opens on its own when the screen appears (the app
// shell does it, src/controllers/appShell.ts); the button tries again. After a
// cancelled or refused attempt the screen says so; after a lockout of the
// system it says to use the device passcode, and the button opens the system
// flow again (the system decides which). No counter of attempts: the system
// limits them. No app icon yet (it does not exist).
//
// - No back: the Android back button sends the app to the background instead
//   of reaching the navigator or an overlay under the lock.
// - The screen reader starts on the button, labelled "Unlock the app"; the
//   failure line is a polite live region.
import { type ComponentRef, useEffect, useRef } from "react";
import { AccessibilityInfo, BackHandler, type Pressable, StyleSheet, Text, View } from "react-native";

import type { AuthFailure } from "@/security/authenticate";
import type { MessageKey } from "@/i18n/catalog";
import { Button } from "@ui/components/Button";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { useOverlayActive } from "@ui/overlay";
import { useServices } from "@ui/services/ServicesContext";
import { spacing, typeStyle, useTheme } from "@ui/theme";

/** The line under "Locked" for the last failed attempt; null while there is none. */
export function failureMessageKey(failure: AuthFailure | null): MessageKey | null {
  switch (failure) {
    case null:
      return null;
    case "lockout":
      return "app_lock.lockout";
    case "cancelled":
    case "failed":
      return "app_lock.authentication_failed";
  }
}

type LockScreenProps = {
  readonly testID?: string;
};

/** The full-screen lock of the app; the root shows it while the shell is locked. */
export function LockScreen({ testID = "lock-screen" }: LockScreenProps) {
  const { appShell } = useServices();
  const { t } = useT();
  const { colors } = useTheme();
  const failure = useStoreState(appShell.store, (state) => state.lastFailure);
  const overlayActive = useOverlayActive();
  const buttonRef = useRef<ComponentRef<typeof Pressable>>(null);

  // The screen reader starts on the button (§4.1).
  useEffect(() => {
    const button = buttonRef.current;
    if (button !== null) {
      AccessibilityInfo.sendAccessibilityEvent(button, "focus");
    }
  }, []);

  // No back (§4.1): the app goes to the background. The overlay layer listens
  // only while an overlay is open, and the latest listener runs first, so the
  // lock subscribes again after it.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      BackHandler.exitApp();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [overlayActive]);

  const failureKey = failureMessageKey(failure);
  const unlock = (): void => {
    void appShell.unlock();
  };

  return (
    <View
      testID={testID}
      accessibilityViewIsModal
      style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: colors.bgBase }]}
    >
      <View style={styles.text}>
        <Text
          accessibilityRole="header"
          style={[typeStyle("screenTitle"), styles.centered, { color: colors.textTitle }]}
        >
          {t("common.app_name")}
        </Text>
        <Text style={[typeStyle("body"), styles.centered, { color: colors.textSecondary }]}>
          {t("app_lock.locked")}
        </Text>
        {failureKey === null ? null : (
          <Text
            testID={`${testID}-failure`}
            accessibilityLiveRegion="polite"
            style={[typeStyle("body"), styles.centered, { color: colors.textSecondary }]}
          >
            {t(failureKey)}
          </Text>
        )}
      </View>
      <Button
        ref={buttonRef}
        label={t("app_lock.unlock")}
        accessibilityLabel={t("app_lock.unlock_a11y")}
        onPress={unlock}
        width="lock"
        testID={`${testID}-unlock`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.statePaddingX,
    rowGap: spacing.stateBlockGap,
  },
  text: {
    alignItems: "center",
    rowGap: spacing.stateGap,
  },
  centered: {
    textAlign: "center",
  },
});
