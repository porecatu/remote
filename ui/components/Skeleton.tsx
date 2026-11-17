// SPDX-License-Identifier: GPL-3.0-or-later
// Skeleton rows (anatomy §4.2 "loading"): empty cards of the row height in
// the list layout, shown while the list is read (up to 1 s). They do not
// animate (§1 principle 9). For the screen reader the block is one element,
// "Loading", marked busy.
import { StyleSheet, View } from "react-native";

import { useT } from "@ui/i18n/LocaleProvider";

import { radius, size, spacing, useTheme } from "../theme";

export type SkeletonProps = {
  /** How many rows (the desktop list shows 3). */
  readonly rows: number;
  /** Height of each row: `row.double` (default) or `row.single`. */
  readonly lines?: 1 | 2;
  readonly testID?: string;
};

/** Placeholder cards while a list loads. */
export function Skeleton({ rows, lines = 2, testID }: SkeletonProps) {
  const { colors } = useTheme();
  const { t } = useT();
  const height = lines === 2 ? size.rowDouble : size.rowSingle;
  return (
    <View
      accessible
      accessibilityLabel={t("a11y.loading")}
      accessibilityState={{ busy: true }}
      style={styles.list}
      {...(testID === undefined ? {} : { testID })}
    >
      {Array.from({ length: rows }, (_, index) => (
        <View
          key={index}
          style={[
            styles.row,
            { height, backgroundColor: colors.bgRow, borderColor: colors.borderRow },
          ]}
          {...(testID === undefined ? {} : { testID: `${testID}-row` })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    rowGap: spacing.listGap,
  },
  row: {
    borderRadius: radius.card,
    borderWidth: size.borderWidth,
  },
});
