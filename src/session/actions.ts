// SPDX-License-Identifier: GPL-3.0-or-later

// Builders of the 14 actions of spec 03 §7 (PRD-004). Each one returns the
// `ClientMessage` of type `action` with the request id the caller allocated;
// nothing here touches the network or a clock. `targetsOf` tells which items
// an action affects, so the tracker can mark them "in progress" (RF-4.9).

import type {
  Action,
  ActionBody,
  GroupId,
  PaneId,
  ProfileId,
  RequestId,
  SessionId,
  TabId,
  WindowId,
} from "@/protocol";

export type ActionKind = ActionBody["type"];

/** An item of the tree an action affects (RF-4.9). */
export type ItemRef =
  | { readonly kind: "window"; readonly id: WindowId }
  | { readonly kind: "group"; readonly id: GroupId }
  | { readonly kind: "tab"; readonly id: TabId }
  | { readonly kind: "pane"; readonly id: PaneId };

/** Stable string key of an item, for maps and sets. */
export function itemKey(item: ItemRef): string {
  return `${item.kind}:${item.id}`;
}

function wrap(id: RequestId, body: ActionBody): Action {
  return { type: "action", id, do: body };
}

export interface NewTabOptions {
  /**
   * Absent: the desktop picks the place (the group of its active tab). A group
   * id: the end of that group. `null`: a loose tab, outside any group, at the
   * end of the track (spec 0.7).
   */
  readonly group?: GroupId | null;
  readonly profile?: ProfileId;
}

/**
 * `new-tab`: without `group` the desktop picks the place; with an id, the end
 * of the group; with `null`, a loose tab at the end of the track.
 */
export function newTab(id: RequestId, window: WindowId, options: NewTabOptions = {}): Action {
  return wrap(id, {
    type: "new-tab",
    window,
    ...(options.group !== undefined ? { group: options.group } : {}),
    ...(options.profile !== undefined ? { profile: options.profile } : {}),
  });
}

export function closeTab(id: RequestId, tab: TabId): Action {
  return wrap(id, { type: "close-tab", tab });
}

export function closePane(id: RequestId, pane: PaneId): Action {
  return wrap(id, { type: "close-pane", pane });
}

/** `title: null` clears the custom title ("restore automatic title", RF-4.3). */
export function renameTab(id: RequestId, tab: TabId, title: string | null): Action {
  return wrap(id, { type: "rename-tab", tab, title });
}

/** `group: null` takes the tab out of its group. */
export function moveTabToGroup(id: RequestId, tab: TabId, group: GroupId | null): Action {
  return wrap(id, { type: "move-tab-to-group", tab, group });
}

export function moveTabToWindow(id: RequestId, tab: TabId, window: WindowId): Action {
  return wrap(id, { type: "move-tab-to-window", tab, window });
}

/**
 * `new-group` needs at least one tab (`[+ tab-id]`); the same-window and
 * not-pinned rules are the host's to enforce (`invalid-argument`).
 */
export function newGroup(
  id: RequestId,
  tabs: readonly TabId[],
  name: string,
  color?: number,
): Action {
  if (tabs.length === 0) {
    throw new RangeError("new-group needs at least one tab");
  }
  return wrap(id, {
    type: "new-group",
    tabs: [...tabs],
    name,
    ...(color !== undefined ? { color } : {}),
  });
}

export function renameGroup(id: RequestId, group: GroupId, name: string): Action {
  return wrap(id, { type: "rename-group", group, name });
}

export function setGroupColor(id: RequestId, group: GroupId, color: number): Action {
  return wrap(id, { type: "set-group-color", group, color });
}

export function collapseGroup(id: RequestId, group: GroupId, collapsed: boolean): Action {
  return wrap(id, { type: "collapse-group", group, collapsed });
}

export function moveGroupToWindow(id: RequestId, group: GroupId, window: WindowId): Action {
  return wrap(id, { type: "move-group-to-window", group, window });
}

export function ungroup(id: RequestId, group: GroupId): Action {
  return wrap(id, { type: "ungroup", group });
}

export function startPane(id: RequestId, pane: PaneId): Action {
  return wrap(id, { type: "start-pane", pane });
}

/**
 * `restore-session` (RF-4.12 to RF-4.16): without `window` the desktop opens
 * the saved session in a new window; with it, appends it to that window.
 */
export function restoreSession(id: RequestId, session: SessionId, window?: WindowId): Action {
  return wrap(id, {
    type: "restore-session",
    session,
    ...(window !== undefined ? { window } : {}),
  });
}

/**
 * The items an action affects, which show a pending indicator and refuse
 * another action until the `action-result` (RF-4.9). `new-tab` marks the group
 * when there is one, the window otherwise (a loose `null` tab included); moves
 * mark only the moved item;
 * `restore-session` marks the window it appends to, and nothing when it opens
 * a new one.
 */
export function targetsOf(body: ActionBody): readonly ItemRef[] {
  switch (body.type) {
    case "new-tab":
      return body.group !== undefined && body.group !== null
        ? [{ kind: "group", id: body.group }]
        : [{ kind: "window", id: body.window }];
    case "close-tab":
    case "rename-tab":
    case "move-tab-to-group":
    case "move-tab-to-window":
      return [{ kind: "tab", id: body.tab }];
    case "close-pane":
    case "start-pane":
      return [{ kind: "pane", id: body.pane }];
    case "new-group":
      return body.tabs.map((tab): ItemRef => ({ kind: "tab", id: tab }));
    case "restore-session":
      return body.window !== undefined ? [{ kind: "window", id: body.window }] : [];
    case "rename-group":
    case "set-group-color":
    case "collapse-group":
    case "move-group-to-window":
    case "ungroup":
      return [{ kind: "group", id: body.group }];
  }
}
