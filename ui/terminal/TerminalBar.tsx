// SPDX-License-Identifier: GPL-3.0-or-later
// The terminal bar (anatomy §4.6, §4.9; PRD-003 RF-3.1, RF-3.23; PRD-002
// RF-2.10): `bar.height` 48 (40 in landscape), `bg.bar` with the `border.row`
// bottom border.
//
// - Left: `chevron-left` back to the tree.
// - Center: the tab title (`type.row-title`), and line 2 with `user@host` (SSH
//   tab) or the pane's `cwd` in mono (`type.mono-secondary`), plus a state
//   chip when the pane is not `running` (the chips of the tree, §4.5.2).
// - Right: the pane chip "2/3" (only with more than one pane; a 48 target that
//   opens the pane picker), `keyboard` (shows or hides the system keyboard;
//   disabled with the reason as its label when the pane is not `running`,
//   §4.10) and `ellipsis-vertical` (the tab menu, RF-4.6).
// - The bell: a `bell` in `error` lights up in the bar for `duration.bell`
//   every time `bellSignal` changes, and fades out over that time; with
//   "reduce motion" it stays lit for the same time with no fade.
//
// Data and callbacks only: the screen owns the controller and the keyboard.
// The pane chip and the menu button hand themselves to their callbacks, so the
// sheet they open gives the screen reader focus back to them (§5).
// Texts follow the system font up to the bar cap (§2.3, `barMaxFontScale`).
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type HostInstance, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import type { PaneState } from "@/protocol";
import { Chip, Icon, IconButton, Spinner } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import type { FocusOrigin } from "@ui/overlay";
import { tabStateChip } from "@ui/model/tabState";
import {
  barMaxFontScale,
  duration,
  radius,
  size,
  spacing,
  typeStyle,
  useReducedMotion,
  useTheme,
} from "@ui/theme";

export type TerminalBarProps = {
  /** The tab title. */
  readonly title: string;
  /** Line 2: `user@host` of an SSH tab, else the `cwd` of the pane on screen; none when null. */
  readonly detail: string | null;
  /** State of the pane on screen; a chip shows it when it is not `running`. */
  readonly paneState: PaneState | null;
  /** Exit code of an `exited` pane. */
  readonly exitCode: number | null;
  /** Position of the pane on screen in the tab's reading order, from 1. */
  readonly paneIndex: number;
  /** Panes of the tab; the pane chip exists only with more than one. */
  readonly paneCount: number;
  /** The system keyboard is open: the button says "Hide keyboard". */
  readonly keyboardVisible: boolean;
  /** Input may go (`canType`); otherwise the keyboard button is disabled and says why. */
  readonly keyboardAvailable: boolean;
  /** Changes every time the bell rings in the pane on screen; each change lights the bell. */
  readonly bellSignal?: number;
  /** Landscape: the immersive bar of 40 (§4.6). */
  readonly landscape?: boolean;
  readonly onBack: () => void;
  /** The pane chip; `origin` is the chip. */
  readonly onPanePicker: (origin: FocusOrigin) => void;
  readonly onToggleKeyboard: () => void;
  /** The menu button; `origin` is the button. */
  readonly onTabMenu: (origin: FocusOrigin) => void;
  /** Default `terminal-bar`; parts get `-back`, `-title`, `-detail`, `-state`, `-panes`, `-keyboard`, `-menu`, `-bell`. */
  readonly testID?: string;
};

type BellFlash = {
  /** The bell is on screen. */
  readonly lit: boolean;
  /** The fade of the flash, unused with "reduce motion" (the bell stays lit). */
  readonly opacity: SharedValue<number>;
  readonly reducedMotion: boolean;
};

/** Lights the bell for `duration.bell` at every change of `signal` after the first render. */
function useBellFlash(signal: number | undefined): BellFlash {
  const reducedMotion = useReducedMotion();
  const [lit, setLit] = useState(false);
  const [flash, setFlash] = useState(0);
  const opacity = useSharedValue(1);
  const handled = useRef(signal);

  useEffect(() => {
    if (signal === handled.current) {
      return;
    }
    handled.current = signal;
    setFlash((count) => count + 1);
    setLit(true);
    const timer = setTimeout(() => {
      setLit(false);
    }, duration.bell);
    return () => {
      clearTimeout(timer);
    };
  }, [signal]);

  useEffect(() => {
    if (flash === 0) {
      return;
    }
    cancelAnimation(opacity);
    opacity.set(1);
    if (!reducedMotion) {
      opacity.set(withTiming(0, { duration: duration.bell, easing: Easing.linear }));
    }
  }, [flash, reducedMotion, opacity]);

  return { lit, opacity, reducedMotion };
}

