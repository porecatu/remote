// SPDX-License-Identifier: GPL-3.0-or-later

// The controller of one open terminal screen (PRD-003; PRD-002 RF-2.5, RF-2.10,
// RF-2.11): it wires the pieces of the terminal that were built and tested
// alone (`SubscriptionSet`, `InputSender`, the modifier keys, the paste
// analysis, the scrollback) to the store of the desktop session, which is the
// composition docs/arquitetura.md §1 left for the screens. Pure: no React, no
// renderer; the screen reads `store` and calls the actions.
//
// Rules this file keeps:
// - one subscription at a time, the pane on screen (RF-3.3); opening the tab
//   subscribes its focused pane (RF-2.10, RF-3.1) and `close()` unsubscribes;
// - a grid message that is a protocol error ends the session (`abort`), with
//   no new subscribe (spec 03 §5.3). The `error { protocol }` goes out once,
//   from the session's own abort;
// - subscriptions do not survive a reconnection (arquitetura §2): when the
//   session leaves `ready` they are dropped, and when it comes back with the
//   same `host_instance` and the tab still in the tree the pane is subscribed
//   again (a fresh `grid-snapshot`, RF-2.5). Another `host_instance` means the
//   ids mean other things now: the tab is gone;
// - the last grid of the pane stays readable (marked `stale`) while there is
//   no live one, so the screen does not go blank while it reconnects;
// - input goes only to a subscribed, live, `running` pane; every refusal is an
//   `input-refused` event with its code, for the screen to explain (RF-3.25);
// - a paste with a line break waits for `pasteConfirm()`; nothing leaves before;
// - opening the tab makes it the active tab of its window on the desktop
//   (`activate-tab`, spec 0.4), once per opening: at the first moment the
//   session is `ready` with the tab in the tree, unless it already is the
//   active one. Not again on a reconnection nor on another pane. It is a
//   background action: a refusal or a failed result shows nothing.
//
// Nothing here logs content: no grid, history, keys, typed or pasted text,
// titles or directories. The pasted text waits in a closure, never in the store.

import { type StoreApi, createStore } from "zustand/vanilla";
import type { GridModel } from "@/grid/gridModel";
import { REQUEST_TIMEOUT_MS, type Scrollback } from "@/grid/scrollback";
import { type KeyBarId, isKeyBarModifier, namedKeyOf } from "@/input/keyBar";
import { type ModifierState, type ModifiersSnapshot, createModifierKeys } from "@/input/modifiers";
import type { PasteAnalysis } from "@/input/paste";
import { type InputRefusal, type SendResult, createInputSender } from "@/input/send";
import { type EventFields, type EventName, logEvent } from "@/log";
import {
  type ClientMessage,
  type Cursor,
  ErrorCode,
  type Message,
  type NamedKey,
  type Pane,
  type PaneId,
  type PaneNode,
  PaneState,
  type SubscriptionEndReason,
  type Tab,
  type TabId,
  type WorkspaceMessage,
  type WorkspaceWindow,
} from "@/protocol";
import { activateTab, startPane as startPaneAction } from "@/session/actions";
import type { Clock, Scheduler } from "@/session/clock";
import type { SendActionResult, SessionState, SessionStore } from "@/session/sessionStore";
import { type ProtocolFault, SubscriptionSet, type SubscriptionEvent } from "@/session/subscription";
import { findPane, leafPanes } from "@/workspace/layout";
import { tabsOf } from "@/workspace/selectors";

// ----------------------------------------------------------------- types

/**
 * Where the subscription of the pane on screen stands.
 * - `idle`: not opened yet, or closed.
 * - `disconnected`: the session is not `ready`; it is subscribed again when it is.
 * - `waiting-snapshot`: `subscribe` sent, the first `grid-snapshot` has not come.
 * - `live`: the grid is up to date.
 * - `unavailable`: the host refused or ended the subscription (`unavailable` says why).
 */
export type TerminalStatus = "idle" | "disconnected" | "waiting-snapshot" | "live" | "unavailable";

/** Why the subscription of the pane on screen is not there. Codes, never prose. */
export type UnavailableReason =
  /** The host answered the subscribe with `unknown-pane`, `too-many-subscriptions` or `not-subscribed`. */
  | { readonly kind: "refused"; readonly code: ErrorCode }
  /** The host ended it (`subscription-ended`: the pane closed, or its limit). */
  | { readonly kind: "ended"; readonly reason: SubscriptionEndReason }
  /** `max_subscriptions` of the `welcome` is reached; nothing was sent. */
  | { readonly kind: "limit" };

