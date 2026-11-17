// SPDX-License-Identifier: GPL-3.0-or-later
// Waiting for the confirmation, and the results (anatomy §4.3.4; PRD-001
// RF-1.8 to RF-1.11). Two phases on the same screen:
//
// 1. connecting: a spinner by the step running, "Connecting to the relay…"
//    then "Checking the desktop…";
// 2. waiting for the desktop (up to 120 s): "Confirm on Porecatu…", this
//    device's fingerprint to compare, the ring and the time left, announced
//    every 30 s and in the last 10 s.
//
// Cancel sits at the same place in both phases; it closes the channel and
// saves nothing, and so does leaving the screen while the attempt runs.
// Paired: "Paired with Home" for `duration.pair-success`, then the workspace
// of the desktop, in the session the pairing opened (the controller handed it
// to the registry). A failure shows its result screen (`describeFailure`).
import { useEffect, useRef } from "react";
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from "react-native";

import type { MessageKey } from "@/i18n/catalog";
import { Button } from "@ui/components/Button";
import { Icon } from "@ui/components/Icon";
import { ScreenBar } from "@ui/components/ScreenBar";
import { Spinner } from "@ui/components/Spinner";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { useServices } from "@ui/services/ServicesContext";
import { duration, icon, size, space, spacing, typeStyle, useTheme, type ColorToken } from "@ui/theme";

import { CountdownRing } from "./CountdownRing";
import { FingerprintCard } from "./FingerprintCard";
import { usePairingFlow } from "./PairingContext";
import { PairingFrame } from "./PairingFrame";
import { PairingResultView } from "./PairingResultView";
import { CONFIRM_WAIT_SECONDS, describeFailure, shouldAnnounceTimeLeft, type ResultAction } from "./pairingModel";
import { usePairingNavigation } from "./usePairingNavigation";

type StepStatus = "done" | "current" | "pending";

const STEP_COLOR: Record<StepStatus, ColorToken> = {
  done: "textSecondary",
  current: "textBody",
  pending: "textTertiary",
};

function StepLine({ label, status, testID }: { readonly label: string; readonly status: StepStatus; readonly testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.step} testID={testID}>
      <View style={styles.stepIndicator}>
        {status === "current" ? <Spinner testID={`${testID}-spinner`} /> : null}
        {status === "done" ? <Icon name="check" role="indicator" color="success" testID={`${testID}-done`} /> : null}
      </View>
      <Text style={[typeStyle("body"), styles.stepText, { color: colors[STEP_COLOR[status]] }]}>{label}</Text>
    </View>
  );
}

export function WaitScreen() {
  const { t, tn } = useT();
  const { colors } = useTheme();
  const services = useServices();
  const flow = usePairingFlow();
  const navigation = usePairingNavigation();
  const state = useStoreState(flow.controller.store, (current) => current);
  const memory = useStoreState(flow.memory, (current) => current);

  // Leaving while the attempt runs (system back) cancels it.
  useEffect(
    () => () => {
      if (flow.controller.store.getState().active) {
        flow.cancel();
      }
    },
    [flow],
  );

  // Paired: the success for a moment, then the workspace (RF-1.10).
  const pairedId = state.pairedDesktopId;
  useEffect(() => {
    if (pairedId === null) {
      return;
    }
    services.haptics.notify("success");
    const timer = services.scheduler.set(() => navigation.toDesktop(pairedId), duration.pairSuccess);
    return () => services.scheduler.clear(timer);
  }, [navigation, pairedId, services]);

  const failure = state.failure;
  useEffect(() => {
    if (failure !== null) {
      services.haptics.notify("error");
    }
  }, [failure, services]);

  // The time left, for the screen reader: every 30 s and the last 10 s.
  const secondsLeft = state.confirmSecondsLeft;
  const announced = useRef<number | null>(null);
  useEffect(() => {
    if (secondsLeft === null || announced.current === secondsLeft || !shouldAnnounceTimeLeft(secondsLeft)) {
      return;
    }
    announced.current = secondsLeft;
    AccessibilityInfo.announceForAccessibilityWithOptions(tn("pairing.seconds_left", secondsLeft), { queue: true });
  }, [secondsLeft, tn]);

  const name = state.hostName ?? memory.desktopName;
  const title = name === null ? t("common.pair_desktop") : t("pairing.title_with", { name });

  const cancel = (): void => {
    flow.cancel();
    navigation.leave();
  };
  const onAction = (action: ResultAction): void => {
    switch (action) {
      case "retry":
        flow.retry();
        return;
      case "scan-another":
        navigation.toScan();
        return;
      case "close":
        navigation.leave();
        return;
    }
  };

  // The `x` cancels while the attempt runs and closes once it ended (§4.3.4).
  const bar = (
    <ScreenBar
      title={title}
      close={{
        onPress: state.active ? cancel : navigation.leave,
        accessibilityLabel: state.active ? t("common.cancel") : t("common.close"),
      }}
      testID="wait-bar"
    />
  );

  if (state.step === "paired") {
    return (
      <PairingFrame testID="wait">
        {bar}
        <PairingResultView result={{ kind: "paired", name: state.hostName ?? "" }} />
      </PairingFrame>
    );
  }

  if (state.step === "failed" && failure !== null) {
    const view = describeFailure(failure, {
      failedFrom: memory.failedFrom,
      relayHost: memory.relayHost,
      canRetry: memory.canRetry,
    });
    return (
      <PairingFrame testID="wait">
        {bar}
        <PairingResultView result={{ kind: "failed", view }} onAction={onAction} />
      </PairingFrame>
    );
  }

  if (!state.active) {
    // Cancelled: the screen is on its way out.
    return <PairingFrame testID="wait">{bar}</PairingFrame>;
  }

  const waiting = state.step === "awaiting-confirmation" || state.step === "saving";
  const steps: readonly { key: MessageKey; status: StepStatus; id: string }[] = [
    { key: "pairing.connecting_relay", status: state.step === "connecting" ? "current" : "done", id: "relay" },
    { key: "pairing.verifying_desktop", status: state.step === "connecting" ? "pending" : "current", id: "desktop" },
  ];

  return (
    <PairingFrame testID="wait">
      {bar}
      <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
        {waiting ? (
          <View style={styles.phase} testID="wait-confirmation">
            <Text style={[typeStyle("body"), styles.centered, { color: colors.textBody }]}>
              {t("pairing.waiting_for_desktop")}
            </Text>
            <Text style={[typeStyle("body"), styles.centered, { color: colors.textSecondary }]}>
              {t("pairing.compare_fingerprint")}
            </Text>
            <FingerprintCard fingerprint={state.deviceFingerprint} />
            <CountdownRing secondsLeft={secondsLeft ?? (state.step === "saving" ? 0 : CONFIRM_WAIT_SECONDS)} />
          </View>
        ) : (
          <View style={styles.phase} testID="wait-connecting">
            {steps.map((step) => (
              <StepLine key={step.id} label={t(step.key)} status={step.status} testID={`wait-step-${step.id}`} />
            ))}
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={t("common.cancel")}
          variant="secondary"
          width="full"
          onPress={cancel}
          disabled={state.step === "saving"}
          testID="wait-cancel"
        />
      </View>
    </PairingFrame>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: size.gutter,
  },
  phase: {
    rowGap: spacing.stateBlockGap,
  },
  centered: {
    textAlign: "center",
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: space.s,
  },
  stepIndicator: {
    width: icon.indicator.size,
    alignItems: "center",
  },
  stepText: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: size.gutter,
    paddingVertical: spacing.formGap,
  },
});
