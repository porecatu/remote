// SPDX-License-Identifier: GPL-3.0-or-later
// The camera (anatomy §4.3.2; PRD-001 RF-1.4, RF-1.6): full screen and always
// dark, whatever the system mode, with the camera behind. A translucent bar
// on top with the close (`x`) and the torch; a 260 frame with `accent`
// corners, the picture darkened (`bg.scrim`) around it; the instruction below.
//
// The first code read locks the reading: nothing else is read while it is
// handled. A valid code goes on to the device name; an invalid one turns the
// frame red for `duration.qr-invalid` and then opens the error sheet, and the
// reading resumes only when the sheet closes. A camera that will not start
// (in use by another app, or none) gives the `camera-off` state screen. The
// screen reader hears "Looking for the QR code…" and, on a read, "Code read".
import { CameraView, type BarcodeScanningResult } from "expo-camera";
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MessageKey } from "@/i18n/catalog";
import { pairingUriErrorKey } from "@/i18n/protocolMessages";
import { Button } from "@ui/components/Button";
import { IconButton } from "@ui/components/IconButton";
import { StateView } from "@ui/components/StateView";
import { useT } from "@ui/i18n/LocaleProvider";
import { useOverlay } from "@ui/overlay/useOverlay";
import { useServices } from "@ui/services/ServicesContext";
import { ThemeProvider, duration, size, space, spacing, typeStyle, useTheme } from "@ui/theme";

import { usePairingFlow } from "./PairingContext";
import { QrErrorSheet } from "./QrErrorSheet";

export type ScanScreenProps = {
  /** The `x`: leaves the camera. */
  readonly onClose: () => void;
  /** A valid code was read: on to the device name. */
  readonly onCodeRead: () => void;
};

/** The QR camera, always in the dark mode (§4.3.2). */
export function ScanScreen(props: ScanScreenProps) {
  return (
    <ThemeProvider scheme="dark">
      <ScanContent {...props} />
    </ThemeProvider>
  );
}

type CornerPosition = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

const CORNERS: readonly CornerPosition[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];

function Corner({ position, color }: { readonly position: CornerPosition; readonly color: string }) {
  const top = position === "topLeft" || position === "topRight";
  const left = position === "topLeft" || position === "bottomLeft";
  return (
    <View
      testID={`scan-corner-${position}`}
      style={{
        position: "absolute",
        width: size.cameraCornerLength,
        height: size.cameraCornerLength,
        borderColor: color,
        ...(top ? { top: 0, borderTopWidth: size.cameraCornerWidth } : { bottom: 0, borderBottomWidth: size.cameraCornerWidth }),
        ...(left ? { left: 0, borderLeftWidth: size.cameraCornerWidth } : { right: 0, borderRightWidth: size.cameraCornerWidth }),
      }}
    />
  );
}

