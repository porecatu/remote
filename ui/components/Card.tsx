// SPDX-License-Identifier: GPL-3.0-or-later
// The card of the lists (anatomy §2.4, §2.6, §4.2, §4.5.2): `bg.row`, radius
// `radius.card` and a `border.row` border. It clips its rows, so a pressed or
// selected row keeps the rounded corners.
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { radius, size, spacing, useTheme } from "../theme";

export type CardProps = {
  readonly children: ReactNode;
  /** Inner padding of `card.padding` (fingerprint, paste preview); rows go without it. */
  readonly padded?: boolean;
  readonly testID?: string;
};

/** A `bg.row` card with the `border.row` border; holds rows or content. */
export function Card({ children, padded = false, testID }: CardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.bgRow, borderColor: colors.borderRow },
        padded ? styles.padded : null,
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: size.borderWidth,
    overflow: "hidden",
  },
  padded: {
    padding: spacing.cardPadding,
  },
});
