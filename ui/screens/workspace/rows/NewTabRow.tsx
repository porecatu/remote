// SPDX-License-Identifier: GPL-3.0-or-later
// "New tab", the last row of each window and of each expanded group (anatomy
// §4.5.2 item 7, PRD-004 RF-4.1): `plus` and the label in `accent.text`, 48
// high. The icon sits in the indicator slot, in line with the indicators of
// the tab rows above it. Touch opens the new tab sheet with the context the
// screen binds to `onPress` (window or group); `onPress` gets the row, which
// the sheet gives the screen reader focus back to on close (§5).
import { memo, useRef } from "react";
import { Pressable, StyleSheet, Text, View, type HostInstance } from "react-native";

import { Icon } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import type { FocusOrigin } from "@ui/overlay";
import { size, spacing, typeStyle, useTheme } from "@ui/theme";

/**
 * `group`: a row of the group's card, under a divider. `window`: the last row
 * of a window, outside the cards, lined up with the loose tab cards.
 */
export type NewTabRowVariant = "group" | "window";

export type NewTabRowProps = {
  readonly variant: NewTabRowVariant;
  readonly onPress: (origin: FocusOrigin) => void;
  /** No touch (the tree is read-only while reconnecting, §4.5.4). */
  readonly disabled?: boolean;
  readonly testID?: string;
};

function NewTabRowView({ variant, onPress, disabled = false, testID }: NewTabRowProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const color = disabled ? "textDisabled" : "accentText";
  const rowRef = useRef<HostInstance>(null);
  return (
    <Pressable
      ref={rowRef}
      accessibilityRole="button"
      accessibilityLabel={t("common.new_tab")}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onPress(rowRef)}
      style={({ pressed }) => [
        styles.row,
        variant === "group" ? { borderTopWidth: size.borderWidth, borderTopColor: colors.borderRow } : styles.window,
        pressed ? { backgroundColor: colors.bgPressed } : null,
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      <View style={styles.slot}>
        <Icon name="plus" role="inline" color={color} {...(testID === undefined ? {} : { testID: `${testID}-icon` })} />
      </View>
      <Text numberOfLines={1} style={[typeStyle("button"), styles.shrink, { color: colors[color] }]}>
        {t("common.new_tab")}
      </Text>
    </Pressable>
  );
}

/** The "New tab" row of a window or a group. */
export const NewTabRow = memo(NewTabRowView);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: size.targetMin,
    paddingLeft: spacing.tabRowPaddingX,
    paddingRight: spacing.tabRowPaddingX,
    columnGap: spacing.tabRowGap,
  },
  window: {
    // Outside the cards: the list margin, then the card border and the loose
    // indent, so the icon lines up with the indicators of the loose tabs.
    marginHorizontal: spacing.listPadding,
    paddingLeft: size.borderWidth + spacing.treeLooseIndent + spacing.tabRowPaddingX,
  },
  slot: {
    width: size.indicatorSlot,
    alignItems: "center",
  },
  shrink: {
    flexShrink: 1,
  },
});