/** The top bar of the terminal screen. */
export function TerminalBar({
  title,
  detail,
  paneState,
  exitCode,
  paneIndex,
  paneCount,
  keyboardVisible,
  keyboardAvailable,
  bellSignal,
  landscape = false,
  onBack,
  onPanePicker,
  onToggleKeyboard,
  onTabMenu,
  testID = "terminal-bar",
}: TerminalBarProps) {
  const tr = useT();
  const { colors } = useTheme();
  const bell = useBellFlash(bellSignal);
  const panesRef = useRef<HostInstance>(null);
  const menuRef = useRef<HostInstance>(null);
  const fade = useAnimatedStyle(() => ({ opacity: bell.opacity.get() }));
  const chip = paneState === null ? null : tabStateChip(paneState, exitCode, tr);
  const hasDetail = detail !== null && detail.length > 0;

  const keyboardLabel = !keyboardAvailable
    ? tr.t("terminal.keyboard_unavailable")
    : keyboardVisible
      ? tr.t("terminal.hide_keyboard")
      : tr.t("terminal.show_keyboard");

  return (
    <View
      testID={testID}
      style={[
        styles.bar,
        {
          height: landscape ? size.terminalBarHeightLandscape : size.terminalBarHeight,
          backgroundColor: colors.bgBar,
          borderBottomColor: colors.borderRow,
        },
      ]}
    >
      <IconButton
        icon="chevron-left"
        accessibilityLabel={tr.t("terminal.back")}
        onPress={onBack}
        testID={`${testID}-back`}
      />
      <View style={styles.center}>
        <View style={styles.line}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            maxFontSizeMultiplier={barMaxFontScale}
            testID={`${testID}-title`}
            style={[typeStyle("rowTitle"), styles.shrink, { color: colors.textTitle }]}
          >
            {title}
          </Text>
          {bell.lit ? (
            <Animated.View
              accessible
              accessibilityLabel={tr.t("terminal.bell")}
              testID={`${testID}-bell`}
              style={bell.reducedMotion ? null : fade}
            >
              <Icon name="bell" role="indicator" color="error" />
            </Animated.View>
          ) : null}
        </View>
        {hasDetail || chip !== null ? (
          <View style={styles.line}>
            {hasDetail ? (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={barMaxFontScale}
                testID={`${testID}-detail`}
                style={[typeStyle("monoSecondary"), styles.shrink, { color: colors.textSecondary }]}
              >
                {detail}
              </Text>
            ) : null}
            {chip === null ? null : (
              <Chip
                label={chip.label}
                color={chip.color}
                leading={
                  chip.leading.kind === "spinner"
                    ? { kind: "node", node: <Spinner testID={`${testID}-state-spinner`} /> }
                    : chip.leading
                }
                testID={`${testID}-state`}
              />
            )}
          </View>
        ) : null}
      </View>
      {paneCount > 1 ? (
        <Pressable
          ref={panesRef}
          onPress={() => onPanePicker(panesRef)}
          accessibilityRole="button"
          accessibilityLabel={tr.t("terminal.pane_chip_a11y", { index: paneIndex, total: paneCount })}
          testID={`${testID}-panes`}
          style={({ pressed }): StyleProp<ViewStyle> => [
            styles.paneChip,
            pressed ? { backgroundColor: colors.bgPressed } : null,
          ]}
        >
          <Chip
            label={tr.t("terminal.pane_chip", { index: paneIndex, total: paneCount })}
            leading={{ kind: "icon", name: "layout-panel-left", color: "textSecondary" }}
          />
        </Pressable>
      ) : null}
      <IconButton
        icon="keyboard"
        accessibilityLabel={keyboardLabel}
        onPress={onToggleKeyboard}
        disabled={!keyboardAvailable}
        testID={`${testID}-keyboard`}
      />
      <IconButton
        ref={menuRef}
        icon="ellipsis-vertical"
        accessibilityLabel={tr.t("workspace.tab_menu")}
        onPress={() => onTabMenu(menuRef)}
        testID={`${testID}-menu`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.barPaddingX,
    borderBottomWidth: size.borderWidth,
  },
  center: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.rowInlineGap,
  },
  shrink: {
    flexShrink: 1,
  },
  paneChip: {
    minWidth: size.targetMin,
    height: size.targetMin,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
  },
});
