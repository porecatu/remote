// SPDX-License-Identifier: GPL-3.0-or-later

// Selectors over the last `workspace` message (spec 03 section 4.1, PRD-002).
// They turn the tree the desktop sent into the flat, ordered list of rows the
// workspace screen shows. Pure: no React, no store, no I/O.

import {
  type Group,
  type GroupId,
  type PaneId,
  PaneState,
  type Profiles,
  type Rgb,
  type Tab,
  type TabId,
  type Theme,
  type WindowId,
  type WorkspaceMessage,
  type WorkspaceWindow,
} from "../protocol";
import { findPane, leafPanes, paneCount } from "./layout";

/** Where a tab sits in its window: the pinned zone or the track. */
export type TabZone = "pinned" | "track";

/** A tab with everything the row needs already derived. */
export type TabView = {
  readonly tab: TabId;
  readonly window: WindowId;
  /** The group the tab belongs to, `null` for pinned and loose tabs. */
  readonly group: GroupId | null;
  readonly zone: TabZone;
  readonly title: string;
  /** True when the user chose the title (it does not follow the shell). */
  readonly custom: boolean;
  /** `user@host` of an SSH tab; `null` on local ones. */
  readonly remote: string | null;
  /** The profile name to show as a badge, `null` for the default profile. */
  readonly profileBadge: string | null;
  readonly activity: boolean;
  readonly bell: boolean;
  /** True for the tab that is active in its window on the desktop. */
  readonly active: boolean;
  /** State of the focused pane (spec 03 section 4.1). */
  readonly state: PaneState;
  /** Exit code of the focused pane when `state` is `exited`. */
  readonly exit: number | null;
  /** Working directory of the focused pane. */
  readonly cwd: string | null;
  readonly paneCount: number;
  readonly focusedPane: PaneId;
};

export type WindowRow = {
  readonly kind: "window";
  readonly key: string;
  readonly window: WindowId;
  /** Title of the window's active tab, as sent by the desktop. */
  readonly title: string;
  readonly tabCount: number;
};

export type GroupRow = {
  readonly kind: "group";
  readonly key: string;
  readonly window: WindowId;
  readonly group: GroupId;
  readonly name: string;
  /** Index into `theme.groupColors`. */
  readonly color: number;
  /** What the desktop says. */
  readonly desktopCollapsed: boolean;
  /** What the screen shows: the desktop flag, unless expanded in the app. */
  readonly collapsed: boolean;
  readonly tabCount: number;
};

export type TabRow = {
  readonly kind: "tab";
  readonly key: string;
  readonly tab: TabView;
  /** True when the row is indented under a group header. */
  readonly inGroup: boolean;
};

export type WorkspaceRow = WindowRow | GroupRow | TabRow;

export type RowOptions = {
  /** The last `profiles` message; without it no badge is shown. */
  readonly profiles?: Profiles | null;
  /** Groups the user expanded in the app (see `expansion.ts`). */
  readonly expandedGroups?: ReadonlySet<GroupId>;
  /**
   * Search result: when set, only these tabs are listed, and a group that has
   * a hit is shown open whatever its collapsed state.
   */
  readonly onlyTabs?: ReadonlySet<TabId> | null;
};

/** A group item has the key `group`; a tab has `tab`. */
export function isGroup(item: Tab | Group): item is Group {
  return "group" in item;
}

/** The pane that gives the tab its state: the focused one, else the first. */
function statePane(tab: Tab) {
  return findPane(tab.layout, tab.focused) ?? leafPanes(tab.layout)[0];
}

function profileBadge(tab: Tab, profiles: Profiles | null | undefined): string | null {
  if (tab.profile === null || profiles == null) {
    return null;
  }
  if (tab.profile === profiles.defaultProfile) {
    return null;
  }
  const known = profiles.list.find((p) => p.id === tab.profile);
  return known ? known.name : tab.profile;
}

/** Everything a row shows about one tab; the state comes from the focused pane. */
export function tabView(
  tab: Tab,
  win: WorkspaceWindow,
  zone: TabZone,
  group: GroupId | null,
  profiles?: Profiles | null,
): TabView {
  const pane = statePane(tab);
  return {
    tab: tab.tab,
    window: win.id,
    group,
    zone,
    title: tab.title,
    custom: tab.custom,
    remote: tab.remote,
    profileBadge: profileBadge(tab, profiles),
    activity: tab.activity,
    bell: tab.bell,
    active: win.active === tab.tab,
    // A tree always has a leaf; the fallbacks only keep a malformed tree from
    // throwing.
    state: pane ? pane.state : PaneState.notStarted,
    exit: pane ? pane.exit : null,
    cwd: pane ? pane.cwd : null,
    paneCount: paneCount(tab.layout),
    focusedPane: tab.focused,
  };
}

