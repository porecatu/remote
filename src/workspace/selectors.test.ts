// SPDX-License-Identifier: GPL-3.0-or-later

import { PaneState, SplitDir } from "../protocol";
import {
  allTabs,
  buildRows,
  collectIds,
  diffWorkspaceIds,
  findPaneOwner,
  findTab,
  groupColor,
  groupOfTab,
  hasManyPanes,
  reuseRows,
  tabView,
  windowTabs,
} from "./selectors";
import { PROFILES, group, pane, roundTrip, split, tab, win, workspace } from "./testing";

const ws = workspace([
  win(
    1,
    [
      tab(3),
      group(10, [tab(4), tab(5)], { collapsed: true }),
      group(11, [tab(6)]),
    ],
    { pinned: [tab(1), tab(2)], active: 4 },
  ),
  win(2, [tab(7)], { active: 7 }),
]);

describe("buildRows", () => {
  it("is valid on the wire", () => {
    expect(roundTrip(ws)).toEqual(ws);
  });

  it("lists windows, pinned tabs, then the track in the desktop order", () => {
    const rows = buildRows(ws, { onlyTabs: null });
    expect(rows.map((r) => r.key)).toEqual([
      "w:1",
      "t:1",
      "t:2",
      "t:3",
      "g:10",
      "g:11",
      "t:6",
      "w:2",
      "t:7",
    ]);
  });

  it("hides the window header when the desktop has one window", () => {
    const one = workspace([ws.windows[0]!]);
    expect(buildRows(one).some((r) => r.kind === "window")).toBe(false);
  });

  it("shows a collapsed group closed, with its tab count", () => {
    const row = buildRows(ws).find((r) => r.kind === "group" && r.group === 10);
    expect(row).toMatchObject({ collapsed: true, desktopCollapsed: true, tabCount: 2 });
  });

  it("opens a group the user expanded in the app, without changing the desktop flag", () => {
    const rows = buildRows(ws, { expandedGroups: new Set([10]) });
    expect(rows.map((r) => r.key)).toContain("t:4");
    expect(rows.find((r) => r.kind === "group" && r.group === 10)).toMatchObject({
      collapsed: false,
      desktopCollapsed: true,
    });
  });

  it("marks group members as indented and loose tabs as not", () => {
    const rows = buildRows(ws);
    const inGroup = rows.filter((r) => r.kind === "tab" && r.inGroup).map((r) => r.key);
    expect(inGroup).toEqual(["t:6"]);
  });

  it("filters to the search hits and opens the groups that have one", () => {
    const rows = buildRows(ws, { onlyTabs: new Set([5, 7]) });
    expect(rows.map((r) => r.key)).toEqual(["w:1", "g:10", "t:5", "w:2", "t:7"]);
    expect(rows.find((r) => r.kind === "group")).toMatchObject({ collapsed: false });
  });

  it("drops a window without hits when filtering", () => {
    const rows = buildRows(ws, { onlyTabs: new Set([7]) });
    expect(rows.map((r) => r.key)).toEqual(["w:2", "t:7"]);
  });
});

describe("tab state", () => {
  it("derives state, exit and cwd from the focused pane, not the first", () => {
    const layout = split(
      SplitDir.sideBySide,
      32768,
      pane(1, { state: PaneState.running, cwd: "/a" }),
      pane(2, { state: PaneState.exited, exit: 3, cwd: "/b" }),
    );
    const w = win(1, [tab(1, { layout, focused: 2 })]);
    const view = tabView(w.items[0] as ReturnType<typeof tab>, w, "track", null);
    expect(view).toMatchObject({ state: PaneState.exited, exit: 3, cwd: "/b", paneCount: 2 });
    expect(hasManyPanes(view)).toBe(true);
  });

  it("follows the focus when it moves to the other pane", () => {
    const layout = split(
      SplitDir.stacked,
      32768,
      pane(1, { state: PaneState.connecting }),
      pane(2, { state: PaneState.awaitingDesktop }),
    );
    const t = tab(1, { layout, focused: 1 });
    const w = win(1, [t]);
    expect(tabView(t, w, "track", null).state).toBe(PaneState.connecting);
    expect(tabView({ ...t, focused: 2 }, w, "track", null).state).toBe(PaneState.awaitingDesktop);
  });

  it("falls back to the first pane when the focused id is not in the tree", () => {
    const t = tab(1, { layout: pane(9, { state: PaneState.reconnecting }), focused: 99 });
    expect(tabView(t, win(1, [t]), "track", null).state).toBe(PaneState.reconnecting);
  });

  it("marks only the window's active tab", () => {
    const views = windowTabs(ws.windows[0]!);
    expect(views.filter((v) => v.active).map((v) => v.tab)).toEqual([4]);
  });

  it("carries remote, flags and zone", () => {
    const t = tab(1, { remote: "root@host", bell: true, activity: true, custom: true });
    const w = win(1, [], { pinned: [t] });
    expect(windowTabs(w)[0]).toMatchObject({
      remote: "root@host",
      bell: true,
      activity: true,
      custom: true,
      zone: "pinned",
      group: null,
    });
  });
});

