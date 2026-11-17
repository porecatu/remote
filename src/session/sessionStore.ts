// SPDX-License-Identifier: GPL-3.0-or-later

// The store of one open desktop (docs/arquitetura.md §2): connection state,
// the last `workspace`, `profiles` and `theme`, the local group expansion,
// and the pending actions and confirmations. A zustand vanilla store, outside
// React: screens subscribe to it and call the methods of `SessionStore`, and
// only this module builds and sends protocol messages for them.
//
// What it consumes: `workspace`, `profiles`, `theme`, `action-result` and
// `confirm-request`. Everything else the host sends (grid, scrollback, bell,
// subscription and pane errors) goes to the `onMessage` listeners, which is
// where the subscription step plugs in. Nothing is written to disk and nothing
// about the messages is logged.

import { type StoreApi, createStore } from "zustand/vanilla";
import type {
  Action,
  GroupId,
  Message,
  Profiles,
  RequestId,
  TabId,
  Theme,
  WorkspaceMessage,
} from "@/protocol";
import { hexDecode } from "@/protocol";
import type { Desktop } from "@/storage/desktopList";
import {
  type ExpansionState,
  EMPTY_EXPANSION,
  bindHostInstance,
  reconcileExpansion,
  toggleExpansion,
} from "@/workspace/expansion";
import {
  type WorkspaceIdDiff,
  collectIds,
  diffWorkspaceIds,
} from "@/workspace/selectors";
import {
  type ConfirmState,
  type PendingConfirm,
  answerConfirm as answerConfirmEntry,
  createConfirmState,
  dropConfirm,
  expireConfirms,
  nextConfirmDeadline,
  receiveConfirmRequest,
} from "./confirm";
import {
  IDLE_SNAPSHOT,
  type Lifecycle,
  type LifecycleDeps,
  type LifecycleSnapshot,
  type SessionHandover,
  type WelcomeInfo,
  createLifecycle,
  isLiveState,
} from "./lifecycle";
import {
  type ActionOutcome,
  type PendingAction,
  type RequestsState,
  type WaitingEvent,
  applyActionResult,
  canSendAction,
  createRequestIdAllocator,
  createRequestsState,
  dropAll,
  expireWaiting,
  isRequestPending,
  nextWaitingDeadline,
  observeTabs,
  trackAction,
} from "./requests";

export interface SessionState {
  readonly desktopId: string;
  readonly connection: LifecycleSnapshot;
  /** The last tree, replaced whole by each `workspace`; kept while reconnecting. */
  readonly workspace: WorkspaceMessage | null;
  /**
   * What changed against the previous tree of the same desktop instance, so
   * the screen can tell whether the open tab or pane still exists (RF-2.11).
   * Null for the first tree and after the instance changed.
   */
  readonly workspaceDiff: WorkspaceIdDiff | null;
  readonly profiles: Profiles | null;
  readonly theme: Theme | null;
  /** Groups the user opened in the app although the desktop has them collapsed. */
  readonly expansion: ExpansionState;
  readonly requests: RequestsState;
  readonly confirms: ConfirmState;
}

/** What the screens need to react to once, as opposed to read as state. */
export type SessionEvent =
  | {
      readonly type: "action-outcome";
      readonly outcome: Exclude<ActionOutcome, { readonly status: "unknown" }>;
    }
  /** A tab created by an action appeared in the workspace, or never came. */
  | { readonly type: "tab-waiting"; readonly event: WaitingEvent }
  /** The session dropped with these actions unanswered. */
  | { readonly type: "actions-lost"; readonly lost: readonly PendingAction[] }
  /** The 60 s of these confirmations passed: nothing was closed. */
  | { readonly type: "confirm-expired"; readonly confirms: readonly PendingConfirm[] };

export type SendActionResult =
  | { readonly ok: true; readonly id: RequestId }
  | { readonly ok: false; readonly reason: "not-ready" | "busy" | "send-failed" };

