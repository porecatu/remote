// SPDX-License-Identifier: GPL-3.0-or-later
// The chip of rows and bars (anatomy §2.3 `type.chip`, §2.4 `radius.chip`,
// §2.5 `badge.height`, §2.6 `chip.*`): `bg.field` background, an optional
// leading dot, icon or element (the spinner of "connecting…"), and text. State
// is never only color (§1 principle 3): a chip always carries its text.
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { radius, roundRadius, size, spacing, typeStyle, useTheme, type ColorToken } from "../theme";
import { Icon, type IconName } from "./Icon";

/** What goes before the chip text. */
export type ChipLeading =
  | { readonly kind: "dot"; readonly color: ColorToken }
  | { readonly kind: "icon"; readonly name: IconName; readonly color: ColorToken }
  /** Any element already sized to `icon.chip` or less (the spinner). */
  | { readonly kind: "node"; readonly node: ReactNode };

export type ChipProps = {
  readonly label: string;
  readonly leading?: ChipLeading;
  /** Text color; default `textSecondary`. */
  readonly color?: ColorToken;
  /** `mono`: `type.mono-chip` (profile name and type); default `type.chip`. */
  readonly font?: "system" | "mono";
  /** Also names the dot or icon: `<testID>-leading`. */
  readonly testID?: string;
};

/** The status dot (`dot`, `radius.round`), one size everywhere. */
export function StatusDot({ color, testID }: { readonly color: ColorToken; readonly testID?: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.dot, { backgroundColor: colors[color] }]}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}

/** A chip: optional dot, icon or element, then the text. */
export function Chip({ label, leading, color = "textSecondary", font = "system", testID }: ChipProps) {
  const { colors } = useTheme();
  const leadingID = testID === undefined ? {} : { testID: `${testID}-leading` };
  return (
    <View
      style={[styles.chip, { backgroundColor: colors.bgField }]}
      {...(testID === undefined ? {} : { testID })}
    >
      {leading === undefined ? null : leading.kind === "dot" ? (
        <StatusDot color={leading.color} {...leadingID} />
      ) : leading.kind === "icon" ? (
        <Icon name={leading.name} role="chip" color={leading.color} {...leadingID} />
      ) : (
        leading.node
      )}
      <Text
        numberOfLines={1}
        style={[typeStyle(font === "mono" ? "monoChip" : "chip"), { color: colors[color] }]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    flexShrink: 0,
    minHeight: size.badgeHeight,
    paddingHorizontal: spacing.chipPaddingX,
    columnGap: spacing.chipGap,
    borderRadius: radius.chip,
  },
  dot: {
    width: size.dot,
    height: size.dot,
    borderRadius: roundRadius(size.dot),
  },
});
