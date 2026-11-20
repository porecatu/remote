// SPDX-License-Identifier: GPL-3.0-or-later
// The workspace of an open desktop (anatomy §4.5; PRD-002 RF-2.1 to RF-2.13;
// PRD-004 RF-4.1, RF-4.6, RF-4.9). Inside `DesktopSessionScope`, which holds
// the session. What it shows:
// - before the first `ready` of the visit (§4.5.1): the bar with the
//   desktop's name and back (which cancels), and the spinner with the step in
//   words; a failure on the way in is a state screen (incompatible with the
//   side to update, offline, not paired, relay unreachable...). The ends that
//   leave the desktop (`goodbye`) are the scope's;
// - then the tree (§4.5.2): the bar with the name, the connection line and
//   `search`; the connection band under it (§4.5.4); and the list. While the
//   connection is down the tree stays at 60% and read-only, keeping its
//   position; a new `workspace` replaces it whole;
// - search (§4.5.3): `search` swaps the title for the field; the tree keeps
//   its shape with only what matched; "Cancel" gives back the tree and its
//   scroll position; nothing found shows `search-x` and the query.
// Touch on a tab opens it in the terminal (its focused pane, RF-2.10); long
// press or its menu button opens the tab menu, the group's button its menu,
// "New tab" the new tab sheet with the window or group (RF-4.1). Window
// sections collapse in the app only, kept in memory for the desktop instance.
// Nothing is logged: titles, directories and the query are content.
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, type FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DesktopsState } from "@/controllers/desktops";
import type { GroupId, WindowId } from "@/protocol";
import type { SessionState, SessionStore } from "@/session/sessionStore";
import type { TabView } from "@/workspace/selectors";
import { ScreenBar, StateView } from "@ui/components";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { type FocusOrigin, useOverlay } from "@ui/overlay";
import { relayHost } from "@ui/screens/desktops/rowModel";
import { useServices } from "@ui/services/ServicesContext";
import { tabRoute } from "@ui/session/SessionOverlays";
import { openGroupMenuFor, openNewTabFor, openSavedSessionsFor, openTabMenuFor } from "@ui/sheets/openers";
import { opacity, useTheme } from "@ui/theme";

import { ConnectionBanner, connectionSubtitle, isSessionLive, useRetryConnection } from "./ConnectionBanner";
import { ConnectingView, EntryFailureView, connectingStep, entryFailure } from "./ConnectingView";
import { useDesktopSession } from "./DesktopSessionScope";
import { SearchField } from "./SearchField";
import { WorkspaceList, type WorkspaceItem } from "./WorkspaceList";

/** Where "Pair again" goes (§4.5.1). */
const PAIR_ROUTE = "/pair";

/** The workspace of the desktop of the surrounding scope. */
export function WorkspaceScreen() {
  const { desktopId, session, reachedReady, leave } = useDesktopSession();
  const { desktops } = useServices();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const desktop = useStoreState(desktops.store, (state: DesktopsState) =>
    state.desktops.find((candidate) => candidate.id === desktopId),
  );
  const tr = useT();

  const name = desktop?.name ?? "";
  const back = { onPress: leave, accessibilityLabel: tr.t("workspace.back") };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgBase }]} testID="workspace-screen">
      {session === undefined ? (
        <>
          <View style={{ paddingTop: insets.top, backgroundColor: colors.bgBar }}>
            <ScreenBar title={name} back={back} testID="workspace-bar" />
          </View>
          <ConnectingView step="connecting" />
        </>
      ) : (
        <SessionWorkspace
          session={session}
          name={name}
          relay={desktop === undefined ? "" : relayHost(desktop.relayUrl)}
          reachedReady={reachedReady}
          onLeave={leave}
          desktopId={desktopId}
        />
      )}
    </View>
  );
}

type SessionWorkspaceProps = {
  readonly session: SessionStore;
  readonly desktopId: string;
  readonly name: string;
  /** The relay's host, for "relay unreachable". */
  readonly relay: string;
  readonly reachedReady: boolean;
  readonly onLeave: () => void;
};

const selectConnection = (state: SessionState) => state.connection;
const selectWorkspace = (state: SessionState) => state.workspace;
const selectProfiles = (state: SessionState) => state.profiles;
const selectTheme = (state: SessionState) => state.theme;
const selectExpanded = (state: SessionState) => state.expansion.expanded;
const selectRequests = (state: SessionState) => state.requests;
const selectInstance = (state: SessionState) => state.connection.welcome?.hostInstance ?? null;

/** Windows collapsed in the app, for one desktop instance (ids restart with it). */
type CollapsedWindows = { readonly instance: string | null; readonly ids: ReadonlySet<WindowId> };

const NO_WINDOWS: ReadonlySet<WindowId> = new Set();