function ScanContent({ onClose, onCodeRead }: ScanScreenProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const services = useServices();
  const overlay = useOverlay();
  const flow = usePairingFlow();
  const focused = useIsFocused();

  const [torch, setTorch] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  // The lock: a ref, so a second event in the same frame is dropped, and a
  // state, so the camera stops reporting codes.
  const lockedRef = useRef(false);
  const [locked, setLocked] = useState(false);
  const sheetRef = useRef<string | null>(null);
  const timerRef = useRef<unknown>(null);

  const scanningText = t("pairing.scanning");

  const lock = useCallback((value: boolean) => {
    lockedRef.current = value;
    setLocked(value);
  }, []);

  // Back on the camera (from the name screen): read again, and say so.
  useEffect(() => {
    if (!focused || unavailable) {
      return;
    }
    if (sheetRef.current === null && timerRef.current === null) {
      lock(false);
    }
    AccessibilityInfo.announceForAccessibility(scanningText);
  }, [focused, unavailable, lock, scanningText]);

  // Leaving the screen closes the sheet and stops the red frame.
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        services.scheduler.clear(timerRef.current);
        timerRef.current = null;
      }
      if (sheetRef.current !== null) {
        overlay.close(sheetRef.current);
        sheetRef.current = null;
      }
    },
    [overlay, services],
  );

  const showInvalid = useCallback(
    (reason: MessageKey) => {
      setInvalid(true);
      timerRef.current = services.scheduler.set(() => {
        timerRef.current = null;
        setInvalid(false);
        sheetRef.current = overlay.openSheet(
          ({ close }) => <QrErrorSheet reason={reason} onScanAgain={close} />,
          {
            onClose: () => {
              sheetRef.current = null;
              lock(false);
              AccessibilityInfo.announceForAccessibility(scanningText);
            },
          },
        );
      }, duration.qrInvalid);
    },
    [lock, overlay, scanningText, services],
  );

  const onScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (lockedRef.current) {
        return;
      }
      lock(true);
      AccessibilityInfo.announceForAccessibility(t("pairing.scanned"));
      flow.readUri(result.data);
      const state = flow.controller.store.getState();
      if (state.step === "naming") {
        onCodeRead();
        return;
      }
      if (state.failure?.kind === "uri") {
        showInvalid(pairingUriErrorKey(state.failure.error, state.failure.field));
        return;
      }
      lock(false);
    },
    [flow, lock, onCodeRead, showInvalid, t],
  );

  const bar = (
    <View
      style={[
        styles.bar,
        { top: insets.top, left: insets.left, right: insets.right },
      ]}
    >
      <IconButton
        icon="x"
        color="onCamera"
        accessibilityLabel={t("common.close")}
        onPress={onClose}
        testID="scan-close"
      />
      {unavailable ? null : (
        <IconButton
          icon="flashlight"
          color="onCamera"
          accessibilityLabel={t("pairing.torch")}
          selected={torch}
          onPress={() => setTorch((on) => !on)}
          testID="scan-torch"
        />
      )}
    </View>
  );

  if (unavailable) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bgBase, paddingTop: insets.top + size.barHeight }]} testID="scan">
        <StateView
          icon="camera-off"
          title={t("pairing.camera_unavailable_title")}
          body={t("pairing.camera_busy")}
          actions={<Button label={t("common.close")} onPress={onClose} width="wide" testID="scan-unavailable-close" />}
          testID="scan-unavailable"
        />
        {bar}
      </View>
    );
  }

  const cornerColor = invalid ? colors.error : colors.accent;
  const scrim = { backgroundColor: colors.bgScrim };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgBase }]} testID="scan">
      {focused ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          {...(locked ? {} : { onBarcodeScanned: onScanned })}
          enableTorch={torch}
          onMountError={() => setUnavailable(true)}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          testID="scan-camera"
        />
      ) : null}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[styles.fill, scrim]} />
        <View style={styles.frameRow}>
          <View style={[styles.fill, scrim]} />
          <View style={styles.frame} testID="scan-frame">
            {CORNERS.map((position) => (
              <Corner key={position} position={position} color={cornerColor} />
            ))}
          </View>
          <View style={[styles.fill, scrim]} />
        </View>
        <View style={[styles.fill, scrim, styles.below]}>
          <Text style={[typeStyle("body"), styles.instruction, { color: colors.onCamera }]}>
            {t("pairing.scan_instruction")}
          </Text>
        </View>
      </View>
      {bar}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  bar: {
    position: "absolute",
    height: size.barHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.barPaddingX,
  },
  fill: {
    flex: 1,
  },
  frameRow: {
    flexDirection: "row",
    height: size.cameraFrame,
  },
  frame: {
    width: size.cameraFrame,
    height: size.cameraFrame,
  },
  below: {
    alignItems: "center",
    paddingTop: space.l,
    paddingHorizontal: size.gutter,
  },
  instruction: {
    textAlign: "center",
  },
});
