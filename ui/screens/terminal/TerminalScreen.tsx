// SPDX-License-Identifier: GPL-3.0-or-later
// The terminal of a tab (anatomy §4.6 to §4.11; PRD-003; PRD-002 RF-2.10,
// RF-2.11; PRD-004 RF-4.6; PRD-001 RF-1.19). Inside `DesktopSessionScope`,
// which holds the session and its overlays. From top to bottom:
//
// - the terminal bar (back, title and `user@host` or `cwd`, state chip, the
//   pane chip, `keyboard`, the tab menu with Close pane), 40 high in landscape;
//   the connection band under it while the session is not `ready`;
// - the grid on the desktop's `theme`, edge to edge inside the safe area, with
//   the zoom chip and the card of a pane that is not running over it. It dims
//   while the session reconnects (read-only, the last known state) and while
//   the pane reconnects (§4.10); the view options (fit the width, follow the
//   cursor, back to the end) are in the tab menu;
// - the key bar, stuck to the system keyboard and shown only while it is open
//   for the terminal; or, for an exited or disconnected pane, its banner.
//
// Behavior: a tap on the grid opens the keyboard only when the pane takes
// input (RF-3.14, RF-3.18); text with a line break from the keyboard goes
// through the paste confirmation (decision 9); the bell lights the bar and,
// when the setting allows, vibrates (RF-3.23); a tab that left the tree takes
// the user back to the tree with the reason (RF-2.11); a protocol error or a
// failure the workspace shows as a state screen goes back to it. Screenshots
// and recordings are blocked while the screen is open (`FLAG_SECURE`, RF-1.19).
// In landscape the screen is immersive: no status bar, the bar of 40.
//
// Nothing is logged: titles, directories, keys and pasted text are content.
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { sessionOwner } from "@/controllers/overlay";
import type { TerminalSession, TerminalState } from "@/controllers/terminalSession";
import { PaneState, type TabId } from "@/protocol";
import { closeTab } from "@/session/actions";
import type { SessionState, SessionStore } from "@/session/sessionStore";
import type { ZoomKey } from "@/terminal/viewport";
import { findTab } from "@/workspace/selectors";
import { shallowEqual, useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { type FocusOrigin, useOverlay, useToastOffset } from "@ui/overlay";
import { entryFailure } from "@ui/screens/workspace/ConnectingView";
import { ConnectionBanner, isSessionLive } from "@ui/screens/workspace/ConnectionBanner";
import { useDesktopSession } from "@ui/screens/workspace/DesktopSessionScope";
import { useServices } from "@ui/services/ServicesContext";
import { actionMessageText, actionToastOptions, sendRefusalMessage } from "@ui/session/actionMessages";
import { type TerminalViewOptions, pendingKinds, sendOrWarn } from "@ui/sheets/menus";
import { useRetained } from "@ui/sheets/menus/useRetained";
import { openTabMenuFor } from "@ui/sheets/openers";
import { CaptureInput, type CaptureInputHandle } from "@ui/terminal/CaptureInput";
import { KeyBar } from "@ui/terminal/KeyBar";
import { openPanePicker } from "@ui/terminal/PanePickerSheet";
import { PaneStateBanner, PaneStateCard, paneStatePresentation } from "@ui/terminal/PaneStateCard";
import { useInputRefusalToasts, usePasteFlow } from "@ui/terminal/PasteDialog";
import { TerminalBar } from "@ui/terminal/TerminalBar";
import { ZoomChip } from "@ui/terminal/ZoomChip";
import { INITIAL_GRID_STATE } from "@ui/terminal/grid/gridEngine";
import { TerminalGrid, type TerminalGridHandle, type TerminalGridState } from "@ui/terminal/grid/TerminalGrid";
import { opacity, rgbToCss, size, useTheme } from "@ui/theme";

import { sessionKey, useTerminalSession, useTerminalView } from "./useTerminalSession";

/** The workspace of a desktop, where the terminal goes back to when it has no history to pop. */
function workspaceRoute(desktopId: string): string {
  return `/desktop/${desktopId}`;
}

/** A line break in what the system keyboard typed: it came from a paste (decision 9). */
const LINE_BREAK = /[\r\n]/;

/** What the bar shows of the tab, from the tree. */
type TabHeader = {
  readonly title: string;
  /** `user@host` of an SSH tab. */
  readonly remote: string | null;
};

function tabHeader(state: Pick<SessionState, "workspace" | "profiles">, tabId: TabId): TabHeader | undefined {
  if (state.workspace === null) {
    return undefined;
  }
  const tab = findTab(state.workspace, tabId, state.profiles);
  return tab === undefined ? undefined : { title: tab.title, remote: tab.remote };
}

const selectConnection = (state: SessionState) => state.connection;
const selectTheme = (state: SessionState) => state.theme;
const selectRequests = (state: SessionState) => state.requests;
const selectInstance = (state: SessionState) => state.connection.welcome?.hostInstance ?? null;
const selectModifiers = (state: TerminalState) => state.modifiers;

const noop = (): void => undefined;

/** Goes back to the workspace of the desktop: the previous screen, or the workspace itself. */
function useBackToWorkspace(desktopId: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(workspaceRoute(desktopId));
    }
  }, [router, desktopId]);
}

