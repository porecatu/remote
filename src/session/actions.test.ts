// SPDX-License-Identifier: GPL-3.0-or-later

import { decodeMessage, encodeMessage, type Action } from "@/protocol";
import {
  activateTab,
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
    activateTab(18, 20),
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
    expect(renameTab(1, 2, null).do).toEqual({ type: "rename-tab", tab: 2, title: null });
    expect(moveTabToGroup(1, 2, null).do).toEqual({
      type: "move-tab-to-group",
      tab: 2,
      group: null,
    });
    expect(activateTab(7, 20)).toEqual({
      type: "action",
      id: 7,
      do: { type: "activate-tab", tab: 20 },
    });
  });

  it("leaves optional keys out instead of sending undefined", () => {
    expect(newTab(1, 5).do).not.toHaveProperty("group");
    expect(newTab(1, 5).do).not.toHaveProperty("profile");
    expect(newGroup(1, [3], "g").do).not.toHaveProperty("color");
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

  it("marks nothing for activate-tab, so it never shows as pending", () => {
    expect(keys(activateTab(1, 7))).toEqual([]);
  });

  it("marks every tab of new-group", () => {
    expect(keys(newGroup(1, [5, 6, 7], "g"))).toEqual(["tab:5", "tab:6", "tab:7"]);
  });

  it("marks the group of new-tab when there is one, the window otherwise", () => {
    expect(keys(newTab(1, 2))).toEqual(["window:2"]);
    expect(keys(newTab(1, 2, { group: 8 }))).toEqual(["group:8"]);
  });
});