/** Why the tab on screen no longer exists (RF-2.11). */
export type TabGoneReason =
  /** The tab left the tree of the same desktop instance. */
  | "closed"
  /** The desktop restarted (`host_instance` changed): its ids mean other things now. */
  | "restarted";

/** The history (scrollback) of the pane on screen. */
export interface HistoryView {
  /** History lines the host holds (`history` of the last grid message). */
  readonly lines: number;
  /** Lines already gone from the top of the host's history. */
  readonly dropped: number;
  /**
   * `lines + dropped`: grows by one for every line output pushes into the
   * history, so the offset of a line the user is reading grows by exactly the
   * growth of `total` (RF-3.12). See `historyGrowth`.
   */
  readonly total: number;
  /** Changes when offsets before and after are not comparable (a snapshot, another pane). */
  readonly generation: number;
  /** On the alternate screen there is no history (RF-3.13). */
  readonly alt: boolean;
  /** History requests in flight (0 once they were answered or timed out). */
  readonly loadingPages: number;
  /** The oldest line the host holds is cached (or there is no history): nothing more to load. */
  readonly reachedOldest: boolean;
}

/** The two modifiers of the bar (RF-3.16). */
export interface TerminalModifiers {
  readonly ctrl: ModifierState;
  readonly alt: ModifierState;
}

export interface TerminalState {
  readonly tabId: TabId;
  /** The pane on screen (the one subscribed), `null` before the tab was found. */
  readonly paneId: PaneId | null;
  /** The pane focused on the desktop. The app never changes it. */
  readonly focusedPaneId: PaneId | null;
  /** The panes of the tab in reading order, for the pane picker. */
  readonly panes: readonly Pane[];
  /** The pane tree of the tab, for the mini-layout (`layoutRects`). */
  readonly layout: PaneNode | null;
  /** State of the pane on screen in the last `workspace`. */
  readonly paneState: PaneState | null;
  /** Exit code of the pane on screen when it is `exited`. */
  readonly exitCode: number | null;
  readonly status: TerminalStatus;
  /** Set when `status` is `unavailable`. */
  readonly unavailable: UnavailableReason | null;
  /** The grid on screen is the last one of the pane, not a live one. */
  readonly stale: boolean;
  /**
   * Changes at every snapshot, diff or history page applied to the pane on
   * screen, and when the grid object changes: the renderer reads the model
   * (`grid()`, `scrollback()`) and uses this to know it must redraw.
   */
  readonly version: number;
  /** Cursor, screen and size of the grid on screen (`null`/0 without one). */
  readonly cursor: Cursor | null;
  readonly alt: boolean;
  readonly cols: number;
  readonly rows: number;
  readonly history: HistoryView;
  readonly modifiers: TerminalModifiers;
  /** A paste waiting for the user's confirmation (RF-3.17): what the dialog shows. */
  readonly paste: PasteAnalysis | null;
  /** Set once the tab no longer exists (RF-2.11); the controller then does nothing more. */
  readonly tabGone: TabGoneReason | null;
  /** Input may go: the pane is `running`, subscribed and live, and the session `ready` (RF-3.18). */
  readonly canType: boolean;
}

/** What the screen reacts to once, as opposed to read as state. */
export type TerminalEvent =
  /** The bell rang in the pane on screen; `vibrate` already weighs the setting (RF-3.23). */
  | { readonly type: "bell"; readonly pane: PaneId; readonly vibrate: boolean }
  /** An input was not sent (or the host refused it), with the reason code (RF-3.25). */
  | { readonly type: "input-refused"; readonly code: InputRefusal }
  /** The tab on screen no longer exists (RF-2.11): go back to the tree and say why. */
  | { readonly type: "tab-gone"; readonly reason: TabGoneReason }
  /** A grid message broke the protocol: the session is being aborted (spec 03 §5.3). */
  | { readonly type: "protocol-fault"; readonly fault: ProtocolFault };

export type PasteRequestResult =
  /** The text has a line break: show `analysis`, then `pasteConfirm()` or `pasteCancel()`. */
  | { readonly needsConfirmation: true; readonly analysis: PasteAnalysis }
  /** Sent right away, or refused (an `input-refused` event says why). */
  | { readonly needsConfirmation: false; readonly sent: boolean };

