// SPDX-License-Identifier: GPL-3.0-or-later
// The body of the workspace before the tree (anatomy §4.5.1; PRD-002 RF-2.1
// to RF-2.3): the spinner with the current step in words ("Connecting…",
// "Authenticating…", "Loading the workspace…"), and the state screens of the
// failures on the way in:
// - `incompatible` (RF-2.2): `refresh-cw`, which side must be updated and the
//   protocol version of each side, "Back to the list";
// - offline (`host-unavailable`): `monitor-off`, "<name> is offline." and
//   "Try again";
// - not paired (RF-2.3): `shield-off`, the explanation and "Pair again";
// - relay unreachable, retries run out: the reason and "Try again";
// - protocol error, invalid stored data: the reason and "Back to the list".
// The bar (name and back) is the screen's; back always leaves to the list.
import { StyleSheet, Text, View } from "react-native";

import type { Translator } from "@/i18n/catalog";
import { PROTOCOL_VERSION, type Version } from "@/protocol";
import type { LifecycleSnapshot } from "@/session/lifecycle";
import { Button, Spinner, StateView, type IconName } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { spacing, typeStyle, useTheme, type ColorToken } from "@ui/theme";

/** The step of the connection in words (§4.5.1). */
export type ConnectingStep = "connecting" | "authenticating" | "loading";

/** The step a snapshot is at, before the tree is shown. */
export function connectingStep(connection: LifecycleSnapshot): ConnectingStep {
  switch (connection.state) {
    case "handshaking":
      return "authenticating";
    case "greeting":
    case "ready":
      return "loading";
    default:
      return "connecting";
  }
}

/** A failure on the way in, shown as a state screen (§4.5.1). */
export type EntryFailure =
  | {
      readonly kind: "incompatible";
      /** The side that must be updated. */
      readonly update: "app" | "desktop";
      readonly hostVersion: Version | null;
    }
  | { readonly kind: "offline" }
  | { readonly kind: "not-paired" }
  | { readonly kind: "unreachable" }
  | { readonly kind: "gave-up" }
  | { readonly kind: "protocol" }
  | { readonly kind: "invalid-desktop" };

/** -1, 0 or 1 as `a` is older than, the same as or newer than `b`. */
function compareVersions(a: Version, b: Version): number {
  const [aMajor, aMinor] = a;
  const [bMajor, bMinor] = b;
  if (aMajor !== bMajor) {
    return aMajor < bMajor ? -1 : 1;
  }
  return aMinor === bMinor ? 0 : aMinor < bMinor ? -1 : 1;
}

/** "0.1": a protocol version as the state screen prints it. */
export function formatVersion(version: Version): string {
  return `${version[0]}.${version[1]}`;
}

/**
 * The failure a snapshot shows as a state screen, or null. `shown`: the tree
 * was already shown in this visit; `hasTree`: there is a tree to keep on
 * screen. The ends that leave the desktop (`goodbye`, and `not-paired` after
 * the tree) are the scope's (`leaveNotice`), and the ones the user or the app
 * caused (`user`, `background`) are not failures.
 */
export function entryFailure(connection: LifecycleSnapshot, shown: boolean, hasTree: boolean): EntryFailure | null {
  if (connection.state !== "closed" && connection.state !== "failed") {
    return null;
  }
  const end = connection.end;
  switch (end?.reason) {
    case "incompatible": {
      const host = end.hostVersion;
      // The desktop speaks a newer protocol than the app: the app is the old side.
      const update = host !== null && compareVersions(host, PROTOCOL_VERSION) > 0 ? "app" : "desktop";
      return { kind: "incompatible", update, hostVersion: host };
    }
    case "offline":
      return { kind: "offline" };
    case "not-paired":
      return shown ? null : { kind: "not-paired" };
    case "unreachable":
      return { kind: "unreachable" };
    case "retries-exhausted":
      // With the tree on screen the band offers "Try again" instead.
      return shown && hasTree ? null : { kind: "gave-up" };
    case "protocol":
      return { kind: "protocol" };
    case "invalid-desktop":
      return { kind: "invalid-desktop" };
    default:
      return null;
  }
}

