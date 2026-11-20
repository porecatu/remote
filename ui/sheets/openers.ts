// SPDX-License-Identifier: GPL-3.0-or-later
// The menus and the new tab sheet, already bound to the form sheets (anatomy
// §4.12; PRD-004 RF-4.1, RF-4.6): the screens open a tab's or a group's menu
// with one call, and each item of the menu opens its form (Rename → the
// rename sheet, Move to group… → the group list, and so on). The workspace
// tree and the terminal bar (with `fromTerminal`, for Close pane) share them.
// Every sheet belongs to the session (`session:<desktopId>`), so it closes
// when the session ends. No React here: plain calls on the overlay API.
import type { GroupId, PaneId, TabId, WindowId } from "@/protocol";
import type { SessionStore } from "@/session/sessionStore";
import type { FocusOrigin, OverlayApi } from "@ui/overlay";

import {
  openGroupColorSheet,
  openMoveTabToGroupSheet,
  openMoveToWindowSheet,
  openNewGroupSheet,
  openRenameGroupSheet,
  openRenameTabSheet,
  openSavedSessionsSheet,
} from "./forms";
import { type TerminalViewOptions, openGroupMenu, openTabMenu } from "./menus";
import { openNewTabSheet } from "./NewTabSheet";

/** What every opener takes besides its target. */
export type OpenerBase = {
  readonly session: SessionStore;
  /** The element that opened the menu: the menu, its dialogs and its forms give the focus back to it. */
  readonly origin?: FocusOrigin;
};

export type TabMenuOpener = OpenerBase & {
  readonly tabId: TabId;
  /**
   * Opened from the terminal, which shows this pane: the menu offers Close pane
   * for it, and, with `view`, the grid's view options first (§4.7, §4.12.1).
   */
  readonly fromTerminal?: { readonly paneId: PaneId; readonly view?: TerminalViewOptions };
};

export type GroupMenuOpener = OpenerBase & {
  readonly groupId: GroupId;
};

export type NewTabOpener = OpenerBase & {
  readonly windowId: WindowId;
  /** From a group's "New tab" row: the tab is born at the end of this group. */
  readonly groupId?: GroupId;
};

function withOrigin(origin: FocusOrigin | undefined): { readonly origin?: FocusOrigin } {
  return origin === undefined ? {} : { origin };
}

/**
 * Opens the menu of a tab (§4.12.1) with its items bound to the forms:
 * Rename, Move to group…, Move to window… and New group with this tab….
 * Closing (tab or pane) is sent by the menu itself. Returns the menu's id.
 */
export function openTabMenuFor(overlay: OverlayApi, options: TabMenuOpener): string {
  const { session, tabId, fromTerminal, origin } = options;
  const from = withOrigin(origin);
  return openTabMenu(overlay, {
    session,
    tabId,
    ...(fromTerminal === undefined ? {} : { fromTerminal }),
    ...from,
    onRename: (tab) => {
      openRenameTabSheet(overlay, { session, tabId: tab, ...from });
    },
    onMoveToGroup: (tab) => {
      openMoveTabToGroupSheet(overlay, { session, tabId: tab, ...from });
    },
    onMoveToWindow: (tab) => {
      openMoveToWindowSheet(overlay, { session, target: { kind: "tab", id: tab }, ...from });
    },
    onNewGroup: (tab) => {
      openNewGroupSheet(overlay, { session, tabId: tab, ...from });
    },
  });
}

/**
 * Opens the menu of a group (§4.12.2) with its items bound to the forms:
 * Rename, Color and Move to window…. Collapse, expand, ungroup and close are
 * sent by the menu itself. Returns the menu's id.
 */
export function openGroupMenuFor(overlay: OverlayApi, options: GroupMenuOpener): string {
  const { session, groupId, origin } = options;
  const from = withOrigin(origin);
  return openGroupMenu(overlay, {
    session,
    groupId,
    ...from,
    onRename: (group) => {
      openRenameGroupSheet(overlay, { session, groupId: group, ...from });
    },
    onColor: (group) => {
      openGroupColorSheet(overlay, { session, groupId: group, ...from });
    },
    onMoveToWindow: (group) => {
      openMoveToWindowSheet(overlay, { session, target: { kind: "group", id: group }, ...from });
    },
  });
}

/**
 * Opens the new tab sheet (§4.12.8) for a window or, with `groupId`, for a
 * group. The tab the desktop creates is opened by the session overlays
 * (`SessionOverlays`), not here. Returns the sheet's id.
 */
export function openNewTabFor(overlay: OverlayApi, options: NewTabOpener): string {
  const { session, windowId, groupId, origin } = options;
  return openNewTabSheet(overlay, {
    session,
    windowId,
    ...(groupId === undefined ? {} : { groupId }),
    ...withOrigin(origin),
  });
}

/**
 * Opens the saved sessions sheet (§4.12.10) of the desktop: the list, and for
 * `append` the choice of window. The restored tabs show up in the tree with
 * the next `workspace`; nothing opens in the terminal. Returns the sheet's id.
 */
export function openSavedSessionsFor(overlay: OverlayApi, options: OpenerBase): string {
  const { session, origin } = options;
  return openSavedSessionsSheet(overlay, { session, ...withOrigin(origin) });
}
