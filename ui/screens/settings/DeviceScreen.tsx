// SPDX-License-Identifier: GPL-3.0-or-later
// This device (anatomy §4.4.2; PRD-001 RF-1.1 to RF-1.3): the name and the
// fingerprint of the device key, read only, "Copy" and "Recreate identity".
// - The name is the one of the last completed pairing (`settings.deviceName`)
//   or, before the first, the phone model (`expo-device`).
// - The fingerprint (`ABCD EFGH IJKL MNOP`, spec 02 §1) in mono, read by the
//   screen reader character by character with a pause between the groups.
//   "Copy" copies only it: it is public. The private key never shows (RF-1.1).
// - "Recreate identity" (RF-1.3) asks for the unlock first when the app lock
//   is on (an irreversible action on a credential), then confirms in a dialog
//   with Cancel as the initial focus; after recreating, it goes back to the
//   desktop list.
// Each block is one element for the screen reader: label and value together.
import { useRouter } from "expo-router";
import { useRef } from "react";
import { ScrollView, StyleSheet, Text, View, type HostInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card, ScreenBar, SectionLabel } from "@ui/components";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { useOverlay } from "@ui/overlay";
import { useServices } from "@ui/services/ServicesContext";
import { spacing, typeStyle, useTheme } from "@ui/theme";

import { fingerprintCharacters } from "./fingerprintSpeech";
import { recreateIdentityDialog } from "./RecreateIdentityDialog";

/** Where the app goes after the identity is recreated: the desktop list. */
export const DESKTOPS_ROUTE = "/";

export function DeviceScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const overlay = useOverlay();
  const services = useServices();
  const { settings, appShell, status, authenticator, clipboard, deviceModel } = services;
  /** "Recreate identity": the dialog gives the focus back to it (§5). */
  const recreateButton = useRef<HostInstance>(null);
  const storedName = useStoreState(settings.store, (state) => state.settings.deviceName);
  const fingerprint = useStoreState(status, (state) => state.fingerprint);
  const recreating = useStoreState(status, (state) => state.recreating);
  const name = storedName ?? deviceModel;

  const copy = () => {
    if (fingerprint === null) {
      return;
    }
    clipboard.setString(fingerprint).then(
      () => {
        overlay.showToast(t("device.fingerprint_copied"));
      },
      () => undefined,
    );
  };

  const recreate = async () => {
    try {
      await services.recreateIdentity();
    } catch {
      overlay.showToast(t("device.recreate_failed"), { severity: "error" });
      return;
    }
    router.dismissTo(DESKTOPS_ROUTE);
  };

  const askToRecreate = async () => {
    const { lock } = appShell.store.getState();
    // On a device that cannot authenticate there is nothing to ask (RF-1.20).
    if (lock.appLock && lock.capability === "available") {
      let passed = false;
      try {
        passed = (await authenticator.authenticate({ promptMessage: t("device.recreate_reason") })).kind === "success";
      } catch {
        passed = false;
      }
      if (!passed) {
        return;
      }
    }
    overlay.openDialog(
      recreateIdentityDialog({
        t,
        origin: recreateButton,
        onConfirm: () => {
          void recreate();
        },
      }),
    );
  };

  const nameLabel = t("device.name_label");

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgBase }]} testID="device-screen">
      <View style={{ paddingTop: insets.top, backgroundColor: colors.bgBar }}>
        <ScreenBar
          title={t("device.title")}
          back={{ onPress: () => router.back(), accessibilityLabel: t("a11y.back") }}
          testID="device-bar"
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingTop: spacing.listPadding,
          paddingBottom: insets.bottom + spacing.listPadding,
        }}
      >
        {name === null ? null : (
          <View
            accessible
            accessibilityLabel={t("a11y.label_value", { label: nameLabel, value: name })}
            testID="device-name"
          >
            <SectionLabel label={nameLabel} first />
            <Text style={[typeStyle("body"), styles.value, { color: colors.textBody }]}>{name}</Text>
          </View>
        )}

        <View
          accessible
          accessibilityLabel={
            fingerprint === null
              ? t("device.fingerprint_label")
              : t("a11y.fingerprint", { characters: fingerprintCharacters(fingerprint, t("a11y.separator")) })
          }
          testID="device-fingerprint"
        >
          <SectionLabel label={t("device.fingerprint_label")} {...(name === null ? { first: true } : {})} />
          <View style={styles.block}>
            <Card padded>
              <Text style={[typeStyle("fingerprint"), { color: colors.textTitle }]}>{fingerprint ?? ""}</Text>
            </Card>
          </View>
        </View>

        <View style={[styles.block, styles.actions]}>
          <View style={styles.start}>
            <Button
              label={t("common.copy")}
              variant="secondary"
              onPress={copy}
              disabled={fingerprint === null}
              testID="device-copy"
            />
          </View>
          <Text style={[typeStyle("secondary"), { color: colors.textSecondary }]}>
            {t("device.fingerprint_hint")}
          </Text>
          <View style={[styles.start, styles.recreate]}>
            <Button
              ref={recreateButton}
              label={t("device.recreate")}
              variant="destructiveText"
              onPress={() => {
                void askToRecreate();
              }}
              loading={recreating}
              accessibilityHint={t("a11y.destructive")}
              testID="device-recreate"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  value: {
    paddingHorizontal: spacing.sectionPaddingX,
  },
  block: {
    paddingHorizontal: spacing.listPadding,
  },
  actions: {
    paddingTop: spacing.formGap,
    rowGap: spacing.formGap,
  },
  start: {
    alignSelf: "flex-start",
  },
  recreate: {
    paddingTop: spacing.sectionPaddingTop,
  },
});
