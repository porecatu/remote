// SPDX-License-Identifier: GPL-3.0-or-later

import {
  EMPTY_EXPANSION,
  bindHostInstance,
  hostInstanceKey,
  isExpandedLocally,
  reconcileExpansion,
  toggleExpansion,
} from "./expansion";
import { group, tab, win, workspace } from "./testing";

const instanceA = new Uint8Array(16).fill(0xab);
const instanceB = new Uint8Array(16).fill(0x01);

const collapsed = workspace([
  win(1, [group(10, [tab(1)], { collapsed: true }), group(11, [tab(2)], { collapsed: true })]),
]);

describe("hostInstanceKey", () => {
  it("is the hex of the 16 bytes", () => {
    expect(hostInstanceKey(instanceA)).toBe("ab".repeat(16));
    expect(hostInstanceKey(instanceB)).toBe("01".repeat(16));
  });
});

describe("expansion state", () => {
  it("toggles a group open and closed", () => {
    const bound = bindHostInstance(EMPTY_EXPANSION, instanceA);
    const open = toggleExpansion(bound, 10);
    expect(isExpandedLocally(open, 10)).toBe(true);
    expect(isExpandedLocally(open, 11)).toBe(false);
    expect(isExpandedLocally(toggleExpansion(open, 10), 10)).toBe(false);
  });

  it("does not mutate the previous state", () => {
    const bound = bindHostInstance(EMPTY_EXPANSION, instanceA);
    toggleExpansion(bound, 10);
    expect(bound.expanded.size).toBe(0);
  });

  it("keeps the state for the same host instance", () => {
    const open = toggleExpansion(bindHostInstance(EMPTY_EXPANSION, instanceA), 10);
    expect(bindHostInstance(open, new Uint8Array(instanceA))).toBe(open);
  });

  it("drops the state when the desktop restarted (other host instance)", () => {
    const open = toggleExpansion(bindHostInstance(EMPTY_EXPANSION, instanceA), 10);
    const next = bindHostInstance(open, instanceB);
    expect(next.hostInstance).toBe(hostInstanceKey(instanceB));
    expect(isExpandedLocally(next, 10)).toBe(false);
  });
});

describe("reconcileExpansion", () => {
  const open = (ids: number[]) =>
    ids.reduce(
      (s, id) => toggleExpansion(s, id),
      bindHostInstance(EMPTY_EXPANSION, instanceA),
    );

  it("keeps groups that are still collapsed on the desktop", () => {
    const state = open([10, 11]);
    expect(reconcileExpansion(state, collapsed)).toBe(state);
  });

  it("drops a group the desktop opened, so a later collapse closes it here too", () => {
    const desktopOpened = workspace([
      win(1, [group(10, [tab(1)], { collapsed: false }), group(11, [tab(2)], { collapsed: true })]),
    ]);
    const next = reconcileExpansion(open([10, 11]), desktopOpened);
    expect(isExpandedLocally(next, 10)).toBe(false);
    expect(isExpandedLocally(next, 11)).toBe(true);
  });

  it("drops a group that no longer exists", () => {
    const gone = workspace([win(1, [group(11, [tab(2)], { collapsed: true })])]);
    const next = reconcileExpansion(open([10, 11]), gone);
    expect([...next.expanded]).toEqual([11]);
  });

  it("returns the same state when it is empty", () => {
    const empty = bindHostInstance(EMPTY_EXPANSION, instanceA);
    expect(reconcileExpansion(empty, collapsed)).toBe(empty);
  });
});
