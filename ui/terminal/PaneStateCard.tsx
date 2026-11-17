// SPDX-License-Identifier: GPL-3.0-or-later
// What the terminal shows over the grid for a pane that is not `running`
// (anatomy §4.10; PRD-003 RF-3.18, RF-3.20 to RF-3.22). One state, one place:
//
// | State              | Where                     | Content                                         |
// |--------------------|---------------------------|-------------------------------------------------|
// | `not-started`      | central card              | `circle-dashed`, "This tab has not started.", Start (primary) |
// | `connecting`       | central card              | spinner, "Connecting…"                          |
// | `reconnecting`     | card at the top           | spinner, "Reconnecting…"; the grid dims to `opacity.read-only` |
// | `awaiting-desktop` | central card              | `monitor`, "Waiting for you at the computer" and why; no button (only the desktop answers, principle 5) |
// | `exited`           | bottom banner (key bar's place) | `circle-check` (0) or `circle-x` in `error`, "Exited with code N", Close tab (text button) |
// | `disconnected`     | bottom banner             | `unplug`, "Disconnected", Start when allowed     |
//
// The card is `bg.sheet`, `radius.card`, at most `state-card.max-width`, with
// `card.padding`; it never hides the final grid, which stays behind it. The
// banner is `bottom-banner.height`. No state takes input (§4.10).
//
// Data and callbacks only: `PaneStateCard` goes over the grid, `PaneStateBanner`
// in place of the key bar; `paneStatePresentation` tells the screen which one
// a state uses and whether the grid dims.
import { useRef, type ReactNode } from "react";
import { StyleSheet, Text, View, type HostInstance } from "react-native";

import { type PaneState, PaneState as PaneStates } from "@/protocol";
import { Button, Icon, Spinner, type IconName } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import type { FocusOrigin } from "@ui/overlay";
import { radius, size, spacing, typeStyle, useTheme, type ColorToken } from "@ui/theme";

/** Where the state of a pane is shown, and whether the grid behind dims. */
export type PaneStatePresentation = {
  readonly placement: "center" | "top" | "bottom";
  /** The grid dims to `opacity.read-only` (§4.10: `reconnecting`). */
  readonly dimGrid: boolean;
};

/** How a pane state is shown on the terminal; `null` for `running` (nothing over the grid). */
export function paneStatePresentation(state: PaneState | null): PaneStatePresentation | null {
  switch (state) {
    case null:
    case PaneStates.running:
      return null;
    case PaneStates.notStarted:
    case PaneStates.connecting:
    case PaneStates.awaitingDesktop:
      return { placement: "center", dimGrid: false };
    case PaneStates.reconnecting:
      return { placement: "top", dimGrid: true };
    case PaneStates.exited:
    case PaneStates.disconnected:
      return { placement: "bottom", dimGrid: false };
  }
}

export type PaneStateCardProps = {
  /** State of the pane on screen; the card exists for `not-started`, `connecting`, `reconnecting`, `awaiting-desktop`. */
  readonly state: PaneState | null;
  /** `start-pane` (RF-3.20); the Start button of `not-started`. */
  readonly onStart: () => void;
  /** The start awaits the desktop's answer: the button shows a spinner. */
  readonly starting?: boolean;
  /** Default `pane-state`; parts get `-start`, `-spinner`, `-icon`. */
  readonly testID?: string;
};

function CardFrame({
  placement,
  children,
  testID,
}: {
  readonly placement: "center" | "top";
  readonly children: ReactNode;
  readonly testID: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.frame, placement === "center" ? styles.frameCenter : styles.frameTop]}
      pointerEvents="box-none"
    >
      <View
        accessibilityLiveRegion="polite"
        testID={testID}
        style={[styles.card, { backgroundColor: colors.bgSheet, borderColor: colors.borderRow }]}
      >
        {children}
      </View>
    </View>
  );
}