const STEP_KEYS = {
  connecting: "connection.connecting",
  authenticating: "connection.authenticating",
  loading: "connection.loading_workspace",
} as const;

export type ConnectingViewProps = {
  readonly step: ConnectingStep;
  readonly testID?: string;
};

/** The spinner with the step of the connection, centered. */
export function ConnectingView({ step, testID = "workspace-connecting" }: ConnectingViewProps) {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <View style={styles.connecting} testID={testID}>
      <Spinner testID={`${testID}-spinner`} />
      <Text
        accessibilityLiveRegion="polite"
        style={[typeStyle("body"), styles.centered, { color: colors.textSecondary }]}
        testID={`${testID}-step`}
      >
        {t(STEP_KEYS[step])}
      </Text>
    </View>
  );
}

type StateLook = {
  readonly icon: IconName;
  readonly iconColor?: ColorToken;
  readonly title: string;
  readonly body?: string;
  readonly action: "retry" | "pair-again" | "back";
};

function stateLook(failure: EntryFailure, name: string, relayHost: string, tr: Pick<Translator, "t">): StateLook {
  const { t } = tr;
  switch (failure.kind) {
    case "incompatible": {
      const lines = [t("incompatible.app_version", { version: formatVersion(PROTOCOL_VERSION) })];
      if (failure.hostVersion !== null) {
        lines.push(t("incompatible.desktop_version", { version: formatVersion(failure.hostVersion) }));
      }
      return {
        icon: "refresh-cw",
        title: t(failure.update === "app" ? "incompatible.app_too_old" : "incompatible.desktop_too_old"),
        body: lines.join("\n"),
        action: "back",
      };
    }
    case "offline":
      return { icon: "monitor-off", title: t("workspace.offline", { name }), action: "retry" };
    case "not-paired":
      return { icon: "shield-off", iconColor: "warning", title: t("workspace.not_paired", { name }), action: "pair-again" };
    case "unreachable":
      return {
        icon: "triangle-alert",
        iconColor: "warning",
        title: t("connection.relay_unreachable", { host: relayHost }),
        action: "retry",
      };
    case "gave-up":
      return { icon: "wifi-off", iconColor: "warning", title: t("connection.gave_up"), action: "retry" };
    case "protocol":
      return { icon: "triangle-alert", iconColor: "warning", title: t("error.protocol"), action: "back" };
    case "invalid-desktop":
      return { icon: "triangle-alert", iconColor: "warning", title: t("workspace.invalid_desktop"), action: "back" };
  }
}

export type EntryFailureViewProps = {
  readonly failure: EntryFailure;
  /** The desktop's name, as the list shows it. */
  readonly name: string;
  /** The host of the relay URL, for "relay unreachable". */
  readonly relayHost: string;
  readonly onRetry: () => void;
  readonly onPairAgain: () => void;
  readonly onLeave: () => void;
  readonly testID?: string;
};

/** The state screen of a failure on the way in. */
export function EntryFailureView({
  failure,
  name,
  relayHost,
  onRetry,
  onPairAgain,
  onLeave,
  testID = "workspace-failure",
}: EntryFailureViewProps) {
  const tr = useT();
  const look = stateLook(failure, name, relayHost, tr);
  const button =
    look.action === "retry" ? (
      <Button label={tr.t("common.retry")} width="wide" onPress={onRetry} testID={`${testID}-retry`} />
    ) : look.action === "pair-again" ? (
      <Button label={tr.t("common.pair_again")} width="wide" onPress={onPairAgain} testID={`${testID}-pair`} />
    ) : (
      <Button label={tr.t("connection.back_to_list")} width="wide" onPress={onLeave} testID={`${testID}-back`} />
    );
  return (
    <StateView
      icon={look.icon}
      {...(look.iconColor === undefined ? {} : { iconColor: look.iconColor })}
      title={look.title}
      {...(look.body === undefined ? {} : { body: look.body })}
      actions={button}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  connecting: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.statePaddingX,
    rowGap: spacing.stateGap,
  },
  centered: {
    textAlign: "center",
  },
});
