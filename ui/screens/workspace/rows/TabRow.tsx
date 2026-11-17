// SPDX-License-Identifier: GPL-3.0-or-later
// A tab of the workspace tree (anatomy §4.5.2 "Linha de aba", PRD-002 RF-2.9,
// RF-2.10; PRD-004 RF-4.9). `row.double` (64): the indicator slot (bell or
// activity), the pin of a pinned tab, the title, the profile badge, the panes
// chip and the "active on the desktop" mark on line 1; `user@host` or `cwd`
// and the state chip on line 2; the tab menu button at the end. Touch opens
// the terminal; long press and the menu button open the tab menu. For the
// screen reader the row is one element with a composed label and the custom
// actions "Open" and "Tab menu" (§5 item 2). A loose tab (pinned or in the
// track, outside a group) is its own `bg.row` card; a tab of a group is a row
// of the group's card (GroupCard). `onMenu` gets the element the menu came
// from (the menu button, or the row for a long press or the action), so the
// screen reader focus goes back to it on close (§5). It reads no service nor
// store: data and callbacks only.
import { memo, useRef } from "react";
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent, type HostInstance } from "react-native";

import type { TabView } from "@/workspace/selectors";
import { hasManyPanes } from "@/workspace/selectors";
import { Badge, Card, Chip, Icon, IconButton, Spinner, StatusDot } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { tabStateChip } from "@ui/model/tabState";
import type { FocusOrigin } from "@ui/overlay";
import { monoFamily, opacity, size, spacing, type as typeTokens, typeStyle, useTheme } from "@ui/theme";

import { matchSegments, tabAccessibilityLabel, tabDetail, tabIndicator } from "./rowModel";

/** The search match shown on line 2, with the matched part in bold (§4.5.3). */
export type TabRowMatch = {
  /** The text that matched (`cwd` or `user@host`), shown instead of the usual line 2. */
  readonly text: string;
  /** What the user typed. */
  readonly query: string;
};

export type TabRowProps = {
  readonly tab: TabView;
  /** A row of a group's card; otherwise the row is its own card (loose tab). */
  readonly inGroup: boolean;
  /** Touch: opens the focused pane of the tab in the terminal (RF-2.10). */
  readonly onOpen: (tab: TabView) => void;
  /** Long press, menu button or the "Tab menu" action (RF-4.6). */
  readonly onMenu: (tab: TabView, origin: FocusOrigin) => void;
  /** An action on this tab awaits its result: 60%, spinner instead of the menu, no touch (RF-4.9). */
  readonly pending?: boolean;
  /** The tree is read-only (reconnecting, §4.5.4): no menu; the row still opens. */
  readonly readOnly?: boolean;
  /** Line 2 during a search that matched by `cwd` or `user@host`. */
  readonly match?: TabRowMatch;
  readonly testID?: string;
};

type RowAction = "open" | "menu";

