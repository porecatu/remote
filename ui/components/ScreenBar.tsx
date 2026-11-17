// SPDX-License-Identifier: GPL-3.0-or-later
// The screen bar (anatomy §2.5 `bar.height` 56, §2.6 `bar.padding-x` and
// `bar.title-inset`, §4.2, §4.5.2 item 1): `bg.bar` with the `border.row`
// bottom border; an optional `chevron-left` back button, the 20/600 title,
// an optional support line (13/400 `text.secondary`) with an optional status
// dot, and icon actions on the right. Its texts follow the system font up to
// the bar cap (§2.3, `barMaxFontScale`). The system back is expo-router's;
// the arrow and the `x` only call their `onPress`. The terminal bar (48) is
// not this one.
import { Text, View } from "react-native";

import { barMaxFontScale, roundRadius, size, spacing, typeStyle, useTheme, type ColorToken } from "../theme";
import type { IconName } from "./Icon";
import { IconButton } from "./IconButton";

/** The back arrow: what it does and what the screen reader says. */
export type ScreenBarBack = {
  readonly onPress: () => void;
  /** Already translated (e.g. "Back to desktops"). */
  readonly accessibilityLabel: string;
};

/** The `x` on the left: closes or cancels the flow (its label says which). */
export type ScreenBarClose = {
  readonly onPress: () => void;
  /** Already translated (e.g. "Cancel" while the pairing runs, "Close" after it). */
  readonly accessibilityLabel: string;
};

/** An icon action on the right of the bar. */
export type ScreenBarAction = {
  readonly icon: IconName;
  /** Already translated (mandatory, §5 item 2). */
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly testID?: string;
};

/** The support line under the title, with an optional status dot. */
export type ScreenBarSubtitle = {
  /** Already translated (e.g. "Connected"). */
  readonly text: string;
  /** Color token of the status dot; no dot without it. The text carries the state (§1 principle 3). */
  readonly dot?: ColorToken;
};

/** The left button: the back arrow or the `x`, never both. */
type ScreenBarLeading =
  | { readonly back?: ScreenBarBack; readonly close?: never }
  | { readonly back?: never; readonly close?: ScreenBarClose };

export type ScreenBarProps = ScreenBarLeading & {
  /** Already translated. */
  readonly title: string;
  readonly subtitle?: ScreenBarSubtitle;
  readonly actions?: readonly ScreenBarAction[];
  /** The parts get `-back`, `-close` and `-dot`. */
  readonly testID?: string;
};

/** The top bar of a screen. */
export function ScreenBar({ title, subtitle, back, close, actions = [], testID }: ScreenBarProps) {
  const { colors } = useTheme();
  const leading =
    back !== undefined
      ? { icon: "chevron-left" as const, button: back, suffix: "back" }
      : close !== undefined
        ? { icon: "x" as const, button: close, suffix: "close" }
        : null;

  return (
    <View
      {...(testID === undefined ? {} : { testID })}
      style={{
        minHeight: size.barHeight,
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: leading === null ? spacing.barTitleInset : spacing.barPaddingX,
        paddingRight: actions.length === 0 ? spacing.barTitleInset : spacing.barPaddingX,
        backgroundColor: colors.bgBar,
        borderBottomWidth: size.borderWidth,
        borderBottomColor: colors.borderRow,
      }}
    >
      {leading === null ? null : (
        <IconButton
          icon={leading.icon}
          accessibilityLabel={leading.button.accessibilityLabel}
          onPress={leading.button.onPress}
          {...(testID === undefined ? {} : { testID: `${testID}-${leading.suffix}` })}
        />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          maxFontSizeMultiplier={barMaxFontScale}
          style={[typeStyle("screenTitle"), { color: colors.textTitle }]}
        >
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.chipGap }}>
            {subtitle.dot === undefined ? null : (
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
                {...(testID === undefined ? {} : { testID: `${testID}-dot` })}
                style={{
                  width: size.dot,
                  height: size.dot,
                  borderRadius: roundRadius(size.dot),
                  backgroundColor: colors[subtitle.dot],
                }}
              />
            )}
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={barMaxFontScale}
              style={[typeStyle("secondary"), { color: colors.textSecondary, flexShrink: 1 }]}
            >
              {subtitle.text}
            </Text>
          </View>
        )}
      </View>
      {actions.map((action) => (
        <IconButton
          // A bar never shows the same icon twice.
          key={action.icon}
          icon={action.icon}
          accessibilityLabel={action.accessibilityLabel}
          onPress={action.onPress}
          {...(action.disabled === undefined ? {} : { disabled: action.disabled })}
          {...(action.selected === undefined ? {} : { selected: action.selected })}
          {...(action.testID === undefined ? {} : { testID: action.testID })}
        />
      ))}
    </View>
  );
}
