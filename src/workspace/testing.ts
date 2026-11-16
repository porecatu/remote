// SPDX-License-Identifier: GPL-3.0-or-later

// Builders of protocol messages for the tests of this folder. Not imported by
// app code.

import {
  type Group,
  type HostMessage,
  type Message,
  type Pane,
  type PaneNode,
  PaneState,
  type Profiles,
  type SplitDir,
  type Tab,
  type WorkspaceMessage,
  type WorkspaceWindow,
  decodeMessage,
  encodeMessage,
} from "../protocol";

export function pane(id: number, over: Partial<Pane> = {}): Pane {
  return {
    pane: id,
    title: `pane ${id}`,
    cwd: null,
    state: PaneState.running,
    exit: null,
    cols: 80,
    rows: 24,
    ...over,
  };
}

export function tab(id: number, over: Partial<Tab> = {}): Tab {
  return {
    tab: id,
    title: `tab ${id}`,
    custom: false,
    profile: null,
    remote: null,
    activity: false,
    bell: false,
    layout: pane(id * 100),
    focused: id * 100,
    ...over,
  };
}

export function group(id: number, tabs: readonly Tab[], over: Partial<Group> = {}): Group {
  return { group: id, name: `group ${id}`, color: 0, collapsed: false, tabs, ...over };
}

export function win(
  id: number,
  items: WorkspaceWindow["items"],
  over: Partial<WorkspaceWindow> = {},
): WorkspaceWindow {
  return { id, title: `window ${id}`, pinned: [], items, active: null, ...over };
}

export function workspace(
  windows: readonly WorkspaceWindow[],
  rev = 1,
): WorkspaceMessage {
  return { type: "workspace", rev, windows };
}

export function split(
  dir: SplitDir,
  ratio: number,
  first: PaneNode,
  second: PaneNode,
): PaneNode {
  return { dir, ratio, first, second };
}

export const PROFILES: Profiles = {
  type: "profiles",
  list: [
    { id: "default", name: "Default", kind: 0 },
    { id: "prod", name: "Production", kind: 1 },
  ],
  defaultProfile: "default",
};

/** Encodes and decodes a host message, failing the test when it is not valid. */
export function roundTrip(message: HostMessage): Message {
  const result = decodeMessage(encodeMessage(message), "host");
  if (!result.ok) {
    throw new Error("fixture is not a valid message");
  }
  return result.message;
}
