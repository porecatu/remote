// SPDX-License-Identifier: GPL-3.0-or-later

// Group expansion that lives only in the app (PRD-002 RF-2.8). The desktop
// says whether a group is collapsed; the user may open it here without
// touching the desktop. The state is only valid for the same `host_instance`:
// ids restart with the desktop, so a new instance drops it. Never persisted.

import type { GroupId, WorkspaceMessage } from "../protocol";
import { isGroup } from "./selectors";

export type ExpansionState = {
  /** Hex of the `host_instance` the ids belong to; `null` before the welcome. */
  readonly hostInstance: string | null;
  /** Groups the user opened in the app although the desktop has them collapsed. */
  readonly expanded: ReadonlySet<GroupId>;
};

export const EMPTY_EXPANSION: ExpansionState = {
  hostInstance: null,
  expanded: new Set(),
};

/** Hex of the 16 bytes of `host_instance`, to compare and key by. */
export function hostInstanceKey(hostInstance: Uint8Array): string {
  let out = "";
  for (const byte of hostInstance) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Binds the state to the desktop instance of the session. The same instance
 * keeps the state; a different one (the desktop restarted) starts empty,
 * because its group ids mean other groups.
 */
export function bindHostInstance(state: ExpansionState, hostInstance: Uint8Array): ExpansionState {
  const key = hostInstanceKey(hostInstance);
  return state.hostInstance === key ? state : { hostInstance: key, expanded: new Set() };
}

/** Whether the user opened the group in the app. */
export function isExpandedLocally(state: ExpansionState, group: GroupId): boolean {
  return state.expanded.has(group);
}

/** Opens or closes the local override of one group. */
export function toggleExpansion(state: ExpansionState, group: GroupId): ExpansionState {
  const expanded = new Set(state.expanded);
  if (!expanded.delete(group)) {
    expanded.add(group);
  }
  return { ...state, expanded };
}

/**
 * Drops what the new tree made meaningless: groups that no longer exist, and
 * groups the desktop now shows open (a later collapse on the desktop must
 * collapse them here too). Returns the same object when nothing changes.
 */
export function reconcileExpansion(
  state: ExpansionState,
  workspace: WorkspaceMessage,
): ExpansionState {
  if (state.expanded.size === 0) {
    return state;
  }
  const collapsedOnDesktop = new Set<GroupId>();
  for (const win of workspace.windows) {
    for (const item of win.items) {
      if (isGroup(item) && item.collapsed) {
        collapsedOnDesktop.add(item.group);
      }
    }
  }
  const expanded = new Set([...state.expanded].filter((g) => collapsedOnDesktop.has(g)));
  return expanded.size === state.expanded.size ? state : { ...state, expanded };
}
