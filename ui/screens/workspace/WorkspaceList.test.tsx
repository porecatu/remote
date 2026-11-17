// SPDX-License-Identifier: GPL-3.0-or-later
import { renameTab } from "@/session/actions";
import { createRequestsState, trackAction } from "@/session/requests";
import { buildRows } from "@/workspace/selectors";
import { group, pane, split, tab, win, workspace } from "@/workspace/testing";

import { pendingItemKeys, searchMatches, workspaceItems, type WorkspaceItem } from "./WorkspaceList";

const NONE = new Set<number>();

function kinds(items: readonly WorkspaceItem[]): string[] {
  return items.map((item) => (item.kind === "section" ? `section:${item.section}` : item.key));
}

describe("workspaceItems (§4.5.2)", () => {
  it("lays one window out with no header: pinned, track, New tab", () => {
    const ws = workspace([
      win(1, [tab(1), group(10, [tab(2), tab(3)])], { pinned: [tab(4)] }),
    ]);
    const items = workspaceItems(ws, buildRows(ws), { collapsedWindows: NONE, searching: false });
    expect(kinds(items)).toEqual(["section:pinned", "t:4", "section:trail", "t:1", "g:10", "n:1"]);
    const groupItem = items.find((item) => item.kind === "group");
    expect(groupItem?.kind === "group" ? groupItem.tabs.map((entry) => entry.tab.tab) : []).toEqual([2, 3]);
  });

  it("labels no section without pinned tabs, and separates cards by the list gap", () => {
    const ws = workspace([win(1, [tab(1), tab(2)])]);
    const items = workspaceItems(ws, buildRows(ws), { collapsedWindows: NONE, searching: false });
    expect(kinds(items)).toEqual(["t:1", "t:2", "n:1"]);
    expect(items.map((item) => ("gapBefore" in item ? item.gapBefore : null))).toEqual([false, true, true]);
  });

  it("numbers the windows and hides a collapsed one's content", () => {
    const ws = workspace([win(1, [tab(1)]), win(2, [tab(2)])]);
    const items = workspaceItems(ws, buildRows(ws), { collapsedWindows: new Set([1]), searching: false });
    expect(kinds(items)).toEqual(["w:1", "w:2", "t:2", "n:2"]);
    expect(items[1]?.kind === "window" ? items[1].number : 0).toBe(2);
    expect(items[0]?.kind === "window" ? items[0].first : false).toBe(true);
  });

  it("says a window is empty and still offers New tab", () => {
    const ws = workspace([win(1, [])]);
    expect(kinds(workspaceItems(ws, buildRows(ws), { collapsedWindows: NONE, searching: false }))).toEqual([
      "e:1",
      "n:1",
    ]);
  });

  it("while searching opens every section and drops New tab and windows with no hit", () => {
    const ws = workspace([win(1, [tab(1)]), win(2, [tab(2)])]);
    const rows = buildRows(ws, { onlyTabs: new Set([2]) });
    expect(kinds(workspaceItems(ws, rows, { collapsedWindows: new Set([2]), searching: true }))).toEqual([
      "w:2",
      "t:2",
    ]);
  });
});

describe("searchMatches (§4.5.3)", () => {
  it("shows user@host, or the cwd that matched, on line 2", () => {
    const ws = workspace([
      win(1, [
        tab(1, { title: "api", remote: "deploy@srv" }),
        tab(2, {
          title: "build",
          layout: split(0, 32768, pane(200, { cwd: "/home" }), pane(201, { cwd: "/srv/app" })),
          focused: 200,
        }),
        tab(3, { title: "srv notes" }),
      ]),
    ]);
    const matches = searchMatches(ws, "srv");
    expect(matches.get(1)).toEqual({ text: "deploy@srv", query: "srv" });
    expect(matches.get(2)).toEqual({ text: "/srv/app", query: "srv" });
    // A title match keeps the usual line 2.
    expect(matches.has(3)).toBe(false);
  });
});

describe("pendingItemKeys (RF-4.9)", () => {
  it("lists the items an action waits on", () => {
    const requests = trackAction(createRequestsState(), renameTab(1, 7, "x"), 0);
    expect(pendingItemKeys(requests).has("tab:7")).toBe(true);
    expect(pendingItemKeys(createRequestsState()).size).toBe(0);
  });
});
