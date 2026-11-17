// SPDX-License-Identifier: GPL-3.0-or-later
// The menu of a group (anatomy §4.12.2, PRD-004 RF-4.8, RF-4.9): a sheet
// titled with the group's name. Items: Rename, Color, Collapse on desktop or
// Expand on desktop (`collapse-group`; "on desktop" sets it apart from the
// app's local expansion, RF-2.8), Move to window… (dimmed with a note when
// the desktop has one window), a divider and Ungroup (destructive, last),
// which asks in the app before sending `ungroup`, since it is hard to undo.
// There is no "Close group" (no such action in the protocol).
//
// Rename, Color and the move open the form sheets through callbacks; the
// collapse and the ungroup are sent from here. The menu closes and then acts;
// the result is handled centrally. While an action on the group awaits its
// result, its item shows the spinner and the others take no touch (RF-4.9).
// If the group leaves the tree, the menu closes.
import { useEffect } from "react";

import { sessionOwner } from "@/controllers/overlay";
import type { Translator } from "@/i18n/catalog";
import type { GroupId } from "@/protocol";
import { collapseGroup, ungroup } from "@/session/actions";
import type { SessionState } from "@/session/sessionStore";
import { shallowEqual, useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import {
  Sheet,
  SheetDivider,
  SheetItem,
  useOverlay,
  type FocusOrigin,
  type OverlayApi,
  type OverlayControls,
} from "@ui/overlay";

import { findGroup } from "../model";
import { itemPendingState, pendingKinds, sendOrWarn, type SheetSession } from "./shared";
import { useRetained } from "./useRetained";

export type GroupMenuProps = {
  readonly session: SheetSession;
  readonly groupId: GroupId;
  /** Open the form sheets (§4.12.3, §4.12.7, §4.12.5); called after the menu starts closing. */
  readonly onRename: (group: GroupId) => void;
  readonly onColor: (group: GroupId) => void;
  readonly onMoveToWindow: (group: GroupId) => void;
  /** The element that opened the menu: the ungroup dialog gives the focus back to it too. */
  readonly origin?: FocusOrigin;
};

export type GroupMenuSheetProps = GroupMenuProps & {
  /** Closes this sheet (from `openSheet`'s controls). */
  readonly close: OverlayControls["close"];
};

/** What the menu shows about its group, from the last tree. */
export type GroupMenuContext = {
  readonly name: string;
  /** Collapsed on the desktop (not the app's local expansion). */
  readonly collapsed: boolean;
  readonly tabCount: number;
  readonly windowCount: number;
};

/** The menu's view of a group; `undefined` when the tree does not have it. */
export function groupMenuContext(
  state: Pick<SessionState, "workspace">,
  groupId: GroupId,
): GroupMenuContext | undefined {
  const { workspace } = state;
  if (workspace === null) {
    return undefined;
  }
  const found = findGroup(workspace, groupId);
  if (found === undefined) {
    return undefined;
  }
  return {
    name: found.group.name,
    collapsed: found.group.collapsed,
    tabCount: found.group.tabs.length,
    windowCount: workspace.windows.length,
  };
}

/** Asks to confirm ungrouping (RF-4.8): Cancel and Ungroup. Returns the dialog id. */
export function openUngroupDialog(
  overlay: OverlayApi,
  tr: Pick<Translator, "t" | "tn">,
  options: {
    readonly desktopId: string;
    readonly name: string;
    readonly tabCount: number;
    readonly onConfirm: () => void;
    readonly origin?: FocusOrigin;
  },
): string {
  return overlay.openDialog({
    title: tr.t("group_menu.ungroup_title", { name: options.name }),
    body: tr.tn("group_menu.ungroup_body", options.tabCount),
    buttons: [
      { label: tr.t("common.cancel"), role: "cancel", testID: "ungroup-cancel" },
      {
        label: tr.t("group_menu.ungroup"),
        variant: "destructiveText",
        onPress: options.onConfirm,
        testID: "ungroup-confirm",
      },
    ],
    owner: sessionOwner(options.desktopId),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
    testID: "ungroup-dialog",
  });
}

/** The group menu's content; opened by {@link openGroupMenu}. */
export function GroupMenuSheet({
  session,
  groupId,
  onRename,
  onColor,
  onMoveToWindow,
  origin,
  close,
}: GroupMenuSheetProps) {
  const tr = useT();
  const { t } = tr;
  const overlay = useOverlay();
  const current = useStoreState(session.store, (state) => groupMenuContext(state, groupId), shallowEqual);
  const requests = useStoreState(session.store, (state) => state.requests);
  const context = useRetained(current);
  const gone = current === undefined;

  useEffect(() => {
    if (gone) {
      close();
    }
  }, [close, gone]);

  if (context === undefined) {
    // Opened for a group the tree does not have: closes at once.
    return <Sheet title="" testID="group-menu" />;
  }

  const kinds = pendingKinds(requests, { kind: "group", id: groupId });

  const hand = (callback: (group: GroupId) => void) => () => {
    close();
    callback(groupId);
  };

  const onCollapse = () => {
    close();
    sendOrWarn(session, overlay, tr, (id) => collapseGroup(id, groupId, !context.collapsed));
  };

  const onUngroup = () => {
    close();
    openUngroupDialog(overlay, tr, {
      desktopId: session.desktopId,
      name: context.name,
      tabCount: context.tabCount,
      onConfirm: () => {
        sendOrWarn(session, overlay, tr, (id) => ungroup(id, groupId));
      },
      ...(origin === undefined ? {} : { origin }),
    });
  };

  const rename = itemPendingState(kinds, "rename-group");
  const color = itemPendingState(kinds, "set-group-color");
  const collapse = itemPendingState(kinds, "collapse-group");
  const moveToWindow = itemPendingState(kinds, "move-group-to-window");
  const ungrouping = itemPendingState(kinds, "ungroup");
  const singleWindow = context.windowCount <= 1;

  return (
    <Sheet title={context.name} testID="group-menu">
      <SheetItem
        label={t("common.rename")}
        icon="pencil"
        onPress={hand(onRename)}
        pending={rename.pending}
        disabled={rename.blocked}
        testID="group-menu-rename"
      />
      <SheetItem
        label={t("group_menu.color")}
        icon="palette"
        onPress={hand(onColor)}
        pending={color.pending}
        disabled={color.blocked}
        testID="group-menu-color"
      />
      <SheetItem
        label={t(context.collapsed ? "group_menu.expand_on_desktop" : "group_menu.collapse_on_desktop")}
        icon={context.collapsed ? "chevrons-up-down" : "chevrons-down-up"}
        onPress={onCollapse}
        pending={collapse.pending}
        disabled={collapse.blocked}
        testID="group-menu-collapse"
      />
      <SheetItem
        label={t("common.move_to_window")}
        icon="app-window"
        onPress={hand(onMoveToWindow)}
        pending={moveToWindow.pending}
        disabled={moveToWindow.blocked || singleWindow}
        {...(singleWindow ? { note: t("tab_menu.single_window_note") } : {})}
        testID="group-menu-move-to-window"
      />
      <SheetDivider testID="group-menu-divider" />
      <SheetItem
        label={t("group_menu.ungroup")}
        icon="ungroup"
        destructive
        onPress={onUngroup}
        pending={ungrouping.pending}
        disabled={ungrouping.blocked}
        testID="group-menu-ungroup"
      />
    </Sheet>
  );
}

/** Opens the menu of a group, owned by its session. Returns the sheet id. */
export function openGroupMenu(overlay: OverlayApi, props: GroupMenuProps): string {
  return overlay.openSheet(({ close }) => <GroupMenuSheet {...props} close={close} />, {
    owner: sessionOwner(props.session.desktopId),
    ...(props.origin === undefined ? {} : { origin: props.origin }),
  });
}
