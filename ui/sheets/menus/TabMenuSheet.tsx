// SPDX-License-Identifier: GPL-3.0-or-later
// The menu of a tab (anatomy §4.12.1, PRD-004 RF-4.2, RF-4.6, RF-4.9): a
// sheet titled with the tab's title, with "In group G · Window N" under it,
// opened by the long press or the menu button of a tree row and by the
// terminal bar. Items, in the anatomy's order: Rename, Move to group…, Move
// to window… (dimmed with a note when the desktop has one window), New group
// with this tab…, a divider, Close pane (only from the terminal, on a tab
// with more than one pane, for the pane seen there) and Close tab
// (destructive, last). A pinned tab shows only Rename and Close tab; closing
// it sends `close-tab` at once, and the only confirmation is the desktop's
// (`confirm-request`, spec 03 §7), whose dialog says the tab gets unpinned.
//
// Rename and the moves open the form sheets through callbacks; closing is
// sent from here. The menu closes and then acts; the result of the action
// (`action-result`, `confirm-request`) is handled centrally. While an action
// awaits its result, its item shows the spinner and the others of the same
// tab take no touch (RF-4.9). If the tab leaves the tree, the menu closes.
import { useEffect } from "react";

import { sessionOwner } from "@/controllers/overlay";
import type { Translator } from "@/i18n/catalog";
import type { PaneId, TabId } from "@/protocol";
import { closePane, closeTab } from "@/session/actions";
import type { SessionState } from "@/session/sessionStore";
import { findPaneOwner, findTab, groupOfTab } from "@/workspace/selectors";
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

import { itemPendingState, pendingKinds, sendOrWarn, windowNumber, type SheetSession } from "./shared";
import { useRetained } from "./useRetained";

export type TabMenuProps = {
  readonly session: SheetSession;
  readonly tabId: TabId;
  /** Opened from the terminal, which shows this pane: Close pane applies to it. */
  readonly fromTerminal?: { readonly paneId: PaneId };
  /** Open the form sheets (§4.12.3 to §4.12.6); called after the menu starts closing. */
  readonly onRename: (tab: TabId) => void;
  readonly onMoveToGroup: (tab: TabId) => void;
  readonly onMoveToWindow: (tab: TabId) => void;
  readonly onNewGroup: (tab: TabId) => void;
  /** The element that opened the menu: it gets the focus back when the menu closes. */
  readonly origin?: FocusOrigin;
};

export type TabMenuSheetProps = TabMenuProps & {
  /** Closes this sheet (from `openSheet`'s controls). */
  readonly close: OverlayControls["close"];
};

/** What the menu shows about its tab, from the last tree. */
export type TabMenuContext = {
  readonly title: string;
  readonly pinned: boolean;
  readonly paneCount: number;
  /** "Window N", from 1. */
  readonly windowNumber: number;
  readonly windowCount: number;
  /** The name of the tab's group; `null` for a loose or pinned tab. */
  readonly groupName: string | null;
  /** The pane the terminal shows (`fromTerminal`) still belongs to this tab. */
  readonly viewedPaneInTab: boolean;
};

/** The menu's view of a tab; `undefined` when the tree does not have it. */
export function tabMenuContext(
  state: Pick<SessionState, "workspace" | "profiles">,
  tabId: TabId,
  viewedPane?: PaneId,
): TabMenuContext | undefined {
  const { workspace } = state;
  if (workspace === null) {
    return undefined;
  }
  const tab = findTab(workspace, tabId, state.profiles);
  if (tab === undefined) {
    return undefined;
  }
  return {
    title: tab.title,
    pinned: tab.zone === "pinned",
    paneCount: tab.paneCount,
    windowNumber: windowNumber(workspace, tab.window),
    windowCount: workspace.windows.length,
    groupName: tab.group === null ? null : (groupOfTab(workspace, tabId)?.name ?? null),
    viewedPaneInTab: viewedPane !== undefined && findPaneOwner(workspace, viewedPane)?.tab === tabId,
  };
}

/**
 * The line under the title: "In group G · Window N", or "In group G" when the
 * desktop has a single window; "Window N" for a tab out of a group, nothing
 * when that would only say "Window 1" of the only window.
 */
export function tabMenuSubtitle(context: TabMenuContext, tr: Pick<Translator, "t">): string | undefined {
  const manyWindows = context.windowCount > 1;
  if (context.groupName !== null) {
    return manyWindows
      ? tr.t("tab_menu.subtitle_group_window", { group: context.groupName, number: context.windowNumber })
      : tr.t("tab_menu.subtitle_group", { group: context.groupName });
  }
  return manyWindows ? tr.t("workspace.window", { number: context.windowNumber }) : undefined;
}

