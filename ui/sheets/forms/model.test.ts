// SPDX-License-Identifier: GPL-3.0-or-later
import { defaultGroupColors } from "@ui/theme";

import { allWindowChoices, groupChoices, groupPalette, windowChoices, windowOf } from "./model";
import { tab, win, workspace } from "@/workspace/testing";
import { formsTheme, formsWorkspace } from "../testing";

describe("groupChoices", () => {
  it("lists the groups of the tab's window and its current group", () => {
    expect(groupChoices(formsWorkspace(), 3)).toEqual({
      current: 10,
      groups: [
        { group: 10, name: "Servers", color: 1, tabCount: 2 },
        { group: 11, name: "Build", color: 0, tabCount: 1 },
      ],
    });
  });

  it("has no current group for a loose tab", () => {
    expect(groupChoices(formsWorkspace(), 2)?.current).toBeNull();
  });

  it("does not list the groups of other windows", () => {
    expect(groupChoices(formsWorkspace(), 6)).toEqual({ current: null, groups: [] });
  });

  it("is undefined for a tab the tree lost", () => {
    expect(groupChoices(formsWorkspace(), 99)).toBeUndefined();
  });
});

describe("windowChoices", () => {
  it("lists the other windows of a tab, by active tab title, with the tab count", () => {
    expect(windowChoices(formsWorkspace(), { kind: "tab", id: 3 })).toEqual([
      { window: 2, title: "htop", tabCount: 1 },
      { window: 3, title: "logs", tabCount: 2 },
    ]);
  });

  it("leaves out the window of a group", () => {
    expect(windowChoices(formsWorkspace(), { kind: "group", id: 12 })?.map((w) => w.window)).toEqual([1, 2]);
    expect(windowOf(formsWorkspace(), { kind: "group", id: 12 })).toBe(3);
  });

  it("counts pinned tabs", () => {
    expect(windowChoices(formsWorkspace(), { kind: "tab", id: 6 })?.[0]).toEqual({
      window: 1,
      title: "zsh",
      tabCount: 5,
    });
  });

  it("is undefined for a target the tree lost", () => {
    expect(windowChoices(formsWorkspace(), { kind: "group", id: 99 })).toBeUndefined();
  });
});

describe("allWindowChoices", () => {
  it("lists every window, the first one included, in the order received", () => {
    expect(allWindowChoices(formsWorkspace())).toEqual([
      { window: 1, title: "zsh", tabCount: 5 },
      { window: 2, title: "htop", tabCount: 1 },
      { window: 3, title: "logs", tabCount: 2 },
    ]);
  });

  it("lists the only window of a desktop with one", () => {
    expect(allWindowChoices(workspace([win(1, [tab(2)], { title: "zsh", active: 2 })]))).toEqual([
      { window: 1, title: "zsh", tabCount: 1 },
    ]);
  });
});

describe("groupPalette", () => {
  it("uses the desktop colors, else the six of the desktop", () => {
    expect(groupPalette(formsTheme())).toEqual([0xef8a8a, 0xe0b060, 0x5ed3bc]);
    expect(groupPalette(null)).toBe(defaultGroupColors);
    expect(groupPalette({ groupColors: [] })).toBe(defaultGroupColors);
  });
});
