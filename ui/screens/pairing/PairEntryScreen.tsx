// SPDX-License-Identifier: GPL-3.0-or-later
// The first screen of the pairing (`app/pair/index.tsx`, anatomy §4.3.1 and
// §4.3.2): the camera permission while it is not given, then the camera. The
// permission is read again when the app comes back to the foreground, so
// allowing the camera in the system settings opens the camera right away.
import { useCameraPermissions } from "expo-camera";
import { useEffect } from "react";
import { AppState, Linking, View } from "react-native";

import { useTheme } from "@ui/theme";

import { CameraPermissionScreen } from "./CameraPermissionScreen";
import { ScanScreen } from "./ScanScreen";
import { usePairingNavigation } from "./usePairingNavigation";

export function PairEntryScreen() {
  const navigation = usePairingNavigation();
  const { colors } = useTheme();
  const [permission, requestPermission, getPermission] = useCameraPermissions();

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void getPermission();
      }
    });
    return () => subscription.remove();
  }, [getPermission]);

  if (permission === null) {
    // The first read of the permission: an empty screen for a moment.
    return <View style={{ flex: 1, backgroundColor: colors.bgBase }} testID="pair-entry-loading" />;
  }

  if (!permission.granted) {
    return (
      <CameraPermissionScreen
        denied={!permission.canAskAgain}
        onAllow={() => {
          void requestPermission();
        }}
        onOpenSettings={() => {
          void Linking.openSettings();
        }}
        onBack={navigation.back}
      />
    );
  }

  return <ScanScreen onClose={navigation.back} onCodeRead={navigation.toName} />;
}