describe("profile badge", () => {
  const w = win(1, []);

  it("is absent for the default profile and for no profile", () => {
    expect(tabView(tab(1, { profile: "default" }), w, "track", null, PROFILES).profileBadge).toBeNull();
    expect(tabView(tab(1, { profile: null }), w, "track", null, PROFILES).profileBadge).toBeNull();
  });

  it("is the profile name when it is not the default", () => {
    expect(tabView(tab(1, { profile: "prod" }), w, "track", null, PROFILES).profileBadge).toBe(
      "Production",
    );
  });

  it("falls back to the id of an unknown profile and to nothing without profiles", () => {
    expect(tabView(tab(1, { profile: "zzz" }), w, "track", null, PROFILES).profileBadge).toBe("zzz");
    expect(tabView(tab(1, { profile: "prod" }), w, "track", null, null).profileBadge).toBeNull();
  });
});

describe("lookups", () => {
  it("lists every tab of the workspace in visual order", () => {
    expect(allTabs(ws).map((t) => t.tab)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("finds a tab, its group and its pane owner", () => {
    expect(findTab(ws, 5)).toMatchObject({ window: 1, group: 10 });
    expect(findTab(ws, 99)).toBeUndefined();
    expect(groupOfTab(ws, 6)?.group).toBe(11);
    expect(groupOfTab(ws, 3)).toBeUndefined();
    expect(findPaneOwner(ws, 700)).toEqual({ window: 2, tab: 7 });
    expect(findPaneOwner(ws, 1)).toBeUndefined();
  });

  it("resolves a group color by index, null when out of range", () => {
    const theme = { groupColors: [0xff0000, 0x00ff00] };
    expect(groupColor(theme, 1)).toBe(0x00ff00);
    expect(groupColor(theme, 2)).toBeNull();
    expect(groupColor(null, 0)).toBeNull();
  });
});

describe("reuseRows", () => {
  it("keeps the identity of rows that did not change", () => {
    const before = buildRows(ws);
    const renamed = workspace([
      win(1, [tab(3, { title: "renamed" }), ...ws.windows[0]!.items.slice(1)], {
        pinned: ws.windows[0]!.pinned,
        active: 4,
      }),
      ws.windows[1]!,
    ]);
    const after = reuseRows(before, buildRows(renamed));
    const changed = after.filter((row, i) => row !== before[i]).map((r) => r.key);
    expect(changed).toEqual(["t:3"]);
  });

  it("returns the previous array when nothing changed", () => {
    const before = buildRows(ws);
    expect(reuseRows(before, buildRows(ws))).toBe(before);
  });
});

describe("id diff", () => {
  it("collects the ids of every kind", () => {
    const ids = collectIds(ws);
    expect([...ids.windows]).toEqual([1, 2]);
    expect([...ids.groups]).toEqual([10, 11]);
    expect([...ids.tabs].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ids.panes.has(700)).toBe(true);
  });

  it("reports what left and what entered, by kind", () => {
    const next = workspace(
      [win(1, [tab(3), group(11, [tab(6), tab(8)])], { pinned: [tab(1)] })],
      2,
    );
    const diff = diffWorkspaceIds(ws, next);
    expect([...diff.windowsRemoved]).toEqual([2]);
    expect([...diff.groupsRemoved]).toEqual([10]);
    expect([...diff.tabsRemoved].sort()).toEqual([2, 4, 5, 7]);
    expect([...diff.tabsAdded]).toEqual([8]);
    expect([...diff.panesAdded]).toEqual([800]);
    expect(diff.windowsAdded.size).toBe(0);
  });

  it("does not count a tab that moved between windows as removed", () => {
    const next = workspace([
      win(1, [tab(3)], { pinned: [tab(1), tab(2)] }),
      win(2, [tab(7), tab(4), tab(5), group(10, [tab(6)])]),
    ]);
    const diff = diffWorkspaceIds(ws, next);
    expect(diff.tabsRemoved.size).toBe(0);
    expect(diff.tabsAdded.size).toBe(0);
  });

  it("detects a pane that vanished inside a tab that stayed", () => {
    const two = split(SplitDir.sideBySide, 32768, pane(1), pane(2));
    const before = workspace([win(1, [tab(1, { layout: two, focused: 1 })])]);
    const after = workspace([win(1, [tab(1, { layout: pane(1), focused: 1 })])], 2);
    const diff = diffWorkspaceIds(before, after);
    expect([...diff.panesRemoved]).toEqual([2]);
    expect(diff.tabsRemoved.size).toBe(0);
  });

  it("treats everything as added against no previous tree", () => {
    const diff = diffWorkspaceIds(null, ws);
    expect(diff.tabsAdded.size).toBe(7);
    expect(diff.tabsRemoved.size).toBe(0);
  });
});
