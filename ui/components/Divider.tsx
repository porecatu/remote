// SPDX-License-Identifier: GPL-3.0-or-later
// A divider line (anatomy §2.5 `border.width`, `border.row`; §2.6
// `divider.inset` and `divider.margin-y`). Decorative: hidden from the
// screen reader.
import { View } from "react-native";

import { size, spacing, useTheme } from "../theme";

/** `full`: edge to edge, no margin (between rows); `menu`: inset, with air above and below (sheets). */
export type DividerVariant = "full" | "menu";

export type DividerProps = {
  readonly variant?: DividerVariant;
  readonly testID?: string;
};

/** A 1-point `border.row` line. */
export function Divider({ variant = "full", testID }: DividerProps) {
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      {...(testID === undefined ? {} : { testID })}
      style={[
        { height: size.borderWidth, backgroundColor: colors.borderRow },
        variant === "menu"
          ? { marginHorizontal: spacing.dividerInset, marginVertical: spacing.dividerMarginY }
          : null,
      ]}
    />
  );
}
