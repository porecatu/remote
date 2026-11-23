// SPDX-License-Identifier: GPL-3.0-or-later

import { decodeMessage, encodeMessage, type Action } from "@/protocol";
import {
  closePane,
  closeTab,
  collapseGroup,
  itemKey,
  moveGroupToWindow,
  moveTabToGroup,
  moveTabToWindow,
  newGroup,
  newTab,
  renameGroup,
  renameTab,
  restoreSession,
  setGroupColor,
  startPane,
  targetsOf,
  ungroup,
} from "./actions";

/** Every action must survive the codec as a valid client message. */
function roundTrip(action: Action): void {
  const decoded = decodeMessage(encodeMessage(action), "client");
  expect(decoded.ok).toBe(true);
  if (decoded.ok) {
    expect(decoded.message).toEqual(action);
  }
}

describe("action builders", () => {
  const all: readonly Action[] = [
    newTab(1, 10),
    newTab(2, 10, { group: 3, profile: "auto:wsl" }),
    newTab(21, 10, { group: null }),
    newTab(22, 10, { group: null, profile: "auto:wsl" }),
    closeTab(3, 20),
    closePane(4, 30),
    renameTab(5, 20, "build"),
    renameTab(6, 20, null),
    moveTabToGroup(7, 20, 3),
    moveTabToGroup(8, 20, null),
    moveTabToWindow(9, 20, 11),
    newGroup(10, [20, 21], "servers"),
    newGroup(11, [20], "servers", 2),
    renameGroup(12, 3, "ops"),
    setGroupColor(13, 3, 4),
    collapseGroup(14, 3, true),
    moveGroupToWindow(15, 3, 11),
    ungroup(16, 3),
    startPane(17, 30),
    restoreSession(18, 7),
    restoreSession(19, 7, 11),
  ];

  it("covers the 14 action kinds of the spec", () => {
    const kinds = new Set(all.map((action) => action.do.type));
    expect(kinds.size).toBe(14);
  });

  it("builds valid wire messages", () => {
    all.forEach(roundTrip);
  });

  it("carries the request id and the body", () => {
    expect(newTab(42, 1)).toEqual({ type: "action", id: 42, do: { type: "new-tab", window: 1 } });
    // `null` is a loose tab and has to reach the wire (absent means something else).
    expect(newTab(43, 1, { group: null }).do).toEqual({ type: "new-tab", window: 1, group: null });
    expect(renameTab(1, 2, null).do).toEqual({ type: "rename-tab", tab: 2, title: null });
    expect(moveTabToGroup(1, 2, null).do).toEqual({
      type: "move-tab-to-group",
      tab: 2,
      group: null,
    });
  });

  it("leaves optional keys out instead of sending undefined", () => {
    expect(newTab(1, 5).do).not.toHaveProperty("group");
    expect(newTab(1, 5).do).not.toHaveProperty("profile");
    expect(newGroup(1, [3], "g").do).not.toHaveProperty("color");
    expect(restoreSession(1, 7).do).not.toHaveProperty("window");
  });

  it("builds restore-session with and without a window", () => {
    expect(restoreSession(5, 7).do).toEqual({ type: "restore-session", session: 7 });
    expect(restoreSession(5, 7, 11).do).toEqual({ type: "restore-session", session: 7, window: 11 });
  });

  it("copies the tab list of new-group", () => {
    const tabs = [1, 2];
    const action = newGroup(1, tabs, "g");
    tabs.push(3);
    expect(action.do).toEqual({ type: "new-group", tabs: [1, 2], name: "g" });
  });

  it("refuses a new-group without tabs", () => {
    expect(() => newGroup(1, [], "g")).toThrow(RangeError);
  });
});

describe("targetsOf", () => {
  const keys = (action: Action) => targetsOf(action.do).map(itemKey);

  it("marks the tab of tab actions", () => {
    expect(keys(closeTab(1, 7))).toEqual(["tab:7"]);
    expect(keys(renameTab(1, 7, "x"))).toEqual(["tab:7"]);
    expect(keys(moveTabToGroup(1, 7, 2))).toEqual(["tab:7"]);
    expect(keys(moveTabToWindow(1, 7, 2))).toEqual(["tab:7"]);
  });

  it("marks the pane of pane actions", () => {
    expect(keys(closePane(1, 9))).toEqual(["pane:9"]);
    expect(keys(startPane(1, 9))).toEqual(["pane:9"]);
  });

  it("marks the group of group actions", () => {
    expect(keys(renameGroup(1, 4, "x"))).toEqual(["group:4"]);
    expect(keys(setGroupColor(1, 4, 1))).toEqual(["group:4"]);
    expect(keys(collapseGroup(1, 4, false))).toEqual(["group:4"]);
    expect(keys(moveGroupToWindow(1, 4, 2))).toEqual(["group:4"]);
    expect(keys(ungroup(1, 4))).toEqual(["group:4"]);
  });

  it("marks every tab of new-group", () => {
    expect(keys(newGroup(1, [5, 6, 7], "g"))).toEqual(["tab:5", "tab:6", "tab:7"]);
  });

  it("marks the group of new-tab when there is one, the window otherwise", () => {
    expect(keys(newTab(1, 2))).toEqual(["window:2"]);
    expect(keys(newTab(1, 2, { group: 8 }))).toEqual(["group:8"]);
    expect(keys(newTab(1, 2, { group: null }))).toEqual(["window:2"]);
  });

  it("marks the window restore-session appends to, and nothing for a new window", () => {
    expect(keys(restoreSession(1, 7, 3))).toEqual(["window:3"]);
    expect(keys(restoreSession(1, 7))).toEqual([]);
  });
});