/** The tab menu's content; opened by {@link openTabMenu}. */
export function TabMenuSheet({
  session,
  tabId,
  fromTerminal,
  onRename,
  onMoveToGroup,
  onMoveToWindow,
  onNewGroup,
  close,
}: TabMenuSheetProps) {
  const tr = useT();
  const { t } = tr;
  const overlay = useOverlay();
  const viewedPane = fromTerminal?.paneId;
  const current = useStoreState(
    session.store,
    (state) => tabMenuContext(state, tabId, viewedPane),
    shallowEqual,
  );
  const requests = useStoreState(session.store, (state) => state.requests);
  const context = useRetained(current);
  const gone = current === undefined;

  useEffect(() => {
    if (gone) {
      close();
    }
  }, [close, gone]);

  if (context === undefined) {
    // Opened for a tab the tree does not have: closes at once.
    return <Sheet title="" testID="tab-menu" />;
  }

  const tabKinds = pendingKinds(requests, { kind: "tab", id: tabId });
  const paneKinds =
    viewedPane === undefined ? new Set<never>() : pendingKinds(requests, { kind: "pane", id: viewedPane });
  const subtitle = tabMenuSubtitle(context, tr);

  const hand = (callback: (tab: TabId) => void) => () => {
    close();
    callback(tabId);
  };

  // A pinned tab too: the desktop asks for the confirmation (`confirm-request`).
  const onCloseTab = () => {
    close();
    sendOrWarn(session, overlay, tr, (id) => closeTab(id, tabId));
  };

  const onClosePane = () => {
    if (viewedPane === undefined) {
      return;
    }
    close();
    sendOrWarn(session, overlay, tr, (id) => closePane(id, viewedPane));
  };

  const rename = itemPendingState(tabKinds, "rename-tab");
  const moveToGroup = itemPendingState(tabKinds, "move-tab-to-group");
  const moveToWindow = itemPendingState(tabKinds, "move-tab-to-window");
  const newGroup = itemPendingState(tabKinds, "new-group");
  const closingTab = itemPendingState(tabKinds, "close-tab");
  const closingPane = itemPendingState(paneKinds, "close-pane");
  const singleWindow = context.windowCount <= 1;
  const showClosePane =
    !context.pinned && fromTerminal !== undefined && context.paneCount > 1 && context.viewedPaneInTab;

  return (
    <Sheet title={context.title} {...(subtitle === undefined ? {} : { subtitle })} testID="tab-menu">
      <SheetItem
        label={t("common.rename")}
        icon="pencil"
        onPress={hand(onRename)}
        pending={rename.pending}
        disabled={rename.blocked}
        testID="tab-menu-rename"
      />
      {context.pinned ? null : (
        <>
          <SheetItem
            label={t("tab_menu.move_to_group")}
            icon="folder-input"
            onPress={hand(onMoveToGroup)}
            pending={moveToGroup.pending}
            disabled={moveToGroup.blocked}
            testID="tab-menu-move-to-group"
          />
          <SheetItem
            label={t("common.move_to_window")}
            icon="app-window"
            onPress={hand(onMoveToWindow)}
            pending={moveToWindow.pending}
            disabled={moveToWindow.blocked || singleWindow}
            {...(singleWindow ? { note: t("tab_menu.single_window_note") } : {})}
            testID="tab-menu-move-to-window"
          />
          <SheetItem
            label={t("tab_menu.new_group")}
            icon="folder-plus"
            onPress={hand(onNewGroup)}
            pending={newGroup.pending}
            disabled={newGroup.blocked}
            testID="tab-menu-new-group"
          />
        </>
      )}
      <SheetDivider testID="tab-menu-divider" />
      {showClosePane ? (
        <SheetItem
          label={t("common.close_pane")}
          icon="panel-top-close"
          onPress={onClosePane}
          pending={closingPane.pending}
          disabled={closingPane.blocked}
          testID="tab-menu-close-pane"
        />
      ) : null}
      <SheetItem
        label={t("common.close_tab")}
        icon="x"
        destructive
        onPress={onCloseTab}
        pending={closingTab.pending}
        disabled={closingTab.blocked}
        testID="tab-menu-close-tab"
      />
    </Sheet>
  );
}

/** Opens the menu of a tab, owned by its session. Returns the sheet id. */
export function openTabMenu(overlay: OverlayApi, props: TabMenuProps): string {
  return overlay.openSheet(({ close }) => <TabMenuSheet {...props} close={close} />, {
    owner: sessionOwner(props.session.desktopId),
    ...(props.origin === undefined ? {} : { origin: props.origin }),
  });
}
