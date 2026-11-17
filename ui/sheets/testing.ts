// SPDX-License-Identifier: GPL-3.0-or-later
// A session for the tests of the sheets (menus, forms, new tab): a real
// `SessionState` store and a `sendAction` that keeps the session's local
// rules (one pending action per item, RF-4.9) and records what it would send,
// with no connection behind it. Not imported by app code.
import { createStore } from "zustand/vanilla";

import type { Action, ErrorCode, RequestId, Theme, WorkspaceMessage } from "@/protocol";
import { createConfirmState } from "@/session/confirm";
import { IDLE_SNAPSHOT } from "@/session/lifecycle";
import { applyActionResult, canSendAction, createRequestsState, trackAction } from "@/session/requests";
import type { SendActionResult, SessionState, SessionStore } from "@/session/sessionStore";
import { makeTheme } from "@/session/testing";
import { EMPTY_EXPANSION } from "@/workspace/expansion";
import { group, tab, win, workspace } from "@/workspace/testing";

import type { ActionRefusal } from "./menus/shared";

export type FakeSheetSession = SessionStore & {
  /** The actions that went out, in order. */
  readonly sent: readonly Action[];
  /** From now on `sendAction` refuses with this reason (`null`: sends again). */
  refuse(reason: ActionRefusal | null): void;
  /** The `action-result` of a sent action arrives (success, or `error`). */
  answer(id: RequestId, result?: { readonly error?: ErrorCode; readonly created?: number }): void;
  /** Replaces the tree, as a new `workspace` would. */
  setWorkspace(workspace: WorkspaceMessage | null): void;
};

export const TEST_DESKTOP_ID = "d".repeat(32);

/** A session store over `initial`; idle, with nothing pending. */
export function createFakeSheetSession(initial: Partial<SessionState> = {}): FakeSheetSession {
  const desktopId = initial.desktopId ?? TEST_DESKTOP_ID;
  const store = createStore<SessionState>()(() => ({
    connection: IDLE_SNAPSHOT,
    workspace: null,
    workspaceDiff: null,
    profiles: null,
    theme: null,
    expansion: EMPTY_EXPANSION,
    requests: createRequestsState(),
    confirms: createConfirmState(),
    ...initial,
    desktopId,
  }));
  const sent: Action[] = [];
  let nextId: RequestId = 1;
  let refusal: ActionRefusal | null = null;
  const nothing = () => undefined;
  return {
    desktopId,
    store,
    getState: () => store.getState(),
    start: nothing,
    startAdopted: nothing,
    close: nothing,
    enterBackground: nothing,
    enterForeground: nothing,
    send: () => false,
    abort: nothing,
    nextRequestId: () => nextId,
    sendAction(build): SendActionResult {
      if (refusal !== null) {
        return { ok: false, reason: refusal };
      }
      const action = build(nextId);
      nextId += 1;
      if (!canSendAction(store.getState().requests, action)) {
        return { ok: false, reason: "busy" };
      }
      sent.push(action);
      store.setState({ requests: trackAction(store.getState().requests, action, 0) });
      return { ok: true, id: action.id };
    },
    answerConfirm: () => false,
    toggleGroupExpansion: nothing,
    tick: nothing,
    onMessage: () => nothing,
    onEvent: () => nothing,
    dispose: nothing,
    sent,
    refuse(reason) {
      refusal = reason;
    },
    answer(id, result = {}) {
      const step = applyActionResult(
        store.getState().requests,
        { type: "action-result", id, ...result },
        0,
        new Set(),
      );
      store.setState({ requests: step.state });
    },
    setWorkspace(workspace) {
      store.setState({ workspace });
    },
  };
}

/**
 * The tree of the form sheet tests:
 * - window 1 (active tab 2): pinned tab 1; loose tab 2; group 10 "Servers"
 *   (color 1) with tab 3 (custom title "deploy") and tab 4; group 11 "Build"
 *   (color 0) with tab 5;
 * - window 2 (active tab "htop"): loose tab 6;
 * - window 3 (active tab "logs"): group 12 "Logs" with tabs 7 and 8.
 */
export function formsWorkspace(): WorkspaceMessage {
  return workspace([
    win(
      1,
      [
        tab(2, { title: "zsh" }),
        group(10, [tab(3, { title: "deploy", custom: true }), tab(4)], { name: "Servers", color: 1 }),
        group(11, [tab(5)], { name: "Build", color: 0 }),
      ],
      { title: "zsh", pinned: [tab(1, { title: "notes" })], active: 2 },
    ),
    win(2, [tab(6, { title: "htop" })], { title: "htop", active: 6 }),
    win(3, [group(12, [tab(7), tab(8)], { name: "Logs", color: 2 })], { title: "logs", active: 7 }),
  ]);
}

/** A desktop theme with three group colors. */
export function formsTheme(): Theme {
  return { ...makeTheme(), groupColors: [0xef8a8a, 0xe0b060, 0x5ed3bc] };
}
