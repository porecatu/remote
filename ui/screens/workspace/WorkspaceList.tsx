// SPDX-License-Identifier: GPL-3.0-or-later
// The tree of the workspace as one scrolling list (anatomy §4.5.2, §4.5.3;
// PRD-002 RF-2.6 to RF-2.12; PRD-004 RF-4.1, RF-4.6, RF-4.9):
// - windows as collapsible sections, in the order received; with one window
//   there is no header and its content fills the list;
// - in each window, "Pinned" over the pinned tabs, "Track" over the groups
//   and loose tabs only when there are pinned tabs to separate them from;
// - each group is one item (its card holds its tab rows and "New tab"); a
//   loose tab is its own card; "New tab" closes each window, and a window
//   that came with no tabs says so;
// - while searching, only what matched, in its window and its group, with
//   every section open and no "New tab"; a match on `cwd` or `user@host`
//   shows that text on line 2 with the matched part in bold;
// - live: rows are rebuilt from each `workspace` but keep their identity when
//   unchanged (`reuseRows`), so only the rows that changed draw again; the
//   position stays anchored on the first visible row
//   (`maintainVisibleContentPosition`); rows enter, leave and move in 150 ms,
//   with no motion when the system asks to reduce it;
// - read-only while the connection is down (§4.5.4): no menu and no "New
//   tab"; a row still opens its tab, which acts on nothing on the desktop.
// The list keeps no state of its own: the screen passes the data and the
// callbacks.
import { forwardRef, memo, useEffect, useMemo, useRef, type ReactNode } from "react";
import { StyleSheet, Text, type FlatList, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

import type { GroupId, Profiles, Tab, TabId, Theme, WindowId, WorkspaceMessage } from "@/protocol";
import { itemKey } from "@/session/actions";
import type { RequestsState } from "@/session/requests";
import { leafPanes } from "@/workspace/layout";
import { type SearchField as SearchHitField, searchTabIds, searchTabs } from "@/workspace/search";
import {
  type GroupRow,
  type TabView,
  type WindowRow,
  type WorkspaceRow,
  buildRows,
  reuseRows,
  tabsOf,
} from "@/workspace/selectors";
import { useT } from "@ui/i18n/LocaleProvider";
import type { FocusOrigin } from "@ui/overlay";
import { duration, spacing, typeStyle, useReducedMotion, useTheme } from "@ui/theme";

import {
  GroupCard,
  NewTabRow,
  SectionHeader,
  TabRow,
  WindowHeader,
  matchSegments,
  resolveGroupColor,
  windowSections,
  type TabRowMatch,
  type WindowSection,
} from "./rows";

// ----------------------------------------------------------------- items

/** A tab shown in the list, with the search match on its line 2. */
export type TabEntry = {
  readonly tab: TabView;
  readonly match: TabRowMatch | null;
};

/** One item of the list. Cards are separated by `list.gap`. */
export type WorkspaceItem =
  | {
      readonly kind: "window";
      readonly key: string;
      readonly row: WindowRow;
      /** N of "Window N": the position in the order received, from 1. */
      readonly number: number;
      readonly collapsed: boolean;
      readonly first: boolean;
    }
  | { readonly kind: "section"; readonly key: string; readonly section: WindowSection }
  | { readonly kind: "tab"; readonly key: string; readonly entry: TabEntry; readonly gapBefore: boolean }
  | {
      readonly kind: "group";
      readonly key: string;
      readonly row: GroupRow;
      readonly tabs: readonly TabEntry[];
      readonly gapBefore: boolean;
    }
  | { readonly kind: "new-tab"; readonly key: string; readonly window: WindowId; readonly gapBefore: boolean }
  | { readonly kind: "empty"; readonly key: string; readonly window: WindowId };

export type ItemOptions = {
  /** Windows collapsed in the app (ignored while searching). */
  readonly collapsedWindows: ReadonlySet<WindowId>;
  /** A search with at least one term is running: every section open, no "New tab". */
  readonly searching: boolean;
  /** Line 2 of the tabs that matched by `cwd` or `user@host`. */
  readonly matches?: ReadonlyMap<TabId, TabRowMatch>;
};

/** The id of the window a row belongs to. */
function windowOfRow(row: WorkspaceRow): WindowId {
  return row.kind === "tab" ? row.tab.window : row.window;
}

function isCard(item: WorkspaceItem | undefined): boolean {
  return item !== undefined && (item.kind === "tab" || item.kind === "group");
}

/**
 * The items of the list from the rows of `buildRows` (§4.5.2): window headers
 * (only with more than one window), section labels, tab and group cards,
 * "New tab" and the empty window, in the order the desktop sent.
 */
export function workspaceItems(
  workspace: WorkspaceMessage,
  rows: readonly WorkspaceRow[],
  options: ItemOptions,
): readonly WorkspaceItem[] {
  const { collapsedWindows, searching, matches } = options;
  const byWindow = new Map<WindowId, WorkspaceRow[]>();
  for (const row of rows) {
    const window = windowOfRow(row);
    const list = byWindow.get(window);
    if (list === undefined) {
      byWindow.set(window, [row]);
    } else {
      list.push(row);
    }
  }
  const items: WorkspaceItem[] = [];
  const entry = (tab: TabView): TabEntry => ({ tab, match: matches?.get(tab.tab) ?? null });
  const push = (item: WorkspaceItem) => {
    items.push(item);
  };

  workspace.windows.forEach((window, index) => {
    const windowRows = byWindow.get(window.id) ?? [];
    if (searching && windowRows.length === 0) {
      return;
    }
    const header = windowRows[0]?.kind === "window" ? windowRows[0] : null;
    const body = header === null ? windowRows : windowRows.slice(1);
    if (header !== null) {
      const collapsed = !searching && collapsedWindows.has(window.id);
      push({
        kind: "window",
        key: header.key,
        row: header,
        number: index + 1,
        collapsed,
        first: items.length === 0,
      });
      if (collapsed) {
        return;
      }
    }

    let pinned = 0;
    let track = 0;
    for (const row of body) {
      if (row.kind === "group" || (row.kind === "tab" && !row.inGroup && row.tab.zone === "track")) {
        track += 1;
      } else if (row.kind === "tab" && !row.inGroup) {
        pinned += 1;
      }
    }
    const sections = windowSections({ pinned, track });
    let pinnedLabel = false;
    let trailLabel = false;
    let group: { row: GroupRow; tabs: TabEntry[]; gapBefore: boolean } | null = null;
    const closeGroup = () => {
      if (group !== null) {
        push({ kind: "group", key: group.row.key, row: group.row, tabs: group.tabs, gapBefore: group.gapBefore });
        group = null;
      }
    };
    const label = (section: WindowSection) => {
      push({ kind: "section", key: `s:${section}:${window.id}`, section });
    };

    for (const row of body) {
      if (row.kind === "tab" && row.inGroup) {
        group?.tabs.push(entry(row.tab));
        continue;
      }
      closeGroup();
      if (row.kind === "window") {
        continue;
      }
      const inTrack = row.kind === "group" || row.tab.zone === "track";
      if (!inTrack && sections.pinned && !pinnedLabel) {
        pinnedLabel = true;
        label("pinned");
      }
      if (inTrack && sections.trail && !trailLabel) {
        trailLabel = true;
        label("trail");
      }
      const gapBefore = isCard(items[items.length - 1]);
      if (row.kind === "group") {
        group = { row, tabs: [], gapBefore };
      } else {
        push({ kind: "tab", key: row.key, entry: entry(row.tab), gapBefore });
      }
    }
    closeGroup();

    if (searching) {
      return;
    }
    if (body.length === 0) {
      push({ kind: "empty", key: `e:${window.id}`, window: window.id });
    }
    push({ kind: "new-tab", key: `n:${window.id}`, window: window.id, gapBefore: isCard(items[items.length - 1]) });
  });
  return items;
}

/**
 * Line 2 of the tabs a search found by `cwd` or `user@host` (§4.5.3): that
 * text, to be shown with the matched part in bold. `user@host` first; for
 * `cwd`, the focused pane's when it matched, else the first pane's that did.
 */
export function searchMatches(workspace: WorkspaceMessage, query: string): ReadonlyMap<TabId, TabRowMatch> {
  const hits = searchTabs(workspace, query);
  const matches = new Map<TabId, TabRowMatch>();
  if (hits.length === 0) {
    return matches;
  }
  const raw = new Map<TabId, Tab>();
  for (const window of workspace.windows) {
    for (const tab of tabsOf(window)) {
      raw.set(tab.tab, tab);
    }
  }
  const matched = (text: string) => matchSegments(text, query).some((segment) => segment.match);
  for (const hit of hits) {
    const tab = raw.get(hit.tab);
    if (tab === undefined) {
      continue;
    }
    const fields: readonly SearchHitField[] = hit.fields;
    if (fields.includes("remote") && tab.remote !== null && matched(tab.remote)) {
      matches.set(hit.tab, { text: tab.remote, query });
      continue;
    }
    if (fields.includes("cwd")) {
      const panes = leafPanes(tab.layout);
      const focused = panes.find((pane) => pane.pane === tab.focused);
      const cwd =
        focused?.cwd !== null && focused?.cwd !== undefined && matched(focused.cwd)
          ? focused.cwd
          : panes.map((pane) => pane.cwd).find((text): text is string => text !== null && matched(text));
      if (cwd !== undefined) {
        matches.set(hit.tab, { text: cwd, query });
      }
    }
  }
  return matches;
}

/** The keys of the items an action awaits its result on (RF-4.9). */
export function pendingItemKeys(requests: RequestsState): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const entry of requests.pending.values()) {
    for (const target of entry.targets) {
      keys.add(itemKey(target));
    }
  }
  return keys;
}