/** Every tab of a window in visual order: pinned zone first, then the track. */
export function windowTabs(
  win: WorkspaceWindow,
  profiles?: Profiles | null,
): readonly TabView[] {
  const out: TabView[] = win.pinned.map((t) => tabView(t, win, "pinned", null, profiles));
  for (const item of win.items) {
    if (isGroup(item)) {
      for (const t of item.tabs) {
        out.push(tabView(t, win, "track", item.group, profiles));
      }
    } else {
      out.push(tabView(item, win, "track", null, profiles));
    }
  }
  return out;
}

/** Every tab of the workspace, window by window, in visual order. */
export function allTabs(
  workspace: WorkspaceMessage,
  profiles?: Profiles | null,
): readonly TabView[] {
  return workspace.windows.flatMap((w) => windowTabs(w, profiles));
}

/**
 * The flat list the screen shows: for each window, its header (only when the
 * desktop has more than one window, PRD-002 RF-2.6), the pinned tabs, then
 * the track in order, with each group's header followed by its tabs unless it
 * is collapsed (RF-2.7, RF-2.8).
 */
export function buildRows(
  workspace: WorkspaceMessage,
  options: RowOptions = {},
): readonly WorkspaceRow[] {
  const { profiles = null, expandedGroups, onlyTabs = null } = options;
  const showWindows = workspace.windows.length > 1;
  const rows: WorkspaceRow[] = [];

  for (const win of workspace.windows) {
    const body: WorkspaceRow[] = [];

    for (const t of win.pinned) {
      if (onlyTabs === null || onlyTabs.has(t.tab)) {
        body.push(tabRow(tabView(t, win, "pinned", null, profiles), false));
      }
    }

    for (const item of win.items) {
      if (!isGroup(item)) {
        if (onlyTabs === null || onlyTabs.has(item.tab)) {
          body.push(tabRow(tabView(item, win, "track", null, profiles), false));
        }
        continue;
      }
      const hits = onlyTabs === null ? item.tabs : item.tabs.filter((t) => onlyTabs.has(t.tab));
      if (hits.length === 0) {
        continue;
      }
      const collapsed =
        onlyTabs === null && item.collapsed && !(expandedGroups?.has(item.group) ?? false);
      body.push({
        kind: "group",
        key: `g:${item.group}`,
        window: win.id,
        group: item.group,
        name: item.name,
        color: item.color,
        desktopCollapsed: item.collapsed,
        collapsed,
        tabCount: item.tabs.length,
      });
      if (!collapsed) {
        for (const t of hits) {
          body.push(tabRow(tabView(t, win, "track", item.group, profiles), true));
        }
      }
    }

    if (onlyTabs !== null && body.length === 0) {
      continue;
    }
    if (showWindows) {
      rows.push({
        kind: "window",
        key: `w:${win.id}`,
        window: win.id,
        title: win.title,
        tabCount: win.pinned.length + win.items.reduce((n, i) => n + (isGroup(i) ? i.tabs.length : 1), 0),
      });
    }
    rows.push(...body);
  }
  return rows;
}

function tabRow(tab: TabView, inGroup: boolean): TabRow {
  return { kind: "tab", key: `t:${tab.tab}`, tab, inGroup };
}

function shallowEqual(a: object, b: object): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) {
    return false;
  }
  const ar = a as Record<string, unknown>;
  const br = b as Record<string, unknown>;
  return ak.every((k) => {
    const av = ar[k];
    const bv = br[k];
    if (av !== null && bv !== null && typeof av === "object" && typeof bv === "object") {
      return shallowEqual(av, bv);
    }
    return av === bv;
  });
}

/**
 * Keeps the object identity of every row that did not change since `prev`, so
 * a list that compares by reference re-renders only the rows that changed
 * (PRD-002, "Riscos"). Rows are matched by `key`.
 */
export function reuseRows(
  prev: readonly WorkspaceRow[],
  next: readonly WorkspaceRow[],
): readonly WorkspaceRow[] {
  const old = new Map(prev.map((r) => [r.key, r] as const));
  let identical = prev.length === next.length;
  const out = next.map((row, i) => {
    const before = old.get(row.key);
    const kept = before !== undefined && shallowEqual(before, row) ? before : row;
    if (prev[i] !== kept) {
      identical = false;
    }
    return kept;
  });
  return identical ? prev : out;
}

/** A tab found in the tree, with the place it sits in. */
export type TabLocation = TabView;