/** Blocks screenshots and screen recording while the terminal is open (RF-1.19). */
function usePreventScreenCapture(): void {
  const { screenCapture } = useServices();
  useEffect(() => {
    // A platform that cannot block capture has nothing else to do here; the
    // privacy cover of the root still hides the app switcher (§4.1).
    screenCapture.prevent().catch(noop);
    return () => {
      screenCapture.allow().catch(noop);
    };
  }, [screenCapture]);
}

export type TerminalScreenProps = {
  /** The tab on screen (`tab-id` of the route). */
  readonly tabId: TabId;
};

/** The terminal of `tabId` on the desktop of the surrounding scope. */
export function TerminalScreen({ tabId }: TerminalScreenProps) {
  const { desktopId, session } = useDesktopSession();
  const back = useBackToWorkspace(desktopId);
  usePreventScreenCapture();

  if (session === undefined) {
    return <TerminalPlaceholder onBack={back} />;
  }
  return (
    <LiveTerminal
      key={sessionKey(session, tabId)}
      session={session}
      desktopId={desktopId}
      tabId={tabId}
      onBack={back}
    />
  );
}

/** The frame of the screen before the desktop's session exists: the bar and the empty grid. */
function TerminalPlaceholder({ onBack }: { readonly onBack: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return (
    <View style={[styles.screen, { backgroundColor: colors.bgTerminal }]} testID="terminal-screen">
      <View style={{ paddingTop: insets.top, backgroundColor: colors.bgBar }}>
        <TerminalBar
          title=""
          detail={null}
          paneState={null}
          exitCode={null}
          paneIndex={1}
          paneCount={0}
          keyboardVisible={false}
          keyboardAvailable={false}
          landscape={width > height}
          onBack={onBack}
          onPanePicker={noop}
          onToggleKeyboard={noop}
          onTabMenu={noop}
        />
      </View>
    </View>
  );
}

type LiveTerminalProps = {
  readonly session: SessionStore;
  readonly desktopId: string;
  readonly tabId: TabId;
  readonly onBack: () => void;
};

/** The terminal over its controller, which lives as long as this component (keyed by `sessionKey`). */
function LiveTerminal({ session, desktopId, tabId, onBack }: LiveTerminalProps) {
  const terminal = useTerminalSession(session, tabId);
  const tr = useT();
  const { t } = tr;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const overlay = useOverlay();
  const { haptics } = useServices();
  const owner = sessionOwner(desktopId);

  const view = useTerminalView(terminal);
  const connection = useStoreState(session.store, selectConnection);
  const theme = useStoreState(session.store, selectTheme);
  const requests = useStoreState(session.store, selectRequests);
  const instance = useStoreState(session.store, selectInstance);
  const selectHeader = useCallback((state: SessionState) => tabHeader(state, tabId), [tabId]);
  const header = useRetained(useStoreState(session.store, selectHeader, shallowEqual));
  const live = isSessionLive(connection);

  const title = header?.title ?? "";
  const viewedPane = view.panes.find((pane) => pane.pane === view.paneId);
  const detail = header?.remote ?? viewedPane?.cwd ?? null;
  const paneIndex = Math.max(1, view.panes.findIndex((pane) => pane.pane === view.paneId) + 1);

  // ------------------------------------------------------------ leaving

  /** The screen already went back on its own. */
  const left = useRef(false);
  const leave = useCallback(
    (notice: string | null) => {
      if (left.current) {
        return;
      }
      left.current = true;
      if (notice !== null) {
        overlay.showToast(notice, { severity: "info" });
      }
      onBack();
    },
    [overlay, onBack],
  );

  // The tab left the tree, or the desktop restarted (RF-2.11).
  const tabGone = view.tabGone;
  useEffect(() => {
    if (tabGone !== null) {
      leave(t("toast.tab_closed"));
    }
  }, [tabGone, leave, t]);

  // A protocol error or a failure the workspace shows as a state screen.
  const failed = entryFailure(connection, true, true) !== null;
  useEffect(() => {
    if (failed) {
      leave(null);
    }
  }, [failed, leave]);

  // ------------------------------------------------------------ events

  const [bellSignal, setBellSignal] = useState(0);
  useEffect(
    () =>
      terminal.onEvent((event) => {
        if (event.type === "bell") {
          setBellSignal((count) => count + 1);
          if (event.vibrate) {
            haptics.notify("warning");
          }
        } else if (event.type === "protocol-fault") {
          leave(null);
        }
      }),
    [terminal, haptics, leave],
  );
  useInputRefusalToasts(terminal);
  const paste = usePasteFlow(terminal, { owner });

  // ------------------------------------------------------------ keyboard

  const capture = useRef<CaptureInputHandle>(null);
  const [captured, setCaptured] = useState(false);
  const systemKeyboard = useKeyboardState((state) => state.isVisible);
  const keyboardVisible = captured && systemKeyboard;
  const keyboardWasVisible = useRef(systemKeyboard);
  useEffect(() => {
    // The system closed the keyboard (Android's back) with the field focused:
    // let go of it, so the next tap opens the keyboard again.
    if (keyboardWasVisible.current && !systemKeyboard && captured) {
      capture.current?.blur();
    }
    keyboardWasVisible.current = systemKeyboard;
  }, [systemKeyboard, captured]);

  const openKeyboard = useCallback(() => {
    if (view.canType) {
      capture.current?.focus();
    }
  }, [view.canType]);

  const toggleKeyboard = useCallback(() => {
    if (keyboardVisible) {
      capture.current?.blur();
    } else {
      openKeyboard();
    }
  }, [keyboardVisible, openKeyboard]);

  const onText = useCallback(
    (text: string) => {
      if (LINE_BREAK.test(text)) {
        paste.paste(text);
      } else {
        terminal.typeText(text);
      }
    },
    [paste, terminal],
  );

  // ------------------------------------------------------------ grid

  const grid = useRef<TerminalGridHandle>(null);
  const [gridState, setGridState] = useState<TerminalGridState>(INITIAL_GRID_STATE);
  const onGridState = useCallback((next: TerminalGridState) => {
    setGridState((current) => (shallowEqual(current, next) ? current : next));
  }, []);
  const zoomKey = useMemo<ZoomKey | null>(
    () => (instance === null ? null : { desktopId, hostInstance: instance, tabId }),
    [desktopId, instance, tabId],
  );

  // ------------------------------------------------------------ actions

  // The bar hands the element that opened each sheet: the sheet gives the
  // screen reader focus back to it on close (§5).
  const onTabMenu = useCallback(
    (origin: FocusOrigin) => {
      if (!isSessionLive(session.getState().connection)) {
        return;
      }
      const paneId = terminal.getState().paneId;
      // The grid's view options, as they are now: the menu is a snapshot.
      const view: TerminalViewOptions = {
        isFit: gridState.isFit,
        wide: gridState.wide,
        followingCursor: gridState.followingCursor,
        atBottom: gridState.atBottom,
        onFitWidth: () => grid.current?.fitWidth(),
        onFollowCursor: (on) => grid.current?.setFollowCursor(on),
        onScrollToBottom: () => grid.current?.scrollToBottom(),
      };
      openTabMenuFor(overlay, {
        session,
        tabId,
        origin,
        ...(paneId === null ? {} : { fromTerminal: { paneId, view } }),
      });
    },
    [overlay, session, tabId, terminal, gridState],
  );

  const onPanePicker = useCallback(
    (origin: FocusOrigin) => {
      openPanePicker(overlay, {
        terminal,
        tabTitle: title,
        owner,
        origin,
        ...(theme === null ? {} : { terminalBackground: rgbToCss(theme.bg) }),
      });
    },
    [overlay, terminal, title, owner, theme],
  );

  const onStart = useCallback(() => {
    const notice = sendRefusalMessage(terminal.startPane());
    if (notice !== null) {
      overlay.showToast(actionMessageText(notice, t), actionToastOptions(notice));
    }
  }, [terminal, overlay, t]);

  // A pinned tab too: the desktop asks for the confirmation (`confirm-request`).
  const onCloseTab = useCallback(() => {
    sendOrWarn(session, overlay, tr, (id) => closeTab(id, tabId));
  }, [session, overlay, tr, tabId]);

  const starting =
    view.paneId !== null && pendingKinds(requests, { kind: "pane", id: view.paneId }).has("start-pane");

  // ------------------------------------------------------------ layout

  const presentation = paneStatePresentation(view.paneState);
  const banner = presentation?.placement === "bottom";
  const showKeyBar = keyboardVisible && !banner;
  useToastOffset(showKeyBar ? size.keybarHeight : banner ? size.bottomBannerHeight : 0);

  const gridBackground = theme === null ? colors.bgTerminal : rgbToCss(theme.bg);
  const dimGrid = presentation?.dimGrid === true || !live;
  const sides = { paddingLeft: insets.left, paddingRight: insets.right };
  const canStart = view.paneState === PaneState.notStarted || view.paneState === PaneState.disconnected;

  return (
    <View style={[styles.screen, { backgroundColor: gridBackground }]} testID="terminal-screen">
      <StatusBar hidden={landscape} />
      <View style={[sides, { paddingTop: insets.top, backgroundColor: colors.bgBar }]}>
        <TerminalBar
          title={title}
          detail={detail}
          paneState={view.paneState}
          exitCode={view.exitCode}
          paneIndex={paneIndex}
          paneCount={view.panes.length}
          keyboardVisible={keyboardVisible}
          keyboardAvailable={view.canType}
          bellSignal={bellSignal}
          landscape={landscape}
          onBack={onBack}
          onPanePicker={onPanePicker}
          onToggleKeyboard={toggleKeyboard}
          onTabMenu={onTabMenu}
        />
        <ConnectionBanner session={session} />
      </View>
      <KeyboardAvoidingView behavior="padding" style={styles.body}>
        <View style={[styles.body, sides]}>
          <View style={[styles.body, dimGrid ? styles.dim : null]} testID="terminal-grid-area">
            <TerminalGrid
              ref={grid}
              session={terminal}
              theme={theme}
              title={title}
              zoomKey={zoomKey}
              onTap={openKeyboard}
              onStateChange={onGridState}
            />
          </View>
          <ZoomChip visible={gridState.zoomChipVisible} percent={gridState.zoomPercent} />
          {presentation !== null && !banner ? (
            <PaneStateCard
              state={view.paneState}
              onStart={canStart ? onStart : noop}
              starting={starting}
            />
          ) : null}
          <CaptureInput
            ref={capture}
            enabled={view.canType}
            onText={onText}
            onKey={(key) => {
              terminal.pressNamedKey(key);
            }}
            onFocusChange={setCaptured}
          />
        </View>
        {banner ? (
          <View style={[sides, { paddingBottom: insets.bottom, backgroundColor: colors.bgBar }]}>
            <PaneStateBanner
              state={view.paneState}
              exitCode={view.exitCode}
              onCloseTab={onCloseTab}
              {...(canStart ? { onStart } : {})}
              starting={starting}
            />
          </View>
        ) : showKeyBar ? (
          <View style={[sides, { backgroundColor: colors.bgBar }]}>
            <TerminalKeyBar terminal={terminal} onPaste={paste.pasteFromClipboard} />
          </View>
        ) : (
          <View style={{ height: insets.bottom }} />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

/** The key bar over the controller: keys and modifiers go to it, Paste reads the clipboard. */
function TerminalKeyBar({
  terminal,
  onPaste,
}: {
  readonly terminal: TerminalSession;
  readonly onPaste: () => Promise<void>;
}) {
  const modifiers = useStoreState(terminal.store, selectModifiers);
  return (
    <KeyBar
      modifiers={modifiers}
      onKey={(id) => {
        terminal.pressKey(id);
      }}
      onModifier={(modifier) => {
        terminal.tapModifier(modifier);
      }}
      onReleaseModifier={(modifier) => {
        terminal.releaseModifier(modifier);
      }}
      onPaste={() => {
        void onPaste();
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  dim: {
    opacity: opacity.readOnly,
  },
});