// ----------------------------------------------------------------- list

export type WorkspaceListProps = {
  readonly workspace: WorkspaceMessage;
  readonly profiles: Profiles | null;
  readonly theme: Theme | null;
  /** Groups expanded only in the app (`SessionState.expansion.groups`). */
  readonly expandedGroups: ReadonlySet<GroupId>;
  readonly requests: RequestsState;
  /** The search text; empty when not searching. */
  readonly query: string;
  readonly collapsedWindows: ReadonlySet<WindowId>;
  /** The connection is down: no menu, no "New tab" (§4.5.4). */
  readonly readOnly: boolean;
  readonly onToggleWindow: (window: WindowId) => void;
  readonly onToggleGroup: (group: GroupId) => void;
  readonly onOpenTab: (tab: TabView) => void;
  readonly onTabMenu: (tab: TabView, origin: FocusOrigin) => void;
  readonly onGroupMenu: (group: GroupId, origin: FocusOrigin) => void;
  readonly onNewTab: (window: WindowId, origin: FocusOrigin, group?: GroupId) => void;
  readonly onScroll?: (offset: number) => void;
  /** Shown instead of the list when the search found nothing. */
  readonly empty?: ReactNode;
  readonly testID?: string;
};

/** Rows enter, leave and move in `duration.reflow`, linear (§2.9). */
const reflowLayout = LinearTransition.duration(duration.reflow).easing(Easing.linear);
const reflowIn = FadeIn.duration(duration.reflow).easing(Easing.linear);
const reflowOut = FadeOut.duration(duration.reflow).easing(Easing.linear);