/** The card over the grid for a pane that is starting, waiting or not started. */
export function PaneStateCard({ state, onStart, starting = false, testID = "pane-state" }: PaneStateCardProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const body = [typeStyle("body"), styles.centered, { color: colors.textBody }];

  switch (state) {
    case PaneStates.notStarted:
      return (
        <CardFrame placement="center" testID={testID}>
          <Icon name="circle-dashed" role="state" color="textTertiary" testID={`${testID}-icon`} />
          <Text style={body}>{t("pane_state_card.not_started")}</Text>
          <Button
            label={t("pane_state.start")}
            onPress={onStart}
            loading={starting}
            width="full"
            testID={`${testID}-start`}
          />
        </CardFrame>
      );
    case PaneStates.connecting:
    case PaneStates.reconnecting:
      return (
        <CardFrame placement={state === PaneStates.connecting ? "center" : "top"} testID={testID}>
          <View style={styles.inline}>
            <Spinner testID={`${testID}-spinner`} />
            <Text style={[typeStyle("body"), { color: colors.textBody }]}>
              {t(state === PaneStates.connecting ? "connection.connecting" : "connection.reconnecting")}
            </Text>
          </View>
        </CardFrame>
      );
    case PaneStates.awaitingDesktop:
      return (
        <CardFrame placement="center" testID={testID}>
          <Icon name="monitor" role="state" color="textTertiary" testID={`${testID}-icon`} />
          <Text
            accessibilityRole="header"
            style={[typeStyle("dialogTitle"), styles.centered, { color: colors.textTitle }]}
          >
            {t("pane_state_card.awaiting_desktop_title")}
          </Text>
          <Text style={[typeStyle("body"), styles.centered, { color: colors.textSecondary }]}>
            {t("pane_state.awaiting_desktop_hint")}
          </Text>
        </CardFrame>
      );
    default:
      return null;
  }
}

export type PaneStateBannerProps = {
  /** State of the pane on screen; the banner exists for `exited` and `disconnected`. */
  readonly state: PaneState | null;
  /** Exit code of an `exited` pane. */
  readonly exitCode: number | null;
  /** Close tab (`exited`); `origin` is the button, for the confirmation of a pinned tab (§5). */
  readonly onCloseTab: (origin: FocusOrigin) => void;
  /** Start (`disconnected`); without it the banner has no button (the desktop does not allow it). */
  readonly onStart?: () => void;
  /** The start awaits the desktop's answer. */
  readonly starting?: boolean;
  /** Default `pane-banner`; parts get `-icon`, `-close`, `-start`. */
  readonly testID?: string;
};

type BannerLook = { readonly icon: IconName; readonly color: ColorToken; readonly text: string };

/** The bottom banner, in place of the key bar, for an exited or disconnected pane. */
export function PaneStateBanner({
  state,
  exitCode,
  onCloseTab,
  onStart,
  starting = false,
  testID = "pane-banner",
}: PaneStateBannerProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const closeRef = useRef<HostInstance>(null);
  let look: BannerLook;
  let action: ReactNode = null;
  if (state === PaneStates.exited) {
    const failed = exitCode !== null && exitCode !== 0;
    look = {
      icon: failed ? "circle-x" : "circle-check",
      color: failed ? "error" : "textSecondary",
      text: exitCode === null ? t("pane_state.exited") : t("pane_state_card.exited", { code: exitCode }),
    };
    action = (
      <Button
        ref={closeRef}
        label={t("common.close_tab")}
        variant="text"
        onPress={() => onCloseTab(closeRef)}
        testID={`${testID}-close`}
      />
    );
  } else if (state === PaneStates.disconnected) {
    look = { icon: "unplug", color: "textSecondary", text: t("pane_state.disconnected") };
    action =
      onStart === undefined ? null : (
        <Button label={t("pane_state.start")} onPress={onStart} loading={starting} testID={`${testID}-start`} />
      );
  } else {
    return null;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      testID={testID}
      style={[styles.banner, { backgroundColor: colors.bgBar, borderTopColor: colors.borderRow }]}
    >
      <Icon name={look.icon} role="indicator" color={look.color} testID={`${testID}-icon`} />
      <Text style={[typeStyle("body"), styles.bannerText, { color: colors.textBody }]}>{look.text}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: size.gutter,
  },
  frameCenter: {
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  frameTop: {
    top: size.gutter,
  },
  card: {
    width: "100%",
    maxWidth: size.stateCardMaxWidth,
    padding: spacing.cardPadding,
    rowGap: spacing.stateGap,
    alignItems: "center",
    borderRadius: radius.card,
    borderWidth: size.borderWidth,
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.bannerGap,
  },
  centered: {
    textAlign: "center",
  },
  banner: {
    minHeight: size.bottomBannerHeight,
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.bannerGap,
    paddingHorizontal: spacing.bannerPaddingX,
    borderTopWidth: size.borderWidth,
  },
  bannerText: {
    flex: 1,
  },
});
