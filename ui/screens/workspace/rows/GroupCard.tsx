// SPDX-License-Identifier: GPL-3.0-or-later
// A group of the workspace tree (anatomy §4.5.2 item 5, PRD-002 RF-2.7,
// RF-2.8): a `bg.row` card with the group color as a 4-wide stripe on the
// left edge and as the .14 tint of the 52 header; the header has the name
// (16/600), the tab count in a badge and the group menu button. The color is
// never text (§2.2). A group open on the desktop is open here and has no
// chevron nor collapse touch; a group collapsed on the desktop starts
// collapsed, with "Collapsed on the desktop" under the name and a chevron, and
// the header touch expands or collapses it only in the app (RF-2.8). When
// expanded the card holds the tab rows (children, `TabRow` with `inGroup`)
// and the "New tab" row at the end. `onMenu` and `onNewTab` get the element
// they came from (the menu button, the header for the action, the "New tab"
// row), so the screen reader focus goes back to it on close (§5). It reads no
// service nor store.
import { Children, memo, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent, type HostInstance } from "react-native";

import type { GroupId, Rgb } from "@/protocol";
import type { GroupRow } from "@/workspace/selectors";
import { Badge, Card, Icon, IconButton, Spinner } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import type { FocusOrigin } from "@ui/overlay";
import { opacity, rgbToCss, size, spacing, typeStyle, useTheme } from "@ui/theme";

import { NewTabRow } from "./NewTabRow";
import { groupAccessibilityLabel } from "./rowModel";

export type GroupCardProps = {
  /** The group as the selectors list it (`buildRows`). */
  readonly row: Pick<GroupRow, "group" | "name" | "tabCount" | "desktopCollapsed" | "collapsed">;
  /** The group color, already resolved from the desktop theme (`resolveGroupColor`). */
  readonly color: Rgb;
  /** Header touch of a group collapsed on the desktop: expand or collapse only in the app. */
  readonly onToggle: (group: GroupId) => void;
  /** Menu button or the "Group menu" action (§4.12.2). */
  readonly onMenu: (group: GroupId, origin: FocusOrigin) => void;
  /** "New tab" at the end of the expanded group; without it the row is not shown. */
  readonly onNewTab?: (group: GroupId, origin: FocusOrigin) => void;
  /** An action on this group awaits its result: 60%, spinner instead of the menu (RF-4.9). */
  readonly pending?: boolean;
  /** The tree is read-only (reconnecting, §4.5.4): no menu, no "New tab". */
  readonly readOnly?: boolean;
  /** The tab rows of the group, shown while it is expanded. */
  readonly children?: ReactNode;
  readonly testID?: string;
};

type HeaderAction = "menu" | "activate";