const keyOf = (item: WorkspaceItem): string => item.key;

/** The tree of the workspace. */
export const WorkspaceList = forwardRef<FlatList<WorkspaceItem>, WorkspaceListProps>(function WorkspaceList(
  {
    workspace,
    profiles,
    theme,
    expandedGroups,
    requests,
    query,
    collapsedWindows,
    readOnly,
    onToggleWindow,
    onToggleGroup,
    onOpenTab,
    onTabMenu,
    onGroupMenu,
    onNewTab,
    onScroll,
    empty,
    testID = "workspace-list",
  },
  ref,
) {
  const reducedMotion = useReducedMotion();

  // Rows: the whole tree, or only the tabs the search found.
  const onlyTabs = useMemo(() => searchTabIds(workspace, query), [workspace, query]);
  const searching = onlyTabs !== null;
  const previousRows = useRef<readonly WorkspaceRow[]>([]);
  const rows = useMemo(
    () => reuseRows(previousRows.current, buildRows(workspace, { profiles, expandedGroups, onlyTabs })),
    [workspace, profiles, expandedGroups, onlyTabs],
  );
  useEffect(() => {
    previousRows.current = rows;
  }, [rows]);

  const matches = useMemo(
    () => (searching ? searchMatches(workspace, query) : undefined),
    [searching, workspace, query],
  );
  const items = useMemo(
    () =>
      workspaceItems(workspace, rows, {
        collapsedWindows,
        searching,
        ...(matches === undefined ? {} : { matches }),
      }),
    [workspace, rows, collapsedWindows, searching, matches],
  );

  // Items new since the last list fade in; those already known (and the
  // ones a scroll brings into view) do not.
  const knownKeys = useRef<ReadonlySet<string> | null>(null);
  const known = knownKeys.current;
  useEffect(() => {
    knownKeys.current = new Set(items.map(keyOf));
  }, [items]);

  const pending = useMemo(() => pendingItemKeys(requests), [requests]);

  const renderItem = ({ item }: { readonly item: WorkspaceItem }) => {
    const animate = !reducedMotion;
    const fresh = animate && known !== null && !known.has(item.key);
    return (
      <Animated.View
        {...(fresh ? { entering: reflowIn } : {})}
        {...(animate ? { exiting: reflowOut } : {})}
        style={'gapBefore' in item && item.gapBefore ? styles.gap : null}
      >
        <ItemView
          item={item}
          theme={theme}
          pending={pending}
          readOnly={readOnly}
          searching={searching}
          onToggleWindow={onToggleWindow}
          onToggleGroup={onToggleGroup}
          onOpenTab={onOpenTab}
          onTabMenu={onTabMenu}
          onGroupMenu={onGroupMenu}
          onNewTab={onNewTab}
        />
      </Animated.View>
    );
  };

  if (searching && items.length === 0 && empty !== undefined) {
    return <>{empty}</>;
  }

  return (
    <Animated.FlatList
      ref={ref}
      data={items}
      keyExtractor={keyOf}
      renderItem={renderItem}
      extraData={[pending, readOnly, theme, reducedMotion]}
      {...(reducedMotion ? {} : { itemLayoutAnimation: reflowLayout })}
      skipEnteringExitingAnimations
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      {...(onScroll === undefined
        ? {}
        : {
            onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
              onScroll(event.nativeEvent.contentOffset.y);
            },
            scrollEventThrottle: SCROLL_THROTTLE_MS,
          })}
      testID={testID}
    />
  );
});