export interface TerminalSessionDeps {
  readonly session: SessionStore;
  readonly tabId: TabId;
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  /** `settings.bellVibration`, read at every bell. */
  readonly bellVibrationEnabled: () => boolean;
  /** The event logger (default `logEvent`); only events and codes reach it. */
  readonly log?: (name: EventName, fields?: EventFields) => void;
}

export interface TerminalSession {
  readonly store: StoreApi<TerminalState>;
  getState(): TerminalState;
  /** The grid on screen, live or the last one (`stale`); read in place, never copied. */
  grid(): GridModel | null;
  /** The history cache of the live subscription, `null` without one. */
  scrollback(): Scrollback | null;
  /** Starts following the session and subscribes the focused pane of the tab. Once. */
  open(): void;
  /** Shows another pane of the tab: the old subscription is cancelled first. False for a pane the tab does not have. */
  selectPane(pane: PaneId): boolean;
  /** Cancels the subscription (`unsubscribe`) and lets go of everything. Final. */
  close(): void;
  /**
   * The viewport shows history down from `viewportTopOffset` (0 = the line
   * right above the screen), `count` lines: asks for the part not cached yet,
   * at most 500 lines per request (RF-3.11). True when a request went out.
   */
  requestHistory(viewportTopOffset: number, count: number): boolean;
  /** Text of the system keyboard (RF-3.14); one character with a modifier armed goes as `key` (RF-3.16). */
  typeText(text: string): boolean;
  /** A button of the key bar (RF-3.15): a key goes with the armed modifiers; `ctrl`/`alt` tap the modifier; `fn` does nothing. */
  pressKey(id: KeyBarId): boolean;
  /** Any named key (e.g. `backspace`, `enter` from the system keyboard), with the armed modifiers. */
  pressNamedKey(key: NamedKey): boolean;
  /** Off -> once -> locked -> off (RF-3.16). */
  tapModifier(modifier: "ctrl" | "alt"): void;
  /** Paste (RF-3.17): with a line break, nothing goes before `pasteConfirm()`. */
  pasteRequest(text: string): PasteRequestResult;
  /** Sends the paste waiting for confirmation. False when there is none or it was refused. */
  pasteConfirm(): boolean;
  /** Drops the paste waiting for confirmation; nothing is sent. */
  pasteCancel(): void;
  /** `start-pane` for the pane on screen (RF-3.20, RF-3.22). */
  startPane(): SendActionResult;
  onEvent(listener: (event: TerminalEvent) => void): () => void;
}

/**
 * How many lines a line being read moved up in the history between two
 * states (RF-3.12): what `anchorScrollOnHistoryGrowth` takes. 0 when the
 * offsets are not comparable (another generation, the alternate screen).
 */
export function historyGrowth(previous: HistoryView, next: HistoryView): number {
  if (previous.generation !== next.generation || previous.alt || next.alt) {
    return 0;
  }
  return Math.max(0, next.total - previous.total);
}

// ----------------------------------------------------------------- helpers

const EMPTY_HISTORY: HistoryView = {
  lines: 0,
  dropped: 0,
  total: 0,
  generation: 0,
  alt: false,
  loadingPages: 0,
  reachedOldest: true,
};

/** Subscribe answers that leave the pane without a subscription. */
const SUBSCRIPTION_REFUSALS: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  ErrorCode.unknownPane,
  ErrorCode.tooManySubscriptions,
  ErrorCode.notSubscribed,
]);

/** The tab with id `id` as the tree has it and its window, wherever it sits. */
function locateTab(
  workspace: WorkspaceMessage | null,
  id: TabId,
): { readonly tab: Tab; readonly window: WorkspaceWindow } | undefined {
  if (workspace === null) {
    return undefined;
  }
  for (const win of workspace.windows) {
    for (const tab of tabsOf(win)) {
      if (tab.tab === id) {
        return { tab, window: win };
      }
    }
  }
  return undefined;
}

/** The tab with id `id` as the tree has it, wherever it sits. */
function findRawTab(workspace: WorkspaceMessage | null, id: TabId): Tab | undefined {
  return locateTab(workspace, id)?.tab;
}