function SessionWorkspace({ session, desktopId, name, relay, reachedReady, onLeave }: SessionWorkspaceProps) {
  const tr = useT();
  const { t } = tr;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const overlay = useOverlay();
  const retry = useRetryConnection(session);

  const connection = useStoreState(session.store, selectConnection);
  const workspace = useStoreState(session.store, selectWorkspace);
  const profiles = useStoreState(session.store, selectProfiles);
  const theme = useStoreState(session.store, selectTheme);
  const expanded = useStoreState(session.store, selectExpanded);
  const requests = useStoreState(session.store, selectRequests);
  const instance = useStoreState(session.store, selectInstance);

  const shown = reachedReady || connection.state === "ready";
  const failure = entryFailure(connection, shown, workspace !== null);
  const readOnly = !isSessionLive(connection);

  // ------------------------------------------------------------ search

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const list = useRef<FlatList<WorkspaceItem>>(null);
  const offset = useRef(0);
  /** The scroll position of the tree when the search opened, given back on Cancel. */
  const savedOffset = useRef<number | null>(null);

  const openSearch = useCallback(() => {
    savedOffset.current = offset.current;
    setSearchOpen(true);
  }, []);

  const cancelSearch = useCallback(() => {
    setQuery("");
    setSearchOpen(false);
  }, []);

  useEffect(() => {
    const saved = savedOffset.current;
    if (searchOpen || saved === null) {
      return;
    }
    savedOffset.current = null;
    list.current?.scrollToOffset({ offset: saved, animated: false });
  }, [searchOpen]);

  const onScroll = useCallback((y: number) => {
    offset.current = y;
  }, []);

  // ------------------------------------------------------------ windows

  const [collapsed, setCollapsed] = useState<CollapsedWindows>({ instance, ids: NO_WINDOWS });
  const collapsedWindows = collapsed.instance === instance ? collapsed.ids : NO_WINDOWS;

  const onToggleWindow = useCallback(
    (window: WindowId) => {
      setCollapsed((current) => {
        const ids = new Set(current.instance === instance ? current.ids : NO_WINDOWS);
        if (!ids.delete(window)) {
          ids.add(window);
        }
        return { instance, ids };
      });
    },
    [instance],
  );

  // ------------------------------------------------------------ actions

  const onToggleGroup = useCallback(
    (group: GroupId) => {
      session.toggleGroupExpansion(group);
    },
    [session],
  );

  const onOpenTab = useCallback(
    (tab: TabView) => {
      router.push(tabRoute(desktopId, tab.tab));
    },
    [router, desktopId],
  );

  const onTabMenu = useCallback(
    (tab: TabView, origin: FocusOrigin) => {
      if (isSessionLive(session.getState().connection)) {
        openTabMenuFor(overlay, { session, tabId: tab.tab, origin });
      }
    },
    [overlay, session],
  );

  const onGroupMenu = useCallback(
    (group: GroupId, origin: FocusOrigin) => {
      if (isSessionLive(session.getState().connection)) {
        openGroupMenuFor(overlay, { session, groupId: group, origin });
      }
    },
    [overlay, session],
  );

  const onNewTab = useCallback(
    (window: WindowId, origin: FocusOrigin, group?: GroupId) => {
      if (isSessionLive(session.getState().connection)) {
        openNewTabFor(overlay, {
          session,
          windowId: window,
          origin,
          ...(group === undefined ? {} : { groupId: group }),
        });
      }
    },
    [overlay, session],
  );

  const onSavedSessions = useCallback(() => {
    if (isSessionLive(session.getState().connection)) {
      openSavedSessionsFor(overlay, { session });
    }
  }, [overlay, session]);

  const onPairAgain = useCallback(() => {
    router.replace(PAIR_ROUTE);
  }, [router]);

  // ------------------------------------------------------------ render

  const back = { onPress: onLeave, accessibilityLabel: t("workspace.back") };
  const tree = shown && failure === null ? workspace : null;

  let bar;
  if (tree !== null && searchOpen) {
    bar = <SearchField value={query} onChangeText={setQuery} onCancel={cancelSearch} onBack={onLeave} />;
  } else if (tree !== null) {
    bar = (
      <ScreenBar
        title={name}
        subtitle={connectionSubtitle(connection, tr)}
        back={back}
        actions={[
          {
            icon: "bookmark",
            accessibilityLabel: t("saved_sessions.open"),
            onPress: onSavedSessions,
            testID: "workspace-saved-sessions",
          },
          { icon: "search", accessibilityLabel: t("search.open"), onPress: openSearch, testID: "workspace-search-open" },
        ]}
        testID="workspace-bar"
      />
    );
  } else {
    bar = <ScreenBar title={name} back={back} testID="workspace-bar" />;
  }

  let body;
  if (failure !== null) {
    body = (
      <EntryFailureView
        failure={failure}
        name={name}
        relayHost={relay}
        onRetry={retry}
        onPairAgain={onPairAgain}
        onLeave={onLeave}
      />
    );
  } else if (tree === null) {
    body = <ConnectingView step={connectingStep(connection)} />;
  } else {
    body = (
      <>
        <ConnectionBanner session={session} />
        <View style={[styles.body, readOnly ? styles.readOnly : null]} testID="workspace-tree">
          <WorkspaceList
            ref={list}
            workspace={tree}
            profiles={profiles}
            theme={theme}
            expandedGroups={expanded}
            requests={requests}
            query={searchOpen ? query : ""}
            collapsedWindows={collapsedWindows}
            readOnly={readOnly}
            onToggleWindow={onToggleWindow}
            onToggleGroup={onToggleGroup}
            onOpenTab={onOpenTab}
            onTabMenu={onTabMenu}
            onGroupMenu={onGroupMenu}
            onNewTab={onNewTab}
            onScroll={onScroll}
            empty={
              <StateView
                icon="search-x"
                title={t("search.no_results", { query: query.trim() })}
                testID="workspace-no-results"
              />
            }
          />
        </View>
      </>
    );
  }

  return (
    <>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.bgBar }}>{bar}</View>
      <View style={[styles.body, { paddingBottom: insets.bottom }]}>{body}</View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  readOnly: {
    opacity: opacity.readOnly,
  },
});
