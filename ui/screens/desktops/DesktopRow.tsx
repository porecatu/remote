// SPDX-License-Identifier: GPL-3.0-or-later
// A desktop of the list (anatomy §4.2 "Linha de desktop", PRD-001 RF-1.12,
// RF-1.14 to RF-1.16): its own card with a `row.double` row, the `monitor`
// icon, the name and the status label on line 1, the relay host (or the short
// reason of an error) and the time of the last attempt on line 2, and the
// `ellipsis-vertical` button that opens the row sheet (long press is only a
// shortcut to it). A desktop marked "not paired" has no menu: two text
// buttons, "Pair again" and "Remove", take its place under the row (RF-1.16).
// For the screen reader the row is one element with a composed label; Rename,
// Remove (or Pair again and Remove) and Refresh are its custom actions (§5).
// The callbacks that open a sheet or a dialog get the element it came from
// (the menu button, the row, the Remove button), so the screen reader focus
// goes back to it on close (§5). It reads no service nor store: data and
// callbacks only.
import { memo, useRef } from "react";
import { StyleSheet, View, type HostInstance } from "react-native";

import type { RowStatus } from "@/controllers/desktops";
import type { Desktop } from "@/storage/desktopList";
import { Button, Card, Icon, IconButton, ListRow, Spinner, StatusLabel, type ListRowAction } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import type { FocusOrigin } from "@ui/overlay";
import { icon, space, spacing } from "@ui/theme";

import { rowAccessibilityLabel, rowDetail, statusLook } from "./rowModel";

/** The screen reader custom actions of a row. */
type RowAction = "rename" | "remove" | "pair-again" | "refresh";

export type DesktopRowProps = {
  readonly desktop: Desktop;
  readonly status: RowStatus;
  /** Wall clock of this render, for "now", "3 min ago". */
  readonly nowMs: number;
  /** Touch on the row (RF-1.14); never called for a desktop marked "not paired". */
  readonly onOpen: (desktop: Desktop) => void;
  /** The menu button or a long press: the row sheet. */
  readonly onMenu: (desktop: Desktop, origin: FocusOrigin) => void;
  readonly onRename: (desktop: Desktop, origin: FocusOrigin) => void;
  readonly onRemove: (desktop: Desktop, origin: FocusOrigin) => void;
  /** "Pair again" of a desktop marked "not paired" (RF-1.16). */
  readonly onPairAgain: (desktop: Desktop) => void;
  /** The screen reader's equivalent of pull-to-refresh (§4.2). */
  readonly onRefresh: () => void;
  readonly testID?: string;
};

function DesktopRowView({
  desktop,
  status,
  nowMs,
  onOpen,
  onMenu,
  onRename,
  onRemove,
  onPairAgain,
  onRefresh,
  testID,
}: DesktopRowProps) {
  const tr = useT();
  const { t } = tr;
  const notPaired = status.kind === "not-paired";
  const look = statusLook(status);
  const detail = rowDetail(desktop, status, nowMs, tr);
  const id = (suffix: string) => (testID === undefined ? {} : { testID: `${testID}-${suffix}` });
  // Where the screen reader focus returns when what they opened closes.
  const rowRef = useRef<HostInstance>(null);
  const menuRef = useRef<HostInstance>(null);
  const removeRef = useRef<HostInstance>(null);

  const actions: readonly ListRowAction<RowAction>[] = notPaired
    ? [
        { name: "pair-again", label: t("common.pair_again") },
        { name: "remove", label: t("common.remove") },
        { name: "refresh", label: t("desktops.refresh") },
      ]
    : [
        { name: "rename", label: t("common.rename") },
        { name: "remove", label: t("common.remove") },
        { name: "refresh", label: t("desktops.refresh") },
      ];

  const handleAction = (name: RowAction) => {
    switch (name) {
      case "rename":
        onRename(desktop, rowRef);
        break;
      case "remove":
        onRemove(desktop, rowRef);
        break;
      case "pair-again":
        onPairAgain(desktop);
        break;
      case "refresh":
        onRefresh();
        break;
    }
  };

  const statusLabel =
    look === null ? undefined : (
      <StatusLabel
        label={t(look.key)}
        indicator={
          look.indicator.kind === "spinner"
            ? { kind: "node", node: <Spinner {...id("spinner")} /> }
            : look.indicator
        }
        {...id("status")}
      />
    );

  const menu = notPaired ? undefined : (
    // The row already offers its actions to the screen reader; the button is
    // their visible way in.
    <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <IconButton
        ref={menuRef}
        icon="ellipsis-vertical"
        role="item"
        color="textSecondary"
        accessibilityLabel={t("desktops.row_menu", { name: desktop.name })}
        onPress={() => onMenu(desktop, menuRef)}
        {...id("menu")}
      />
    </View>
  );

  return (
    <Card {...id("card")}>
      <ListRow<RowAction>
        ref={rowRef}
        title={desktop.name}
        {...(statusLabel === undefined ? {} : { titleEnd: statusLabel })}
        subtitle={detail.text}
        {...(detail.warning ? { subtitleColor: "warningText" as const } : {})}
        leading={<Icon name="monitor" role="row" color="textSecondary" />}
        {...(menu === undefined ? {} : { trailing: menu })}
        accessibilityLabel={rowAccessibilityLabel(desktop, status, nowMs, tr)}
        {...(notPaired ? {} : { accessibilityHint: t("common.open") })}
        accessibilityActions={actions}
        onAccessibilityAction={handleAction}
        {...(notPaired ? {} : { onPress: () => onOpen(desktop), onLongPress: () => onMenu(desktop, rowRef) })}
        {...(testID === undefined ? {} : { testID })}
      />
      {notPaired ? (
        <View style={styles.buttons}>
          <Button
            label={t("common.pair_again")}
            variant="text"
            onPress={() => onPairAgain(desktop)}
            {...id("pair-again")}
          />
          <Button
            ref={removeRef}
            label={t("common.remove")}
            variant="destructiveText"
            accessibilityHint={t("a11y.destructive")}
            onPress={() => onRemove(desktop, removeRef)}
            {...id("remove")}
          />
        </View>
      ) : null}
    </Card>
  );
}

/** A desktop row; re-renders only when its props change. */
export const DesktopRow = memo(DesktopRowView);

const styles = StyleSheet.create({
  buttons: {
    flexDirection: "row",
    columnGap: spacing.buttonGap,
    // The button labels line up with the row's text: row padding, icon and
    // gap, less the button's own padding.
    paddingLeft: spacing.rowPaddingX + icon.row.size + spacing.rowIconGap - spacing.buttonPaddingX,
    paddingRight: space.xs,
    paddingBottom: space.s,
  },
});