export interface SessionStore {
  readonly desktopId: string;
  readonly store: StoreApi<SessionState>;
  getState(): SessionState;
  start(): void;
  /**
   * Starts on the connection a pairing left open (PRD-001 RF-1.10) instead of
   * connecting: `hello` goes on it. See `SessionHandover` for when to use it.
   */
  startAdopted(handover: SessionHandover): void;
  /** The user leaves the desktop. */
  close(): void;
  enterBackground(): void;
  enterForeground(): void;
  /** False unless the session is `ready`. */
  send(message: Message): boolean;
  /** The app found a protocol violation: tells the host and ends the session. */
  abort(code: string): void;
  /** A request id free among the pending ones; scrollback requests share it with actions. */
  nextRequestId(): RequestId;
  /** Builds the action with a fresh id, sends it and tracks it (RF-4.9: one pending action per item). */
  sendAction(build: (id: RequestId) => Action): SendActionResult;
  /** The user chose Close (`accept`) or Cancel on a confirmation. False when it is no longer pending. */
  answerConfirm(id: RequestId, accept: boolean): boolean;
  toggleGroupExpansion(group: GroupId): void;
  /** Runs the timeouts that fell due; it also runs by itself at the next deadline. */
  tick(): void;
  /** Every host message the store did not consume. */
  onMessage(listener: (message: Message) => void): () => void;
  onEvent(listener: (event: SessionEvent) => void): () => void;
  /** Closes the session and stops the timers. */
  dispose(): void;
}

export type SessionStoreDeps = Omit<LifecycleDeps, "desktop"> & {
  readonly desktop: Desktop;
};