function TabRowView({ tab, inGroup, onOpen, onMenu, pending = false, readOnly = false, match, testID }: TabRowProps) {
  const tr = useT();
  const { colors } = useTheme();
  const detail = match === undefined ? tabDetail(tab) : match.text;
  const indicator = tabIndicator(tab);
  const chip = tabStateChip(tab.state, tab.exit, tr);
  const menuAllowed = !pending && !readOnly;
  const label = tabAccessibilityLabel(tab, tr, detail);
  const fullLabel = pending ? `${label}${tr.t("a11y.separator")}${tr.t("a11y.pending")}` : label;
  const actions: readonly { name: RowAction; label: string }[] = pending
    ? []
    : [
        { name: "open", label: tr.t("common.open") },
        ...(menuAllowed ? [{ name: "menu" as const, label: tr.t("workspace.tab_menu") }] : []),
      ];
  const id = (suffix: string) => (testID === undefined ? {} : { testID: `${testID}-${suffix}` });
  const rowRef = useRef<HostInstance>(null);
  const menuRef = useRef<HostInstance>(null);

  const handleAction = (event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    if (name === "open" || name === "activate") {
      onOpen(tab);
    } else if (name === "menu" && menuAllowed) {
      onMenu(tab, rowRef);
    }
  };

  const row = (
    <Pressable
      ref={rowRef}
      accessible
      accessibilityRole="button"
      accessibilityLabel={fullLabel}
      accessibilityState={{ disabled: pending, ...(pending ? { busy: true } : {}) }}
      {...(actions.length === 0 ? {} : { accessibilityActions: actions, onAccessibilityAction: handleAction })}
      disabled={pending}
      onPress={() => onOpen(tab)}
      {...(menuAllowed ? { onLongPress: () => onMenu(tab, rowRef) } : {})}
      style={({ pressed }) => [
        styles.row,
        inGroup ? null : styles.loose,
        { backgroundColor: pressed ? colors.bgPressed : tab.active ? colors.bgSelected : "transparent" },
        pending ? styles.pending : null,
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      <View style={styles.indicator}>
        {indicator === "bell" ? (
          <Icon name="bell" role="indicator" color="error" {...id("bell")} />
        ) : indicator === "activity" ? (
          <StatusDot color="success" {...id("activity")} />
        ) : null}
      </View>
      <View style={styles.content}>
        <View style={styles.line}>
          <View style={styles.lineStart}>
            {tab.zone === "pinned" ? <Icon name="pin" role="indicator" color="textTertiary" {...id("pin")} /> : null}
            <Text numberOfLines={1} style={[typeStyle("rowTitle"), styles.shrink, { color: colors.textTitle }]}>
              {tab.title}
            </Text>
            {tab.profileBadge === null ? null : <Badge label={tab.profileBadge} font="mono" {...id("profile")} />}
          </View>
          {hasManyPanes(tab) ? (
            <Chip
              label={String(tab.paneCount)}
              leading={{ kind: "icon", name: "layout-panel-left", color: "textSecondary" }}
              {...id("panes")}
            />
          ) : null}
          {tab.active ? <Icon name="monitor" role="chip" color="textTertiary" {...id("active")} /> : null}
        </View>
        <View style={styles.line}>
          <View style={styles.lineStart}>
            <Text numberOfLines={1} style={[typeStyle("monoSecondary"), styles.shrink, { color: colors.textSecondary }]}>
              {detail === null
                ? null
                : match === undefined
                  ? detail
                  : matchSegments(detail, match.query).map((segment, index) =>
                      segment.match ? (
                        <Text key={index} style={styles.bold}>
                          {segment.text}
                        </Text>
                      ) : (
                        segment.text
                      ),
                    )}
            </Text>
          </View>
          {chip === null ? null : (
            <Chip
              label={chip.label}
              color={chip.color}
              leading={
                chip.leading.kind === "spinner"
                  ? { kind: "node", node: <Spinner {...id("state-spinner")} /> }
                  : chip.leading
              }
              {...id("state")}
            />
          )}
        </View>
      </View>
      <View style={styles.menu}>
        {pending ? (
          <Spinner {...id("pending")} />
        ) : (
          // The row already offers the menu to the screen reader as a custom
          // action; the button is its visible shortcut.
          <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <IconButton
              ref={menuRef}
              icon="ellipsis-vertical"
              role="item"
              color="textSecondary"
              accessibilityLabel={tr.t("workspace.tab_menu_for", { title: tab.title })}
              onPress={() => onMenu(tab, menuRef)}
              disabled={!menuAllowed}
              {...id("menu")}
            />
          </View>
        )}
      </View>
    </Pressable>
  );

  return inGroup ? (
    row
  ) : (
    <View style={styles.card}>
      <Card {...id("card")}>{row}</Card>
    </View>
  );
}

/** A tab row; re-renders only when its props change (the selectors keep row identity). */
export const TabRow = memo(TabRowView);

const styles = StyleSheet.create({
  card: {
    // A full-width list item: the list margin around the card (`list.padding`).
    marginHorizontal: spacing.listPadding,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: size.rowDouble,
    paddingVertical: spacing.rowPaddingY,
    paddingLeft: spacing.tabRowPaddingX,
    paddingRight: spacing.tabRowPaddingX,
    columnGap: spacing.tabRowGap,
  },
  loose: {
    // The loose card's text lines up with the text of the group cards.
    paddingLeft: spacing.tabRowPaddingX + spacing.treeLooseIndent,
  },
  pending: {
    opacity: opacity.pending,
  },
  indicator: {
    width: size.indicatorSlot,
    height: size.indicatorSlot,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    rowGap: spacing.rowLineGap,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.rowInlineGap,
  },
  lineStart: {
    flex: 1,
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
  bold: {
    // The matched part in bold: the heavier face of the embedded mono (500,
    // the weight of the mono chip; there is no 600, decision 2026-11-16).
    fontFamily: monoFamily(typeTokens.monoChip.fontWeight),
  },
});
