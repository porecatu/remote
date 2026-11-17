// SPDX-License-Identifier: GPL-3.0-or-later
// The search bar of the workspace (anatomy §4.5.3; PRD-002 RF-2.12): `search`
// in the bar swaps the title for a 48 field, focused at once, with a text
// keyboard and no autocorrection; `x` clears it and "Cancel" closes the
// search. The bar keeps its look (56, `bg.bar`, bottom border) and the back
// arrow. What is typed is never logged (the app's privacy rule).
import { StyleSheet, View } from "react-native";

import { Button, IconButton, TextField } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { size, spacing, useTheme } from "@ui/theme";

export type SearchFieldProps = {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  /** "Cancel": closes the search and gives the tree back as it was. */
  readonly onCancel: () => void;
  /** The bar's back arrow (leaves the desktop). */
  readonly onBack: () => void;
  readonly testID?: string;
};

/** The bar of the workspace while searching. */
export function SearchField({ value, onChangeText, onCancel, onBack, testID = "workspace-search" }: SearchFieldProps) {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <View
      style={[styles.bar, { backgroundColor: colors.bgBar, borderBottomColor: colors.borderRow }]}
      testID={testID}
    >
      <IconButton
        icon="chevron-left"
        accessibilityLabel={t("workspace.back")}
        onPress={onBack}
        testID={`${testID}-back`}
      />
      <View style={styles.field}>
        <TextField
          label={t("search.field")}
          labelVisible={false}
          value={value}
          onChangeText={onChangeText}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          testID={`${testID}-field`}
        />
      </View>
      {value.length === 0 ? null : (
        <IconButton
          icon="x"
          accessibilityLabel={t("search.clear")}
          onPress={() => onChangeText("")}
          testID={`${testID}-clear`}
        />
      )}
      <View style={styles.cancel}>
        <Button
          label={t("common.cancel")}
          variant="text"
          onPress={onCancel}
          testID={`${testID}-cancel`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: size.barHeight,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.barPaddingX,
    borderBottomWidth: size.borderWidth,
  },
  field: {
    flex: 1,
    minWidth: 0,
  },
  cancel: {
    marginLeft: spacing.barPaddingX,
  },
});