export function createSessionStore(deps: SessionStoreDeps): SessionStore {
  const { clock, scheduler } = deps;
  const store = createStore<SessionState>(() => ({
    desktopId: deps.desktop.id,
    connection: IDLE_SNAPSHOT,
    workspace: null,
    workspaceDiff: null,
    profiles: null,
    theme: null,
    expansion: EMPTY_EXPANSION,
    requests: createRequestsState(),
    confirms: createConfirmState(),
  }));
  const allocator = createRequestIdAllocator({
    isInUse: (id) => isRequestPending(store.getState().requests, id),
  });
  const messageListeners = new Set<(message: Message) => void>();
  const eventListeners = new Set<(event: SessionEvent) => void>();
  let deadlineTimer: unknown = null;

  function emit(event: SessionEvent): void {
    for (const listener of [...eventListeners]) {
      listener(event);
    }
  }

  // ------------------------------------------------------------ deadlines

  function rescheduleDeadlines(): void {
    if (deadlineTimer !== null) {
      scheduler.clear(deadlineTimer);
      deadlineTimer = null;
    }
    const state = store.getState();
    const waiting = nextWaitingDeadline(state.requests);
    const confirm = nextConfirmDeadline(state.confirms);
    const due = waiting === null ? confirm : confirm === null ? waiting : Math.min(waiting, confirm);
    if (due === null) {
      return;
    }
    deadlineTimer = scheduler.set(() => {
      deadlineTimer = null;
      tick();
    }, Math.max(0, due - clock.now()));
  }

  store.subscribe((state, previous) => {
    if (state.requests !== previous.requests || state.confirms !== previous.confirms) {
      rescheduleDeadlines();
    }
  });

  function tick(): void {
    const now = clock.now();
    const state = store.getState();
    const waiting = expireWaiting(state.requests, now);
    const confirms = expireConfirms(state.confirms, now);
    if (waiting.events.length === 0 && confirms.expired.length === 0) {
      return;
    }
    store.setState({ requests: waiting.state, confirms: confirms.state });
    for (const event of waiting.events) {
      emit({ type: "tab-waiting", event });
    }
    if (confirms.expired.length > 0) {
      emit({ type: "confirm-expired", confirms: confirms.expired });
    }
  }

  // ------------------------------------------------------------ lifecycle

  function onChange(next: LifecycleSnapshot, previous: LifecycleSnapshot): void {
    if (isLiveState(previous.state) && !isLiveState(next.state)) {
      // Nothing pending can be answered any more.
      const { state: requests, lost } = dropAll(store.getState().requests);
      store.setState({ connection: next, requests, confirms: createConfirmState() });
      if (lost.length > 0) {
        emit({ type: "actions-lost", lost });
      }
      return;
    }
    store.setState({ connection: next });
  }

  function onWelcome(info: WelcomeInfo): void {
    const state = store.getState();
    const expansion = bindHostInstance(state.expansion, hexDecode(info.hostInstance) ?? new Uint8Array(16));
    if (info.instanceChanged) {
      // The ids of the old instance mean other things now (spec 03 §3).
      store.setState({
        expansion,
        workspace: null,
        workspaceDiff: null,
        requests: createRequestsState(),
        confirms: createConfirmState(),
      });
      return;
    }
    store.setState({ expansion });
  }

  function onMessage(message: Message): void {
    const state = store.getState();
    switch (message.type) {
      case "workspace": {
        const previous = state.workspace;
        const step = observeTabs(state.requests, collectIds(message).tabs);
        store.setState({
          workspace: message,
          workspaceDiff: previous === null ? null : diffWorkspaceIds(previous, message),
          expansion: reconcileExpansion(state.expansion, message),
          requests: step.state,
        });
        for (const event of step.events) {
          emit({ type: "tab-waiting", event });
        }
        return;
      }
      case "profiles":
        store.setState({ profiles: message });
        return;
      case "theme":
        store.setState({ theme: message });
        return;
      case "action-result": {
        const known: ReadonlySet<TabId> =
          state.workspace === null ? new Set<TabId>() : collectIds(state.workspace).tabs;
        const step = applyActionResult(state.requests, message, clock.now(), known);
        if (step.outcome.status === "unknown") {
          return;
        }
        store.setState({ requests: step.state, confirms: dropConfirm(state.confirms, message.id) });
        emit({ type: "action-outcome", outcome: step.outcome });
        return;
      }
      case "confirm-request":
        // Only the client that asked is asked: a request for an action that is not ours is ignored.
        if (state.requests.pending.has(message.id)) {
          store.setState({
            confirms: receiveConfirmRequest(state.confirms, message, clock.now()),
          });
        }
        return;
      default:
        for (const listener of [...messageListeners]) {
          listener(message);
        }
    }
  }

  const lifecycle: Lifecycle = createLifecycle(deps, { onChange, onWelcome, onMessage });

  // ------------------------------------------------------------ public API

  return {
    desktopId: deps.desktop.id,
    store,
    getState: () => store.getState(),
    start: () => {
      lifecycle.start();
    },
    startAdopted: (handover) => {
      lifecycle.adopt(handover);
    },
    close: () => {
      lifecycle.close();
    },
    enterBackground: () => {
      lifecycle.enterBackground();
    },
    enterForeground: () => {
      lifecycle.enterForeground();
    },
    send: (message) => lifecycle.send(message),
    abort: (code) => {
      lifecycle.abort(code);
    },
    nextRequestId: () => allocator.next(),

    sendAction(build): SendActionResult {
      if (store.getState().connection.state !== "ready") {
        return { ok: false, reason: "not-ready" };
      }
      const action = build(allocator.next());
      if (!canSendAction(store.getState().requests, action)) {
        return { ok: false, reason: "busy" };
      }
      if (!lifecycle.send(action)) {
        return { ok: false, reason: "send-failed" };
      }
      store.setState({ requests: trackAction(store.getState().requests, action, clock.now()) });
      return { ok: true, id: action.id };
    },

    answerConfirm(id, accept): boolean {
      const step = answerConfirmEntry(store.getState().confirms, id, accept);
      if (step.message === null) {
        return false;
      }
      store.setState({ confirms: step.state });
      return lifecycle.send(step.message);
    },

    toggleGroupExpansion(group): void {
      store.setState({ expansion: toggleExpansion(store.getState().expansion, group) });
    },

    tick,

    onMessage(listener) {
      messageListeners.add(listener);
      return () => {
        messageListeners.delete(listener);
      };
    },

    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },

    dispose(): void {
      lifecycle.close();
      if (deadlineTimer !== null) {
        scheduler.clear(deadlineTimer);
        deadlineTimer = null;
      }
      messageListeners.clear();
      eventListeners.clear();
    },
  };
}
