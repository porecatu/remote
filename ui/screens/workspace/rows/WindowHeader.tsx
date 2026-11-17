// SPDX-License-Identifier: GPL-3.0-or-later
// The header of a window section (anatomy §4.5.2 item 2, PRD-002 RF-2.6),
// only when the desktop has more than one window: a 52 header with the
// chevron, "Window N" (N by the order received), the title of the window's
// active tab underneath and the tab count on the right. The section collapses
// in the app only (the screen keeps that state in memory). Marked as a header
// for the screen reader's heading navigation. From the second window on, a
// divider sits on top of it (`window.gap`). It reads no service nor store.
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { WindowId } from "@/protocol";
import type { WindowRow } from "@/workspace/selectors";
import { Divider, Icon } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { size, spacing, typeStyle, useTheme } from "@ui/theme";

import { windowAccessibilityLabel } from "./rowModel";

export type WindowHeaderProps = {
  /** The window as the selectors list it (`buildRows`). */
  readonly row: Pick<WindowRow, "window" | "title" | "tabCount">;
  /** N of "Window N": the window's position in the order received, from 1. */
  readonly number: number;
  /** The section is collapsed in the app. */
  readonly collapsed: boolean;
  readonly onToggle: (window: WindowId) => void;
  /** The first window has no divider above it. */
  readonly first: boolean;
  readonly testID?: string;
};

function WindowHeaderView({ row, number, collapsed, onToggle, first, testID }: WindowHeaderProps) {
  const tr = useT();
  const { colors } = useTheme();
  const id = (suffix: string) => (testID === undefined ? {} : { testID: `${testID}-${suffix}` });
  return (
    <View>
      {first ? null : (
        <View style={styles.divider}>
          <Divider {...id("divider")} />
        </View>
      )}
      <Pressable
        accessibilityRole="header"
        accessibilityLabel={windowAccessibilityLabel({ number, title: row.title, tabCount: row.tabCount }, tr)}
        accessibilityHint={tr.t(collapsed ? "workspace.expand" : "workspace.collapse")}
        accessibilityState={{ expanded: !collapsed }}
        onPress={() => onToggle(row.window)}
        style={({ pressed }) => [styles.header, pressed ? { backgroundColor: colors.bgPressed } : null]}
        {...(testID === undefined ? {} : { testID })}
      >
        <Icon
          name={collapsed ? "chevron-right" : "chevron-down"}
          role="chevron"
          color="textSecondary"
          {...id("chevron")}
        />
        <View style={styles.text}>
          <Text numberOfLines={1} style={[typeStyle("groupTitle"), { color: colors.textTitle }]}>
            {tr.t("workspace.window", { number })}
          </Text>
          {row.title.length === 0 ? null : (
            <Text numberOfLines={1} style={[typeStyle("secondary"), { color: colors.textSecondary }]}>
              {row.title}
            </Text>
          )}
        </View>
        <Text numberOfLines={1} style={[typeStyle("secondary"), { color: colors.textTertiary }]}>
          {tr.tn("workspace.tab_count", row.tabCount)}
        </Text>
      </Pressable>
    </View>
  );
}

/** The collapsible header of a window section. */
export const WindowHeader = memo(WindowHeaderView);

const styles = StyleSheet.create({
  divider: {
    marginTop: spacing.windowGap,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: size.rowGroupHeader,
    paddingHorizontal: spacing.rowPaddingX,
    columnGap: spacing.rowIconGap,
  },
  text: {
    flex: 1,
  },
});
