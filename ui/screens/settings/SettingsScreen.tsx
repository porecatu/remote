// SPDX-License-Identifier: GPL-3.0-or-later
// Settings (anatomy §4.4.1; PRD-001 RF-1.17, RF-1.18, RF-1.20; PRD-003
// RF-3.23; ADR-0005): rows in cards under section labels.
// - Device: "This device", which opens §4.4.2.
// - Security: the app lock switch. Turning it off asks for the unlock and
//   changes only if it passes (none is asked on a device that cannot
//   authenticate, RF-1.20); turning it on asks for nothing. The app shell
//   decides (`setLockEnabled`); the switch shows what it holds.
// - Terminal: "Vibrate on bell". The platform gives no way to know whether
//   the device vibrates, so the row is always there.
// - Language: the current choice; the row opens the language sheet.
// - About the app: version and license.
// There is no theme option: the chrome follows the system (RF-2.13).
import { useRouter } from "expo-router";
import { useRef } from "react";
import { ScrollView, StyleSheet, Text, View, type HostInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LanguageSetting } from "@/storage/settings";
import { Card, Icon, ListRow, ScreenBar, SectionLabel, SwitchRow } from "@ui/components";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { useOverlay } from "@ui/overlay";
import { useServices } from "@ui/services/ServicesContext";
import { spacing, typeStyle, useTheme } from "@ui/theme";

import { LanguageSheet } from "./LanguageSheet";

/** The route of "This device". */
export const DEVICE_ROUTE = "/settings/device";

export function SettingsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const overlay = useOverlay();
  const { settings, appShell, appVersion } = useServices();
  const appLock = useStoreState(appShell.store, (state) => state.lock.appLock);
  const authenticating = useStoreState(appShell.store, (state) => state.authenticating);
  const bellVibration = useStoreState(settings.store, (state) => state.settings.bellVibration);
  const language = useStoreState(settings.store, (state) => state.settings.language);
  /** The language row: the sheet gives the focus back to it (§5). */
  const languageRow = useRef<HostInstance>(null);

  const saveFailed = () => {
    overlay.showToast(t("settings.save_failed"), { severity: "error" });
  };

  const setAppLock = (next: boolean) => {
    // A failed save is reverted by the shell; a cancelled prompt changes nothing.
    void appShell.setLockEnabled(next);
  };

  const setBellVibration = (next: boolean) => {
    settings.update({ bellVibration: next }).catch(saveFailed);
  };

  const chooseLanguage = (next: LanguageSetting) => {
    settings.update({ language: next }).catch(saveFailed);
  };

  const openLanguage = () => {
    overlay.openSheet(
      ({ close }) => (
        <LanguageSheet
          onChoose={(next) => {
            chooseLanguage(next);
            close();
          }}
        />
      ),
      { origin: languageRow },
    );
  };

  const languageValue = language === "system" ? t("language.system_short") : t(`language.${language}`);
  const languageTitle = t("settings.language");
  const chevron = <Icon name="chevron-right" role="chevron" color="textSecondary" />;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgBase }]} testID="settings-screen">
      <View style={{ paddingTop: insets.top, backgroundColor: colors.bgBar }}>
        <ScreenBar
          title={t("common.settings")}
          back={{ onPress: () => router.back(), accessibilityLabel: t("a11y.back") }}
          testID="settings-bar"
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
        <SectionLabel label={t("settings.section_device")} first />
        <View style={styles.block}>
          <Card>
            <ListRow
              title={t("device.title")}
              titleVariant="body"
              accessibilityLabel={t("device.title")}
              trailing={chevron}
              onPress={() => router.push(DEVICE_ROUTE)}
              testID="settings-device"
            />
          </Card>
        </View>

        <SectionLabel label={t("settings.section_security")} />
        <View style={styles.block}>
          <Card>
            <SwitchRow
              title={t("settings.app_lock")}
              description={t("settings.app_lock_description")}
              value={appLock}
              onValueChange={setAppLock}
              disabled={authenticating}
              testID="settings-app-lock"
            />
          </Card>
        </View>

        <SectionLabel label={t("settings.section_terminal")} />
        <View style={styles.block}>
          <Card>
            <SwitchRow
              title={t("settings.bell_vibration")}
              description={t("settings.bell_vibration_description")}
              value={bellVibration}
              onValueChange={setBellVibration}
              testID="settings-bell-vibration"
            />
          </Card>
        </View>

        <SectionLabel label={t("settings.section_language")} />
        <View style={styles.block}>
          <Card>
            <ListRow
              ref={languageRow}
              title={languageTitle}
              titleVariant="body"
              titleEnd={
                <Text numberOfLines={1} style={[typeStyle("secondary"), { color: colors.textSecondary }]}>
                  {languageValue}
                </Text>
              }
              accessibilityLabel={t("a11y.label_value", { label: languageTitle, value: languageValue })}
              trailing={chevron}
              onPress={openLanguage}
              testID="settings-language"
            />
          </Card>
        </View>

        <SectionLabel label={t("settings.section_about")} />
        <Text
          style={[typeStyle("secondary"), styles.about, { color: colors.textSecondary }]}
          testID="settings-version"
        >
          {t("settings.version", { version: appVersion })}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  block: {
    paddingHorizontal: spacing.listPadding,
  },
  about: {
    paddingHorizontal: spacing.sectionPaddingX,
  },
});