/** The pane a tab opens on: its focused one, else its first (a malformed tree). */
function defaultPane(tab: Tab): PaneId | null {
  if (findPane(tab.layout, tab.focused) !== undefined) {
    return tab.focused;
  }
  return leafPanes(tab.layout)[0]?.pane ?? null;
}

function modifiersOf(snapshot: ModifiersSnapshot): TerminalModifiers {
  return { ctrl: snapshot.ctrl, alt: snapshot.alt };
}

// ----------------------------------------------------------------- controller

export function createTerminalSession(deps: TerminalSessionDeps): TerminalSession {
  const { session, tabId, clock, scheduler } = deps;
  const log = deps.log ?? logEvent;
  const modifiers = createModifierKeys();
  const listeners = new Set<(event: TerminalEvent) => void>();

  let opened = false;
  let closed = false;
  /** The pane on screen. */
  let viewed: PaneId | null = null;
  let status: TerminalStatus = "idle";
  let unavailable: UnavailableReason | null = null;
  let tabGone: TabGoneReason | null = null;
  /** `host_instance` the tab id belongs to. */
  let instance: string | null = null;
  /** The last grid of the viewed pane that had a state, kept for display while there is no live one. */
  let lastGrid: GridModel | null = null;
  let version = 0;
  let generation = 0;
  /** A `grid-snapshot` of the viewed pane is being applied: offsets start over. */
  let snapshotIncoming = false;
  /** When the last history request went out; requests older than the timeout count as gone. */
  let lastHistoryRequestAt: number | null = null;
  let historyTimer: unknown = null;
  /** The paste waiting for confirmation and its pane. Never in the store. */
  let pending: { readonly text: string; readonly pane: PaneId } | null = null;
  let detach: (() => void)[] = [];
  /** `activate-tab` was sent for this opening, or was not needed: never again. */
  let activationSettled = false;
  /** The pane list of the last layout seen, so an unchanged tree keeps the same array. */
  let paneList: { readonly layout: PaneNode; readonly panes: readonly Pane[] } | null = null;

  const isReady = (): boolean => session.getState().connection.state === "ready";
  const currentTab = (): Tab | undefined => findRawTab(session.getState().workspace, tabId);
  const paneInfo = (pane: PaneId | null): Pane | undefined => {
    const tab = currentTab();
    return pane === null || tab === undefined ? undefined : findPane(tab.layout, pane);
  };
  const welcomeMax = (): number => session.getState().connection.welcome?.maxSubscriptions ?? 1;

  function emit(event: TerminalEvent): void {
    for (const listener of [...listeners]) {
      listener(event);
    }
  }

  const set = new SubscriptionSet({
    send: (message: ClientMessage) => {
      // The session's own abort tells the host; the set's copy would be a second one.
      if (message.type === "error" && message.code === ErrorCode.protocol) {
        return;
      }
      session.send(message);
    },
    maxSubscriptions: welcomeMax(),
    nextRequestId: () => session.nextRequestId(),
    bellVibration: () => deps.bellVibrationEnabled(),
    onEvent: onSubscriptionEvent,
    onProtocolError,
  });

  const liveSub = () => (viewed === null ? undefined : set.get(viewed));

  const sender = createInputSender({
    send: (message) => {
      session.send(message);
    },
    modifiers,
    // Only a live subscription of a session that is up: the same rule as `canType`.
    isSubscribed: (pane) => tabGone === null && isReady() && set.isReady(pane),
    paneState: (pane) => paneInfo(pane)?.state,
  });

  // ------------------------------------------------------------ state

  const store = createStore<TerminalState>(() => ({
    tabId,
    paneId: null,
    focusedPaneId: null,
    panes: [],
    layout: null,
    paneState: null,
    exitCode: null,
    status: "idle",
    unavailable: null,
    stale: false,
    version: 0,
    cursor: null,
    alt: false,
    cols: 0,
    rows: 0,
    history: EMPTY_HISTORY,
    modifiers: modifiersOf(modifiers.snapshot()),
    paste: null,
    tabGone: null,
    canType: false,
  }));

  function panesOf(tab: Tab | undefined): readonly Pane[] {
    if (tab === undefined) {
      return [];
    }
    if (paneList === null || paneList.layout !== tab.layout) {
      paneList = { layout: tab.layout, panes: leafPanes(tab.layout) };
    }
    return paneList.panes;
  }

  function currentGrid(): GridModel | null {
    const sub = liveSub();
    if (sub !== undefined && sub.grid.hasState) {
      return sub.grid;
    }
    return lastGrid;
  }

  function historyView(): HistoryView {
    const sub = liveSub();
    if (sub === undefined || !sub.grid.hasState) {
      return { ...EMPTY_HISTORY, generation };
    }
    const scrollback = sub.scrollback;
    const recent =
      lastHistoryRequestAt !== null && clock.now() - lastHistoryRequestAt < REQUEST_TIMEOUT_MS;
    return {
      lines: scrollback.history,
      dropped: scrollback.dropped,
      total: scrollback.history + scrollback.dropped,
      generation,
      alt: scrollback.alt,
      loadingPages: recent ? scrollback.pendingRequests : 0,
      reachedOldest:
        scrollback.alt ||
        scrollback.history === 0 ||
        scrollback.lineAt(scrollback.history - 1) !== undefined,
    };
  }

  /** Recomputes the state from the session and the set; `redraw` bumps `version`. */
  function refresh(redraw = false): void {
    if (redraw) {
      version += 1;
    }
    const tab = tabGone === null ? currentTab() : undefined;
    const info = tab === undefined || viewed === null ? undefined : findPane(tab.layout, viewed);
    const sub = liveSub();
    const live = sub !== undefined && sub.grid.hasState;
    const grid = currentGrid();
    const paneState = info?.state ?? null;
    store.setState({
      paneId: viewed,
      focusedPaneId: tab?.focused ?? null,
      panes: panesOf(tab),
      layout: tab?.layout ?? null,
      paneState,
      exitCode: info?.exit ?? null,
      status,
      unavailable: status === "unavailable" ? unavailable : null,
      stale: !live && grid !== null,
      version,
      cursor: grid?.cursor ?? null,
      alt: grid?.alt ?? false,
      cols: grid?.cols ?? 0,
      rows: grid?.rowsCount ?? 0,
      history: historyView(),
      tabGone,
      canType:
        tabGone === null && status === "live" && live && isReady() && paneState === PaneState.running,
    });
  }

  // ------------------------------------------------------------ subscription

  function clearPaste(): void {
    if (pending !== null) {
      pending = null;
      store.setState({ paste: null });
    }
  }

  function clearHistoryTimer(): void {
    if (historyTimer !== null) {
      scheduler.clear(historyTimer);
      historyTimer = null;
    }
    lastHistoryRequestAt = null;
  }

  /** Makes `pane` the pane on screen and subscribes it when the session is up. */
  function subscribeTo(pane: PaneId): void {
    if (viewed !== pane) {
      if (viewed !== null && set.has(viewed)) {
        set.unsubscribe(viewed);
      }
      viewed = pane;
      lastGrid = null;
      generation += 1;
      modifiers.reset();
      clearPaste();
      clearHistoryTimer();
    }
    if (!isReady()) {
      status = "disconnected";
      refresh(true);
      return;
    }
    const result = set.subscribe(pane);
    if (result.ok) {
      status = set.isReady(pane) ? "live" : "waiting-snapshot";
      log("subscription_started");
    } else if (result.reason === "limit") {
      status = "unavailable";
      unavailable = { kind: "limit" };
    } else {
      status = "disconnected";
    }
    refresh(true);
  }

  /** The tree changed (or the session came back): follow the tab and its panes. */
  function reconcile(subscribeAgain: boolean): void {
    const tab = currentTab();
    if (tab === undefined) {
      markTabGone("closed");
      return;
    }
    const target =
      viewed !== null && findPane(tab.layout, viewed) !== undefined ? viewed : defaultPane(tab);
    if (target === null) {
      refresh();
      return;
    }
    if (target !== viewed || subscribeAgain) {
      subscribeTo(target);
      return;
    }
    refresh();
  }

  function markTabGone(reason: TabGoneReason): void {
    if (tabGone !== null) {
      return;
    }
    tabGone = reason;
    for (const pane of set.panes()) {
      set.unsubscribe(pane);
    }
    clearPaste();
    clearHistoryTimer();
    modifiers.reset();
    refresh(true);
    emit({ type: "tab-gone", reason });
  }

  function onSubscriptionEvent(event: SubscriptionEvent): void {
    if (event.pane !== viewed || tabGone !== null) {
      return;
    }
    switch (event.type) {
      case "grid": {
        const sub = set.get(event.pane);
        if (sub !== undefined) {
          lastGrid = sub.grid;
        }
        if (snapshotIncoming) {
          snapshotIncoming = false;
          generation += 1;
        }
        status = "live";
        unavailable = null;
        refresh(true);
        return;
      }
      case "scrollback":
        refresh(true);
        return;
      case "ended":
        status = "unavailable";
        unavailable = { kind: "ended", reason: event.reason };
        log("subscription_ended", { reason: event.reason });
        refresh(true);
        return;
      case "refused":
        if (SUBSCRIPTION_REFUSALS.has(event.code)) {
          status = "unavailable";
          unavailable = { kind: "refused", code: event.code };
          refresh(true);
        }
        if (event.code === ErrorCode.paneNotRunning) {
          emit({ type: "input-refused", code: "not-running" });
        } else if (event.code === ErrorCode.notSubscribed) {
          emit({ type: "input-refused", code: "not-subscribed" });
        }
        return;
      case "bell":
        emit({ type: "bell", pane: event.pane, vibrate: event.vibrate });
        return;
    }
  }

  function onProtocolError(fault: ProtocolFault): void {
    emit({ type: "protocol-fault", fault });
    // Ends the session; the session store's change then drops the subscriptions.
    session.abort(fault);
    refresh(true);
  }

  function onHostMessage(message: Message): void {
    if (closed) {
      return;
    }
    if (message.type === "grid-snapshot" && message.pane === viewed) {
      snapshotIncoming = true;
    }
    set.handle(message);
    snapshotIncoming = false;
  }

  // ------------------------------------------------------------ activation

  /**
   * Makes the tab the active one of its window on the desktop, once per
   * opening, at the first moment the session is `ready` with the tab in the
   * tree. A background action: the result is not looked at, and its failure
   * is silent in the session store (`isBackgroundAction`).
   */
  function activateOnce(): void {
    if (activationSettled || !opened || closed || tabGone !== null || !isReady()) {
      return;
    }
    const located = locateTab(session.getState().workspace, tabId);
    if (located === undefined) {
      return;
    }
    activationSettled = true;
    if (located.window.active === tabId) {
      return;
    }
    session.sendAction((id) => activateTab(id, tabId));
  }

  // ------------------------------------------------------------ session

  function enterReady(state: SessionState): void {
    const welcome = state.connection.welcome;
    if (instance !== null && welcome !== null && welcome.hostInstance !== instance) {
      markTabGone("restarted");
      return;
    }
    instance = welcome?.hostInstance ?? instance;
    set.reset(welcomeMax());
    reconcile(true);
  }

  function leaveReady(): void {
    const sub = liveSub();
    if (sub !== undefined && sub.grid.hasState) {
      lastGrid = sub.grid;
    }
    set.reset();
    clearHistoryTimer();
    if (tabGone === null) {
      status = "disconnected";
      unavailable = null;
    }
    refresh(true);
  }

  function onSessionChange(next: SessionState, previous: SessionState): void {
    if (closed || tabGone !== null) {
      return;
    }
    const wasReady = previous.connection.state === "ready";
    const ready = next.connection.state === "ready";
    if (wasReady && !ready) {
      leaveReady();
    } else if (!wasReady && ready) {
      enterReady(next);
    } else if (ready && next.workspace !== previous.workspace) {
      reconcile(false);
    }
    activateOnce();
  }

  // ------------------------------------------------------------ input

  function refuse(code: InputRefusal): false {
    emit({ type: "input-refused", code });
    return false;
  }

  function outcome(result: SendResult): boolean {
    return result.ok ? true : refuse(result.reason);
  }

  // ------------------------------------------------------------ API

  return {
    store,
    getState: () => store.getState(),
    grid: currentGrid,
    scrollback: () => {
      const sub = liveSub();
      return sub !== undefined && sub.grid.hasState ? sub.scrollback : null;
    },

    open(): void {
      if (opened || closed) {
        return;
      }
      opened = true;
      detach = [
        session.onMessage(onHostMessage),
        session.store.subscribe(onSessionChange),
        modifiers.subscribe((snapshot) => {
          store.setState({ modifiers: modifiersOf(snapshot) });
        }),
      ];
      const state = session.getState();
      instance = state.connection.welcome?.hostInstance ?? null;
      if (state.connection.state === "ready") {
        set.reset(welcomeMax());
        reconcile(true);
        activateOnce();
        return;
      }
      // Not up yet (or reconnecting): show what the tree says, subscribe at `ready`.
      const tab = currentTab();
      const pane = tab === undefined ? null : defaultPane(tab);
      if (pane !== null) {
        subscribeTo(pane);
      } else {
        status = "disconnected";
        refresh(true);
      }
    },

    selectPane(pane): boolean {
      if (!opened || closed || tabGone !== null) {
        return false;
      }
      const tab = currentTab();
      if (tab === undefined || findPane(tab.layout, pane) === undefined) {
        return false;
      }
      if (pane === viewed && set.has(pane)) {
        return true;
      }
      subscribeTo(pane);
      return true;
    },

    close(): void {
      if (closed) {
        return;
      }
      closed = true;
      for (const pane of set.panes()) {
        set.unsubscribe(pane);
      }
      for (const off of detach) {
        off();
      }
      detach = [];
      clearHistoryTimer();
      clearPaste();
      modifiers.reset();
      lastGrid = null;
      status = "idle";
      unavailable = null;
      store.setState({
        status: "idle",
        unavailable: null,
        stale: false,
        canType: false,
        history: { ...EMPTY_HISTORY, generation },
      });
      listeners.clear();
    },

    requestHistory(viewportTopOffset, count): boolean {
      if (closed || viewed === null || tabGone !== null || !isReady()) {
        return false;
      }
      const now = clock.now();
      const sent = set.requestScrollback(viewed, viewportTopOffset, count, now);
      if (sent) {
        lastHistoryRequestAt = now;
        if (historyTimer !== null) {
          scheduler.clear(historyTimer);
        }
        // Clears the loading state of requests the host never answered.
        historyTimer = scheduler.set(() => {
          historyTimer = null;
          if (!closed) {
            refresh();
          }
        }, REQUEST_TIMEOUT_MS);
      }
      refresh();
      return sent;
    },

    typeText(text): boolean {
      if (viewed === null || closed) {
        return refuse("not-subscribed");
      }
      return outcome(sender.typeText(viewed, text));
    },

    pressKey(id): boolean {
      if (isKeyBarModifier(id)) {
        if (closed) {
          return false;
        }
        modifiers.tap(id);
        return true;
      }
      const key = namedKeyOf(id);
      if (key === null) {
        return false;
      }
      if (viewed === null || closed) {
        return refuse("not-subscribed");
      }
      // Esc does not spend an armed modifier (anatomy §4.8): it goes plain and
      // the modifier stays armed for the next key.
      return outcome(sender.pressNamed(viewed, key, { keepModifiers: id === "esc" }));
    },

    pressNamedKey(key): boolean {
      if (viewed === null || closed) {
        return refuse("not-subscribed");
      }
      return outcome(sender.pressNamed(viewed, key));
    },

    tapModifier(modifier): void {
      if (!closed) {
        modifiers.tap(modifier);
      }
    },

    pasteRequest(text): PasteRequestResult {
      clearPaste();
      if (viewed === null || closed) {
        refuse("not-subscribed");
        return { needsConfirmation: false, sent: false };
      }
      const result = sender.paste(viewed, text);
      if (result.ok) {
        return { needsConfirmation: false, sent: true };
      }
      if (result.reason === "needs-confirmation") {
        pending = { text, pane: viewed };
        store.setState({ paste: result.analysis });
        return { needsConfirmation: true, analysis: result.analysis };
      }
      refuse(result.reason);
      return { needsConfirmation: false, sent: false };
    },

    pasteConfirm(): boolean {
      const waiting = pending;
      if (waiting === null || closed) {
        return false;
      }
      clearPaste();
      const result = sender.paste(waiting.pane, waiting.text, { confirmed: true });
      // `confirmed` never asks again; the guard only narrows the type.
      return result.ok || result.reason === "needs-confirmation" ? result.ok : refuse(result.reason);
    },

    pasteCancel(): void {
      clearPaste();
    },

    startPane(): SendActionResult {
      const pane = viewed;
      if (pane === null || closed || tabGone !== null) {
        return { ok: false, reason: "not-ready" };
      }
      return session.sendAction((id) => startPaneAction(id, pane));
    },

    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
