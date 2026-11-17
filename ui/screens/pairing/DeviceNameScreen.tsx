// SPDX-License-Identifier: GPL-3.0-or-later
// The device name (anatomy §4.3.3; PRD-001 RF-1.7): the desktop the code
// names (`monitor`, its name in 16/500 and the relay host in mono 13), and
// the name of this device, pre-filled (the last pairing's, or the phone
// model), up to 64 characters, with the counter from 48. Empty disables
// "Connect", which stays above the keyboard. Back (the arrow or the system's)
// drops the code read: the single-use token is only spent on connecting.
//
// A link that brought an unusable code (RF-1.5, RF-1.6) shows here why, with
// "Scan another code" and "Close".
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import type { PairingInvite } from "@/protocol";
import { DEVICE_NAME_MAX_BYTES } from "@/protocol";
import { normalizeDeviceName } from "@/pairing/pairingFlow";
import { Button } from "@ui/components/Button";
import { Icon } from "@ui/components/Icon";
import { ScreenBar } from "@ui/components/ScreenBar";
import { TextField } from "@ui/components/TextField";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { size, spacing, typeStyle, useTheme } from "@ui/theme";

import { usePairingFlow } from "./PairingContext";
import { PairingFrame } from "./PairingFrame";
import { PairingResultView } from "./PairingResultView";
import { describeFailure, relayHostOf } from "./pairingModel";
import { usePairingNavigation } from "./usePairingNavigation";

/** Maximum length of the field (RF-1.7); the flow also cuts at 64 UTF-8 bytes. */
const NAME_MAX_LENGTH = DEVICE_NAME_MAX_BYTES;
/** The counter shows from this length (§4.3.3). */
const NAME_COUNTER_FROM = 48;

export function DeviceNameScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const flow = usePairingFlow();
  const navigation = usePairingNavigation();
  const state = useStoreState(flow.controller.store, (current) => current);
  const memory = useStoreState(flow.memory, (current) => current);

  const invite: PairingInvite | null = state.flow.step === "naming" ? state.flow.invite : null;
  const [name, setName] = useState(state.suggestedName ?? "");
  // A new code (a link while on this screen) starts from its suggested name.
  const inviteRef = useRef(invite);
  useEffect(() => {
    if (invite !== null && invite !== inviteRef.current) {
      setName(state.suggestedName ?? "");
    }
    inviteRef.current = invite;
  }, [invite, state.suggestedName]);

  // Leaving while the name is asked (back) drops the code; after "Connect"
  // the wait owns the attempt.
  useEffect(
    () => () => {
      if (flow.controller.store.getState().step === "naming") {
        flow.cancel();
      }
    },
    [flow],
  );

  const back = { onPress: navigation.back, accessibilityLabel: t("a11y.back") };
  const bar = <ScreenBar title={t("common.pair_desktop")} back={back} testID="device-name-bar" />;

  if (state.step === "failed" && state.failure !== null) {
    const view = describeFailure(state.failure, {
      failedFrom: memory.failedFrom,
      relayHost: memory.relayHost,
      canRetry: false,
    });
    return (
      <PairingFrame testID="device-name">
        {bar}
        <PairingResultView
          result={{ kind: "failed", view }}
          onAction={(action) => (action === "scan-another" ? navigation.toScan() : navigation.leave())}
        />
      </PairingFrame>
    );
  }

  if (invite === null) {
    // The link is on its way (or the flow was left): only the bar.
    return <PairingFrame testID="device-name">{bar}</PairingFrame>;
  }

  const empty = normalizeDeviceName(name) === "";
  const submit = (): void => {
    if (empty) {
      return;
    }
    flow.submitName(name);
    if (flow.controller.store.getState().step !== "naming") {
      navigation.toWait();
    }
  };

  const relayHost = relayHostOf(invite.relayUrl);
  const desktopLabel = [t("pairing.desktop_label"), invite.hostName, relayHost].join(t("a11y.separator"));

  return (
    <PairingFrame testID="device-name">
      {bar}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View accessible accessibilityLabel={desktopLabel} style={styles.desktop} testID="device-name-desktop">
            <Icon name="monitor" role="row" color="textSecondary" />
            <View style={styles.desktopText}>
              <Text style={[typeStyle("secondary"), { color: colors.textSecondary }]}>
                {t("pairing.desktop_label")}
              </Text>
              <Text style={[typeStyle("rowTitle"), { color: colors.textTitle }]} testID="device-name-host-name">
                {invite.hostName}
              </Text>
              <Text style={[typeStyle("monoBody"), { color: colors.textSecondary }]} testID="device-name-relay">
                {relayHost}
              </Text>
            </View>
          </View>
          <TextField
            label={t("pairing.device_name_label")}
            value={name}
            onChangeText={setName}
            helper={t("pairing.device_name_hint")}
            maxLength={NAME_MAX_LENGTH}
            counterThreshold={NAME_COUNTER_FROM}
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={submit}
            testID="device-name-field"
          />
        </ScrollView>
        <View style={styles.footer}>
          <Button
            label={t("pairing.connect")}
            onPress={submit}
            disabled={empty}
            width="full"
            testID="device-name-connect"
          />
        </View>
      </KeyboardAvoidingView>
    </PairingFrame>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    padding: size.gutter,
    rowGap: spacing.sectionPaddingTop,
  },
  desktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    columnGap: spacing.rowIconGap,
  },
  desktopText: {
    flex: 1,
    minWidth: 0,
  },
  footer: {
    paddingHorizontal: size.gutter,
    paddingVertical: spacing.formGap,
  },
});
