// SPDX-License-Identifier: GPL-3.0-or-later
// What the rows of the workspace tree show, derived from the selectors' data
// (anatomy §4.5.2, PRD-002 RF-2.6 to RF-2.9): the left indicator of a tab,
// the composed screen reader labels, the section rule, the group color and the
// bold segments of a search match. The state chip of a tab is shared with the
// terminal (ui/model/tabState.ts). Pure: no React.
import type { Translator } from "@/i18n/catalog";
import { PaneState as PaneStates, type Rgb, type Theme } from "@/protocol";
import { groupColor, hasManyPanes, type TabView } from "@/workspace/selectors";
import { normalizeForSearch, searchTerms } from "@/workspace/search";
import { tabStateText } from "@ui/model/tabState";
import { defaultGroupColors } from "@ui/theme";

/**
 * The one indicator at the left of a tab row: the bell wins over activity, and
 * an exited tab shows neither, like the desktop (§4.5.2).
 */
export function tabIndicator(tab: Pick<TabView, "bell" | "activity" | "state">): "bell" | "activity" | null {
  if (tab.state === PaneStates.exited) {
    return null;
  }
  if (tab.bell) {
    return "bell";
  }
  return tab.activity ? "activity" : null;
}

/** Line 2 of a tab row: `user@host` on an SSH tab, else the focused pane's `cwd`. */
export function tabDetail(tab: Pick<TabView, "remote" | "cwd">): string | null {
  return tab.remote ?? tab.cwd;
}

/**
 * The composed label of a tab row (§4.5.2, accessibility of the screen):
 * title, "tab", pinned, state, panes, bell or activity, active on the
 * desktop, in that order; then what the row also shows (profile, line 2).
 * The pending mark is added by the row.
 */
export function tabAccessibilityLabel(tab: TabView, tr: Translator, detail: string | null = tabDetail(tab)): string {
  const parts: string[] = [tab.title, tr.t("workspace.tab_word")];
  if (tab.zone === "pinned") {
    parts.push(tr.t("workspace.pinned_tab"));
  }
  parts.push(tabStateText(tab.state, tab.exit, tr));
  if (hasManyPanes(tab)) {
    parts.push(tr.tn("workspace.pane_count", tab.paneCount));
  }
  const indicator = tabIndicator(tab);
  if (indicator === "bell") {
    parts.push(tr.t("workspace.bell"));
  } else if (indicator === "activity") {
    parts.push(tr.t("workspace.activity"));
  }
  if (tab.active) {
    parts.push(tr.t("workspace.active_on_desktop"));
  }
  if (tab.profileBadge !== null) {
    parts.push(tab.profileBadge);
  }
  if (detail !== null && detail.length > 0) {
    parts.push(detail);
  }
  return parts.join(tr.t("a11y.separator"));
}

/** What a group header needs for its label. */
export type GroupLabelInput = {
  readonly name: string;
  readonly tabCount: number;
  readonly desktopCollapsed: boolean;
  readonly collapsed: boolean;
};

/**
 * The composed label of a group header (§4.5.2): name, "group", tab count and,
 * only for a group collapsed on the desktop, whether it is still collapsed or
 * expanded only on this device. The color is not read (the protocol sends RGB
 * with no name).
 */
export function groupAccessibilityLabel(group: GroupLabelInput, tr: Translator): string {
  const parts = [group.name, tr.t("workspace.group_word"), tr.tn("workspace.tab_count", group.tabCount)];
  if (group.desktopCollapsed) {
    parts.push(tr.t(group.collapsed ? "workspace.collapsed_on_desktop" : "workspace.expanded_locally"));
  }
  return parts.join(tr.t("a11y.separator"));
}

/** The label of a window header: "Window N", its active tab's title, the tab count. */
export function windowAccessibilityLabel(
  window: { readonly number: number; readonly title: string; readonly tabCount: number },
  tr: Translator,
): string {
  const parts = [tr.t("workspace.window", { number: window.number })];
  if (window.title.length > 0) {
    parts.push(window.title);
  }
  parts.push(tr.tn("workspace.tab_count", window.tabCount));
  return parts.join(tr.t("a11y.separator"));
}

/** Which section labels a window shows (§4.5.2 items 3 and 4). */
export type WindowSections = {
  /** "Pinned": whenever the window has pinned tabs. */
  readonly pinned: boolean;
  /** "Track": only to separate it from the pinned block, so only with both. */
  readonly trail: boolean;
};

/** The section rule: "Pinned" with pinned tabs; "Track" only after a pinned block. */
export function windowSections(counts: { readonly pinned: number; readonly track: number }): WindowSections {
  const pinned = counts.pinned > 0;
  return { pinned, trail: pinned && counts.track > 0 };
}

/**
 * The color of a group: the desktop `theme.group_colors` entry, or the default
 * palette when the theme has not arrived or has no such entry (§2.2). It is
 * only ever a stripe, a dot, a swatch or a tint, never text.
 */
export function resolveGroupColor(theme: Pick<Theme, "groupColors"> | null, index: number): Rgb {
  const fromTheme = groupColor(theme, index);
  if (fromTheme !== null) {
    return fromTheme;
  }
  const palette = theme !== null && theme.groupColors.length > 0 ? theme.groupColors : defaultGroupColors;
  const wrapped = ((index % palette.length) + palette.length) % palette.length;
  return palette[wrapped] ?? defaultGroupColors[0] ?? 0;
}

/** A piece of a text, marked when a search term matched it. */
export type TextSegment = { readonly text: string; readonly match: boolean };

/**
 * Splits `text` into the pieces a search query matched and the rest, comparing
 * like the search does (case and accents ignored, §4.5.3), so line 2 can show
 * the matched part in bold.
 */
export function matchSegments(text: string, query: string): readonly TextSegment[] {
  const terms = searchTerms(query);
  const chars = Array.from(text);
  if (terms.length === 0 || chars.length === 0) {
    return chars.length === 0 ? [] : [{ text, match: false }];
  }
  // Normalized text, with the index of the original character of each unit.
  let normalized = "";
  const owner: number[] = [];
  chars.forEach((char, index) => {
    const unit = normalizeForSearch(char);
    normalized += unit;
    for (let k = 0; k < unit.length; k += 1) {
      owner.push(index);
    }
  });
  const marked = chars.map(() => false);
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = normalized.indexOf(term, from);
      if (at === -1) {
        break;
      }
      for (let k = at; k < at + term.length; k += 1) {
        const index = owner[k];
        if (index !== undefined) {
          marked[index] = true;
        }
      }
      from = at + 1;
    }
  }
  const segments: TextSegment[] = [];
  chars.forEach((char, index) => {
    const match = marked[index] === true;
    const last = segments[segments.length - 1];
    if (last !== undefined && last.match === match) {
      segments[segments.length - 1] = { text: last.text + char, match };
    } else {
      segments.push({ text: char, match });
    }
  });
  return segments;
}