/** How often the list reports its position (one frame at 60 Hz). */
const SCROLL_THROTTLE_MS = 16;


// ----------------------------------------------------------------- one item

type ItemViewProps = {
  readonly item: WorkspaceItem;
  readonly theme: Theme | null;
  readonly pending: ReadonlySet<string>;
  readonly readOnly: boolean;
  readonly searching: boolean;
  readonly onToggleWindow: (window: WindowId) => void;
  readonly onToggleGroup: (group: GroupId) => void;
  readonly onOpenTab: (tab: TabView) => void;
  readonly onTabMenu: (tab: TabView, origin: FocusOrigin) => void;
  readonly onGroupMenu: (group: GroupId, origin: FocusOrigin) => void;
  readonly onNewTab: (window: WindowId, origin: FocusOrigin, group?: GroupId) => void;
};

function tabTestId(tab: TabView): string {
  return `tab-${tab.tab}`;
}

const ItemView = memo(function ItemView({
  item,
  theme,
  pending,
  readOnly,
  searching,
  onToggleWindow,
  onToggleGroup,
  onOpenTab,
  onTabMenu,
  onGroupMenu,
  onNewTab,
}: ItemViewProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const tabRow = (entry: TabEntry, inGroup: boolean) => (
    <TabRow
      key={entry.tab.tab}
      tab={entry.tab}
      inGroup={inGroup}
      onOpen={onOpenTab}
      onMenu={onTabMenu}
      pending={pending.has(itemKey({ kind: "tab", id: entry.tab.tab }))}
      readOnly={readOnly}
      {...(entry.match === null ? {} : { match: entry.match })}
      testID={tabTestId(entry.tab)}
    />
  );
  switch (item.kind) {
    case "window":
      return (
        <WindowHeader
          row={item.row}
          number={item.number}
          collapsed={item.collapsed}
          onToggle={onToggleWindow}
          first={item.first}
          testID={`window-${item.row.window}`}
        />
      );
    case "section":
      return <SectionHeader section={item.section} testID={`section-${item.key}`} />;
    case "tab":
      return tabRow(item.entry, false);
    case "group":
      return (
        <GroupCard
          row={item.row}
          color={resolveGroupColor(theme, item.row.color)}
          onToggle={onToggleGroup}
          onMenu={onGroupMenu}
          {...(searching
            ? {}
            : { onNewTab: (group: GroupId, origin: FocusOrigin) => onNewTab(item.row.window, origin, group) })}
          pending={pending.has(itemKey({ kind: "group", id: item.row.group }))}
          readOnly={readOnly}
          testID={`group-${item.row.group}`}
        >
          {item.tabs.map((entry) => tabRow(entry, true))}
        </GroupCard>
      );
    case "new-tab":
      return (
        <NewTabRow
          variant="window"
          onPress={(origin) => onNewTab(item.window, origin)}
          disabled={readOnly}
          testID={`new-tab-${item.window}`}
        />
      );
    case "empty":
      return (
        <Text
          style={[typeStyle("secondary"), styles.empty, { color: colors.textSecondary }]}
          testID={`empty-${item.window}`}
        >
          {t("workspace.empty_window")}
        </Text>
      );
  }
});

const styles = StyleSheet.create({
  content: {
    paddingVertical: spacing.listPadding,
  },
  gap: {
    marginTop: spacing.listGap,
  },
  empty: {
    paddingHorizontal: spacing.listPadding,
    paddingVertical: spacing.rowPaddingY,
  },
});