/** The tab with the given id, wherever it is; `undefined` when the tree lost it. */
export function findTab(
  workspace: WorkspaceMessage,
  id: TabId,
  profiles?: Profiles | null,
): TabLocation | undefined {
  for (const win of workspace.windows) {
    for (const t of windowTabs(win, profiles)) {
      if (t.tab === id) {
        return t;
      }
    }
  }
  return undefined;
}

/** The tab and window that own a pane, or `undefined` when no tab has it. */
export function findPaneOwner(
  workspace: WorkspaceMessage,
  pane: PaneId,
): { readonly window: WindowId; readonly tab: TabId } | undefined {
  for (const win of workspace.windows) {
    for (const t of tabsOf(win)) {
      if (findPane(t.layout, pane) !== undefined) {
        return { window: win.id, tab: t.tab };
      }
    }
  }
  return undefined;
}

/** The raw tabs of a window in visual order. */
export function tabsOf(win: WorkspaceWindow): readonly Tab[] {
  return [...win.pinned, ...win.items.flatMap((i) => (isGroup(i) ? i.tabs : [i]))];
}

/** The group a tab belongs to in its window, if any. */
export function groupOfTab(workspace: WorkspaceMessage, id: TabId): Group | undefined {
  for (const win of workspace.windows) {
    for (const item of win.items) {
      if (isGroup(item) && item.tabs.some((t) => t.tab === id)) {
        return item;
      }
    }
  }
  return undefined;
}

/** The color of a group from the desktop theme; `null` when out of range. */
export function groupColor(theme: Pick<Theme, "groupColors"> | null, index: number): Rgb | null {
  if (theme === null) {
    return null;
  }
  return theme.groupColors[index] ?? null;
}

/** True for a tab with more than one pane: the row shows the count (RF-2.10). */
export function hasManyPanes(tab: TabView): boolean {
  return tab.paneCount > 1;
}

/** The ids present in a tree, by kind. */
export type WorkspaceIds = {
  readonly windows: ReadonlySet<WindowId>;
  readonly groups: ReadonlySet<GroupId>;
  readonly tabs: ReadonlySet<TabId>;
  readonly panes: ReadonlySet<PaneId>;
};

/** Collects every window, group, tab and pane id of a tree. */
export function collectIds(workspace: WorkspaceMessage): WorkspaceIds {
  const windows = new Set<WindowId>();
  const groups = new Set<GroupId>();
  const tabs = new Set<TabId>();
  const panes = new Set<PaneId>();
  for (const win of workspace.windows) {
    windows.add(win.id);
    for (const item of win.items) {
      if (isGroup(item)) {
        groups.add(item.group);
      }
    }
    for (const t of tabsOf(win)) {
      tabs.add(t.tab);
      for (const p of leafPanes(t.layout)) {
        panes.add(p.pane);
      }
    }
  }
  return { windows, groups, tabs, panes };
}

/** What changed between two trees, by id. A tab moved between windows is neither. */
export type WorkspaceIdDiff = {
  readonly windowsRemoved: ReadonlySet<WindowId>;
  readonly windowsAdded: ReadonlySet<WindowId>;
  readonly groupsRemoved: ReadonlySet<GroupId>;
  readonly groupsAdded: ReadonlySet<GroupId>;
  readonly tabsRemoved: ReadonlySet<TabId>;
  readonly tabsAdded: ReadonlySet<TabId>;
  readonly panesRemoved: ReadonlySet<PaneId>;
  readonly panesAdded: ReadonlySet<PaneId>;
};

function minus<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): ReadonlySet<T> {
  return new Set([...a].filter((x) => !b.has(x)));
}

/**
 * Ids that left and ids that entered between two `workspace` messages of the
 * same desktop instance, so the screen can tell whether the open tab or pane
 * still exists (PRD-002 RF-2.11). With `prev === null` everything is added.
 * Across two `host_instance`s the diff means nothing: ids restart.
 */
export function diffWorkspaceIds(
  prev: WorkspaceMessage | null,
  next: WorkspaceMessage,
): WorkspaceIdDiff {
  const before = prev === null ? collectIds({ type: "workspace", rev: 0, windows: [] }) : collectIds(prev);
  const after = collectIds(next);
  return {
    windowsRemoved: minus(before.windows, after.windows),
    windowsAdded: minus(after.windows, before.windows),
    groupsRemoved: minus(before.groups, after.groups),
    groupsAdded: minus(after.groups, before.groups),
    tabsRemoved: minus(before.tabs, after.tabs),
    tabsAdded: minus(after.tabs, before.tabs),
    panesRemoved: minus(before.panes, after.panes),
    panesAdded: minus(after.panes, before.panes),
  };
}
