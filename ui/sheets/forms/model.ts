// SPDX-License-Identifier: GPL-3.0-or-later
// What the form sheets of tabs and groups list, derived from the last
// `workspace` and `theme` (anatomy §4.12.4 to §4.12.7, PRD-004 RF-4.4,
// RF-4.5, RF-4.7, RF-4.8): the groups a tab can move to, the windows a tab or
// a group can move to, and the group palette. Pure: no React.
import type { GroupId, Rgb, TabId, Theme, WindowId, WorkspaceMessage } from "@/protocol";
import { findTab, groupOfTab, isGroup, tabsOf } from "@/workspace/selectors";
import { defaultGroupColors } from "@ui/theme";

import { findGroup } from "../model";

/** A line of "Move to group" (§4.12.4): a group of the tab's window. */
export type GroupChoice = {
  readonly group: GroupId;
  readonly name: string;
  /** Index into the group palette. */
  readonly color: number;
  readonly tabCount: number;
};

/** What "Move to group" offers a tab: the groups of its window, and the one it is in. */
export type GroupChoices = {
  /** The tab's group; `null` when it is loose ("No group" is the current line). */
  readonly current: GroupId | null;
  /** The groups of the tab's window, in the order of the track. */
  readonly groups: readonly GroupChoice[];
};

/** The groups of the window of a tab (§4.12.4); `undefined` when the tree lost the tab. */
export function groupChoices(workspace: WorkspaceMessage, tab: TabId): GroupChoices | undefined {
  const location = findTab(workspace, tab);
  if (location === undefined) {
    return undefined;
  }
  const win = workspace.windows.find((candidate) => candidate.id === location.window);
  const groups: GroupChoice[] = [];
  for (const item of win?.items ?? []) {
    if (isGroup(item)) {
      groups.push({ group: item.group, name: item.name, color: item.color, tabCount: item.tabs.length });
    }
  }
  return { current: groupOfTab(workspace, tab)?.group ?? null, groups };
}

/** What a "Move to window" sheet moves: a tab or a whole group. */
export type MoveTarget =
  | { readonly kind: "tab"; readonly id: TabId }
  | { readonly kind: "group"; readonly id: GroupId };

/** A line of "Move to window" (§4.12.5): another window, named by its active tab. */
export type WindowChoice = {
  readonly window: WindowId;
  /** The title of the window's active tab, as the desktop sends it. */
  readonly title: string;
  readonly tabCount: number;
};

/** The window a tab or group sits in; `undefined` when the tree lost it. */
export function windowOf(workspace: WorkspaceMessage, target: MoveTarget): WindowId | undefined {
  return target.kind === "tab"
    ? findTab(workspace, target.id)?.window
    : findGroup(workspace, target.id)?.window;
}

/**
 * The windows a tab or group can move to (§4.12.5): every window but its own,
 * in the order received; there is no "new window" in v1. `undefined` when the
 * tree lost the target.
 */
export function windowChoices(
  workspace: WorkspaceMessage,
  target: MoveTarget,
): readonly WindowChoice[] | undefined {
  const origin = windowOf(workspace, target);
  if (origin === undefined) {
    return undefined;
  }
  return workspace.windows
    .filter((win) => win.id !== origin)
    .map((win) => ({ window: win.id, title: win.title, tabCount: tabsOf(win).length }));
}

/**
 * The colors a group can take (§4.12.6, §4.12.7): the desktop's
 * `group_colors`, or the six of the desktop when the theme brings none. The
 * index in this list is the `color` the actions send.
 */
export function groupPalette(theme: Pick<Theme, "groupColors"> | null): readonly Rgb[] {
  return theme !== null && theme.groupColors.length > 0 ? theme.groupColors : defaultGroupColors;
}
