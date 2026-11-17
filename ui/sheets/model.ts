// SPDX-License-Identifier: GPL-3.0-or-later
// What the menus, the form sheets and the new tab sheet all look up in the
// last `workspace` (anatomy §4.12): a group with the window it sits in. Pure:
// no React.
import type { Group, GroupId, WindowId, WorkspaceMessage } from "@/protocol";
import { isGroup } from "@/workspace/selectors";

/** A group found in the tree, with the window it sits in. */
export type GroupLocation = {
  readonly group: Group;
  readonly window: WindowId;
};

/** The group with the given id, wherever it is; `undefined` when the tree lost it. */
export function findGroup(workspace: WorkspaceMessage, id: GroupId): GroupLocation | undefined {
  for (const win of workspace.windows) {
    for (const item of win.items) {
      if (isGroup(item) && item.group === id) {
        return { group: item, window: win.id };
      }
    }
  }
  return undefined;
}
