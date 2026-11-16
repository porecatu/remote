// SPDX-License-Identifier: GPL-3.0-or-later

// Tab search (PRD-002 RF-2.12): title, group name, `cwd` and `user@host`, in
// every window, ignoring case and accents. Pure; nothing here is logged or
// stored, since titles and directories are content.

import type { GroupId, Tab, TabId, WindowId, WorkspaceMessage } from "../protocol";
import { leafPanes } from "./layout";
import { isGroup } from "./selectors";

/** The fields a term can match. */
export type SearchField = "title" | "group" | "cwd" | "remote";

export type SearchHit = {
  readonly tab: TabId;
  readonly window: WindowId;
  readonly group: GroupId | null;
  /** The fields where at least one term matched. */
  readonly fields: readonly SearchField[];
};

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Lower case, accents removed: the form both sides of a comparison take. */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

/** The terms of a query: split on whitespace, normalized, empty ones dropped. */
export function searchTerms(query: string): readonly string[] {
  return normalizeForSearch(query)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * The tabs that match `query`, in visual order, across all windows. Every term
 * has to match at least one field of the tab (AND between terms, OR between
 * fields), so "api prod" finds a tab titled "api" in a group named "prod". An
 * empty query matches nothing here: the screen shows the whole tree instead.
 */
export function searchTabs(workspace: WorkspaceMessage, query: string): readonly SearchHit[] {
  const terms = searchTerms(query);
  if (terms.length === 0) {
    return [];
  }
  const hits: SearchHit[] = [];

  for (const win of workspace.windows) {
    const consider = (
      tab: Tab,
      groupId: GroupId | null,
      groupName: string | null,
    ): void => {
      const haystack: Record<SearchField, readonly string[]> = {
        title: [normalizeForSearch(tab.title)],
        group: groupName === null ? [] : [normalizeForSearch(groupName)],
        cwd: leafPanes(tab.layout).flatMap((p) => (p.cwd === null ? [] : [normalizeForSearch(p.cwd)])),
        remote: tab.remote === null ? [] : [normalizeForSearch(tab.remote)],
      };
      const matched = new Set<SearchField>();
      for (const term of terms) {
        let found = false;
        for (const field of Object.keys(haystack) as SearchField[]) {
          if (haystack[field].some((value) => value.includes(term))) {
            matched.add(field);
            found = true;
          }
        }
        if (!found) {
          return;
        }
      }
      hits.push({ tab: tab.tab, window: win.id, group: groupId, fields: [...matched] });
    };

    for (const t of win.pinned) {
      consider(t, null, null);
    }
    for (const item of win.items) {
      if (isGroup(item)) {
        for (const t of item.tabs) {
          consider(t, item.group, item.name);
        }
      } else {
        consider(item, null, null);
      }
    }
  }
  return hits;
}

/** The ids of the hits, for `RowOptions.onlyTabs`; `null` for an empty query. */
export function searchTabIds(
  workspace: WorkspaceMessage,
  query: string,
): ReadonlySet<TabId> | null {
  if (searchTerms(query).length === 0) {
    return null;
  }
  return new Set(searchTabs(workspace, query).map((h) => h.tab));
}
