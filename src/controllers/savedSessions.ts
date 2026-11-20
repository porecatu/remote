// SPDX-License-Identifier: GPL-3.0-or-later

// The controller of the saved-sessions sheet (PRD-004 RF-4.12 to RF-4.16,
// anatomy §4.12.10): it asks the desktop for the list of saved named sessions
// (`list-sessions`, spec 03 §4.5), keeps the answer (`sessions`) while the
// sheet is open and sends `restore-session` for the row the user taps. Pure:
// no React; the sheet reads `store` and calls `load` and `restore`.
//
// Rules this file keeps:
// - `list-sessions` is a request, not an action: it has no pending entry in
//   the session store and no `action-result`. Its id comes from the session's
//   own allocator (`nextRequestId`), and only a `sessions` with that id is
//   taken; an answer with another id (a late one of an earlier `load`) is
//   ignored;
// - one request in flight at a time: `load` again (the "Try again" button, or
//   a reload) starts a new one and forgets the old, whose answer then counts
//   as late. No answer in `REQUEST_TIMEOUT_MS`, or the session leaving
//   `ready` with the request in flight, is `failed`;
// - the list is never kept between loads: `load` drops it before asking, a
//   failure has none and `dispose` drops it too;
// - `restore` is an ordinary action, sent and tracked by the session store
//   (`sendAction`): the sheet follows the pending state of the item in
//   `requests`, as the new-tab sheet does, and the failure notice comes from
//   the outcome of the action (`error.unknown-session`,
//   `error.session-unreadable`), not from here;
// - nothing is logged here: the names of the sessions are content.

import { type StoreApi, createStore } from "zustand/vanilla";
import { REQUEST_TIMEOUT_MS } from "@/grid/scrollback";
import type { Message, NamedSession, RequestId, SessionId, SessionsMode, WindowId } from "@/protocol";
import { restoreSession } from "@/session/actions";
import type { Scheduler } from "@/session/clock";
import type { SendActionResult, SessionStore } from "@/session/sessionStore";

// ----------------------------------------------------------------- types

/**
 * Where the list stands.
 * - `loading`: the initial state, and the state while a `list-sessions` is in
 *   flight (the sheet shows the spinner);
 * - `loaded`: the desktop answered; `list` may be empty (the sheet shows the
 *   empty text); `mode` says where `restore` takes the session to;
 * - `failed`: no answer in time, or the session was not (or stopped being)
 *   `ready`; `load()` is the "Try again".
 */
export type SavedSessionsState =
  | { readonly status: "loading" }
  | {
      readonly status: "loaded";
      readonly mode: SessionsMode;
      /** In the desktop's order: the most recently saved first. */
      readonly list: readonly NamedSession[];
    }
  | { readonly status: "failed" };

export interface SavedSessionsDeps {
  /** The session of the desktop; the same object `createTerminalSession` takes. */
  readonly session: SessionStore;
  /** Starts the 10 s deadline of the request. */
  readonly scheduler: Scheduler;
}

export interface SavedSessions {
  readonly store: StoreApi<SavedSessionsState>;
  getState(): SavedSessionsState;
  /**
   * Asks for the list: the state becomes `loading` and the previous list is
   * dropped. False (and the state `failed`) when nothing could be sent,
   * because the session is not `ready` or the controller was disposed.
   */
  load(): boolean;
  /**
   * `restore-session` for `session`, appended to `window` or, without it, in
   * a new window of the desktop. Returns what `SessionStore.sendAction`
   * returns: `{ ok: true, id }` (follow `id` in the store's `requests`) or
   * the refusal (`busy` when the window already has an action pending).
   */
  restore(session: SessionId, window?: WindowId): SendActionResult;
  /** Cancels the subscription and the deadline and drops the list. Final. */
  dispose(): void;
}

// ----------------------------------------------------------------- controller

export function createSavedSessions(deps: SavedSessionsDeps): SavedSessions {
  const { session: desktop, scheduler } = deps;
  const store = createStore<SavedSessionsState>(() => ({ status: "loading" }));
  let inFlight: RequestId | null = null;
  let timer: unknown = null;
  let disposed = false;

  function clearTimer(): void {
    if (timer !== null) {
      scheduler.clear(timer);
      timer = null;
    }
  }

  function fail(): void {
    inFlight = null;
    clearTimer();
    store.setState({ status: "failed" }, true);
  }

  function onMessage(message: Message): void {
    if (message.type !== "sessions" || inFlight === null || message.id !== inFlight) {
      return;
    }
    inFlight = null;
    clearTimer();
    store.setState({ status: "loaded", mode: message.mode, list: message.list }, true);
  }

  const detach: readonly (() => void)[] = [
    desktop.onMessage(onMessage),
    desktop.store.subscribe((next, previous) => {
      if (
        inFlight !== null &&
        previous.connection.state === "ready" &&
        next.connection.state !== "ready"
      ) {
        fail();
      }
    }),
  ];

  return {
    store,
    getState: () => store.getState(),

    load(): boolean {
      if (disposed) {
        return false;
      }
      clearTimer();
      const id = desktop.nextRequestId();
      // Before sending: the answer may come back inside `send`.
      inFlight = id;
      store.setState({ status: "loading" }, true);
      timer = scheduler.set(() => {
        timer = null;
        if (inFlight === id) {
          fail();
        }
      }, REQUEST_TIMEOUT_MS);
      if (!desktop.send({ type: "list-sessions", id })) {
        fail();
        return false;
      }
      return true;
    },

    restore(session, window): SendActionResult {
      return desktop.sendAction((id) => restoreSession(id, session, window));
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const off of detach) {
        off();
      }
      fail();
    },
  };
}
