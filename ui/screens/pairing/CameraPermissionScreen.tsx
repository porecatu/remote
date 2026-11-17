// SPDX-License-Identifier: GPL-3.0-or-later
// The camera permission (anatomy §4.3.1; PRD-001 RF-1.4): why the app needs
// the camera, before the system prompt, and "Allow the camera". Denied with no
// way to ask again: the text says it was denied and the button opens the
// system settings. There is no typed-code alternative (RF-1.4).
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "@ui/components/Button";
import { Icon } from "@ui/components/Icon";
import { ScreenBar } from "@ui/components/ScreenBar";
import { useT } from "@ui/i18n/LocaleProvider";
import { spacing, typeStyle, useTheme } from "@ui/theme";

import { PairingFrame } from "./PairingFrame";

export type CameraPermissionScreenProps = {
  /** The system will not ask again: point to the system settings. */
  readonly denied: boolean;
  /** "Allow the camera": the system prompt. */
  readonly onAllow: () => void;
  /** "Open system settings". */
  readonly onOpenSettings: () => void;
  readonly onBack: () => void;
};

export function CameraPermissionScreen({ denied, onAllow, onOpenSettings, onBack }: CameraPermissionScreenProps) {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <PairingFrame testID="camera-permission">
      <ScreenBar
        title={t("common.pair_desktop")}
        back={{ onPress: onBack, accessibilityLabel: t("a11y.back") }}
        testID="camera-permission-bar"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Icon name="camera" role="state" color="textTertiary" testID="camera-permission-icon" />
        <Text style={[typeStyle("body"), styles.body, { color: colors.textSecondary }]}>
          {t(denied ? "pairing.camera_permission_denied" : "pairing.camera_permission_body")}
        </Text>
        <View>
          {denied ? (
            <Button
              label={t("common.open_system_settings")}
              onPress={onOpenSettings}
              width="wide"
              testID="camera-permission-settings"
            />
          ) : (
            <Button
              label={t("pairing.allow_camera")}
              onPress={onAllow}
              width="wide"
              testID="camera-permission-allow"
            />
          )}
        </View>
      </ScrollView>
    </PairingFrame>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.statePaddingX,
    rowGap: spacing.stateBlockGap,
  },
  body: {
    textAlign: "center",
  },
});