function GroupCardView({
  row,
  color,
  onToggle,
  onMenu,
  onNewTab,
  pending = false,
  readOnly = false,
  children,
  testID,
}: GroupCardProps) {
  const tr = useT();
  const { colors } = useTheme();
  const { group, name, tabCount, desktopCollapsed, collapsed } = row;
  const toggles = desktopCollapsed;
  const menuAllowed = !pending && !readOnly;
  const label = groupAccessibilityLabel(row, tr);
  const fullLabel = pending ? `${label}${tr.t("a11y.separator")}${tr.t("a11y.pending")}` : label;
  const actions: readonly { name: HeaderAction; label: string }[] = menuAllowed
    ? [{ name: "menu", label: tr.t("workspace.group_menu") }]
    : [];
  const id = (suffix: string) => (testID === undefined ? {} : { testID: `${testID}-${suffix}` });
  const headerRef = useRef<HostInstance>(null);
  const menuRef = useRef<HostInstance>(null);

  const handleAction = (event: AccessibilityActionEvent) => {
    const action = event.nativeEvent.actionName;
    if (action === "menu" && menuAllowed) {
      onMenu(group, headerRef);
    } else if (action === "activate" && toggles && !pending) {
      onToggle(group);
    }
  };

  const headerContent = (
    <>
      <View style={styles.headerText}>
        <View style={styles.titleLine}>
          <Text numberOfLines={1} style={[typeStyle("groupTitle"), styles.shrink, { color: colors.textTitle }]}>
            {name}
          </Text>
          <Badge label={String(tabCount)} {...id("count")} />
        </View>
        {desktopCollapsed ? (
          <Text numberOfLines={1} style={[typeStyle("secondary"), { color: colors.textTertiary }]}>
            {tr.t("workspace.collapsed_on_desktop")}
          </Text>
        ) : null}
      </View>
      {toggles ? (
        <Icon
          name={collapsed ? "chevron-right" : "chevron-down"}
          role="chevron"
          color="textSecondary"
          {...id("chevron")}
        />
      ) : null}
      <View style={styles.menu}>
        {pending ? (
          <Spinner {...id("pending")} />
        ) : (
          // The header offers the menu to the screen reader as a custom action;
          // the button is its visible shortcut.
          <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <IconButton
              ref={menuRef}
              icon="ellipsis-vertical"
              role="item"
              color="textSecondary"
              accessibilityLabel={tr.t("workspace.group_menu_for", { name })}
              onPress={() => onMenu(group, menuRef)}
              disabled={!menuAllowed}
              {...id("menu")}
            />
          </View>
        )}
      </View>
    </>
  );

  const tint = { backgroundColor: rgbToCss(color, opacity.groupTint) };
  const a11y = {
    accessible: true,
    accessibilityLabel: fullLabel,
    ...(actions.length === 0 ? {} : { accessibilityActions: actions, onAccessibilityAction: handleAction }),
  } as const;

  const header = toggles ? (
    <Pressable
      ref={headerRef}
      {...a11y}
      accessibilityRole="button"
      accessibilityHint={tr.t(collapsed ? "workspace.expand" : "workspace.collapse")}
      accessibilityState={{ expanded: !collapsed, disabled: pending, ...(pending ? { busy: true } : {}) }}
      disabled={pending}
      onPress={() => onToggle(group)}
      style={({ pressed }) => [styles.header, pressed ? { backgroundColor: colors.bgPressed } : tint]}
      {...id("header")}
    >
      {headerContent}
    </Pressable>
  ) : (
    <View
      ref={headerRef}
      {...a11y}
      {...(pending ? { accessibilityState: { busy: true } } : {})}
      style={[styles.header, tint]}
      {...id("header")}
    >
      {headerContent}
    </View>
  );

  const divided = { borderTopWidth: size.borderWidth, borderTopColor: colors.borderRow };

  return (
    <View style={styles.outer}>
      <Card {...(testID === undefined ? {} : { testID })}>
        <View style={styles.card}>
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[styles.stripe, { backgroundColor: rgbToCss(color) }]}
            {...id("stripe")}
          />
          <View style={styles.body}>
            <View style={pending ? styles.pending : null}>{header}</View>
            {collapsed
              ? null
              : Children.toArray(children).map((child, index) => (
                  <View key={index} style={divided}>
                    {child}
                  </View>
                ))}
            {collapsed || onNewTab === undefined ? null : (
              <NewTabRow variant="group" onPress={(origin) => onNewTab(group, origin)} disabled={readOnly} {...id("new-tab")} />
            )}
          </View>
        </View>
      </Card>
    </View>
  );
}

/** A group card: tinted header with name, count and menu, then its tabs when expanded. */
export const GroupCard = memo(GroupCardView);

const styles = StyleSheet.create({
  outer: {
    // A full-width list item: the list margin around the card (`list.padding`).
    marginHorizontal: spacing.listPadding,
  },
  card: {
    flexDirection: "row",
  },
  stripe: {
    width: size.groupStripe,
  },
  body: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: size.rowGroupHeader,
    paddingLeft: spacing.tabRowPaddingX,
    paddingRight: spacing.tabRowPaddingX,
    columnGap: spacing.rowInlineGap,
  },
  headerText: {
    flex: 1,
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.rowInlineGap,
  },
  shrink: {
    flexShrink: 1,
  },
  menu: {
    width: size.targetMin,
    height: size.targetMin,
    alignItems: "center",
    justifyContent: "center",
  },
  pending: {
    opacity: opacity.pending,
  },
});
