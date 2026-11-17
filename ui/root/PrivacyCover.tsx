// SPDX-License-Identifier: GPL-3.0-or-later
// The privacy cover of the app switcher (anatomy §4.1, PRD-001 RF-1.19): while
// the app is not `active`, a neutral `bg.base` screen covers everything, lock
// or no lock, so the system snapshot shows no desktop, tab or grid. It is the
// highest layer of the root (ADR-0011), above the overlays and the lock
// screen. No app icon yet: only the background (the app icon does not exist).
import { StyleSheet, View } from "react-native";

import { useTheme } from "@ui/theme";

type PrivacyCoverProps = {
  readonly testID?: string;
};

/** A plain `bg.base` screen over the whole app. */
export function PrivacyCover({ testID = "privacy-cover" }: PrivacyCoverProps) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      pointerEvents="auto"
      accessibilityViewIsModal
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgBase }]}
    />
  );
}
