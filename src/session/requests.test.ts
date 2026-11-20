// SPDX-License-Identifier: GPL-3.0-or-later

import { ErrorCode, ERROR_CODES, type ActionResult } from "@/protocol";
import { closeTab, newGroup, newTab, renameTab, restoreSession } from "./actions";
import {
  NEW_TAB_APPEAR_TIMEOUT_MS,
  applyActionResult,
  canSendAction,
  classifyFailure,
  createRequestIdAllocator,
  createRequestsState,
  dropAll,
  expireWaiting,
  isItemPending,
  isRequestPending,
  nextWaitingDeadline,
  observeTabs,
  trackAction,
} from "./requests";

const none: ReadonlySet<number> = new Set();

function ok(id: number, created?: number): ActionResult {
  return { type: "action-result", id, ...(created !== undefined ? { created } : {}) };
}

describe("request id allocator", () => {
  it("hands out increasing ids from 1", () => {
    const alloc = createRequestIdAllocator();
    expect([alloc.next(), alloc.next(), alloc.next()]).toEqual([1, 2, 3]);
  });

  it("skips ids still in use", () => {
    const busy = new Set([2, 3]);
    const alloc = createRequestIdAllocator({ isInUse: (id) => busy.has(id) });
    expect([alloc.next(), alloc.next(), alloc.next()]).toEqual([1, 4, 5]);
  });

  it("wraps before leaving the safe-integer range", () => {
    const alloc = createRequestIdAllocator({ start: Number.MAX_SAFE_INTEGER });
    expect(alloc.next()).toBe(Number.MAX_SAFE_INTEGER);
    expect(alloc.next()).toBe(1);
  });

  it("is driven by the tracker as isInUse", () => {
    let state = createRequestsState();
    const alloc = createRequestIdAllocator({ isInUse: (id) => isRequestPending(state, id) });
    const first = alloc.next();
    state = trackAction(state, closeTab(first, 1), 0);
    expect(isRequestPending(state, first)).toBe(true);
  });
});

describe("pending items (RF-4.9)", () => {
  it("marks the target pending until the result and refuses another action on it", () => {
    let state = createRequestsState();
    const rename = renameTab(1, 7, "x");
    expect(canSendAction(state, rename)).toBe(true);
    state = trackAction(state, rename, 100);
    expect(isItemPending(state, { kind: "tab", id: 7 })).toBe(true);
    expect(canSendAction(state, closeTab(2, 7))).toBe(false);
    expect(canSendAction(state, closeTab(2, 8))).toBe(true);

    const step = applyActionResult(state, ok(1), 200, none);
    expect(step.outcome.status).toBe("done");
    expect(isItemPending(step.state, { kind: "tab", id: 7 })).toBe(false);
    expect(canSendAction(step.state, closeTab(2, 7))).toBe(true);
  });

  it("blocks new-group when any of its tabs is pending", () => {
    const state = trackAction(createRequestsState(), closeTab(1, 6), 0);
    expect(canSendAction(state, newGroup(2, [5, 6], "g"))).toBe(false);
    expect(canSendAction(state, newGroup(2, [5, 7], "g"))).toBe(true);
  });

  it("does not mutate the previous state", () => {
    const before = createRequestsState();
    trackAction(before, closeTab(1, 1), 0);
    expect(before.pending.size).toBe(0);
  });

  it("ignores a result for an id that is not pending", () => {
    const state = createRequestsState();
    const step = applyActionResult(state, ok(99), 0, none);
    expect(step.outcome).toEqual({ status: "unknown" });
    expect(step.state).toBe(state);
  });

  it("drops everything when the session ends", () => {
    let state = trackAction(createRequestsState(), closeTab(1, 1), 0);
    state = trackAction(state, closeTab(2, 2), 0);
    const dropped = dropAll(state);
    expect(dropped.lost.map((entry) => entry.id)).toEqual([1, 2]);
    expect(dropped.state.pending.size).toBe(0);
  });

});

describe("failures (RF-4.10)", () => {
  it("returns the error code of the result", () => {
    const state = trackAction(createRequestsState(), closeTab(1, 1), 0);
    const step = applyActionResult(
      state,
      { type: "action-result", id: 1, error: ErrorCode.busy },
      10,
      none,
    );
    expect(step.outcome).toMatchObject({
      status: "failed",
      failure: { code: ErrorCode.busy, silent: false, staleTree: false },
    });
    expect(step.state.pending.size).toBe(0);
  });

  it("cancelled is silent", () => {
    expect(classifyFailure(ErrorCode.cancelled)).toEqual({
      code: ErrorCode.cancelled,
      silent: true,
      staleTree: false,
    });
  });

  it("unknown-* codes mean a stale tree", () => {
    for (const code of [
      ErrorCode.unknownWindow,
      ErrorCode.unknownGroup,
      ErrorCode.unknownTab,
      ErrorCode.unknownPane,
      ErrorCode.unknownProfile,
    ]) {
      expect(classifyFailure(code).staleTree).toBe(true);
    }
  });

  it("unknown-session and session-unreadable are visible failures that leave the tree alone", () => {
    for (const code of [ErrorCode.unknownSession, ErrorCode.sessionUnreadable]) {
      expect(classifyFailure(code)).toEqual({ code, silent: false, staleTree: false });
    }
  });

  it("a failed restore-session is reported without a stale tree", () => {
    const state = trackAction(createRequestsState(), restoreSession(1, 7, 3), 0);
    const step = applyActionResult(
      state,
      { type: "action-result", id: 1, error: ErrorCode.unknownSession },
      10,
      none,
    );
    expect(step.outcome).toMatchObject({
      status: "failed",
      failure: { code: ErrorCode.unknownSession, silent: false, staleTree: false },
    });
  });

  it("classifies every code of the package", () => {
    for (const code of ERROR_CODES) {
      const failure = classifyFailure(code);
      expect(failure.code).toBe(code);
      expect(failure.silent).toBe(code === ErrorCode.cancelled);
    }
  });

  it("a failed new-tab never waits for a tab", () => {
    const state = trackAction(createRequestsState(), newTab(1, 2), 0);
    const step = applyActionResult(
      state,
      { type: "action-result", id: 1, error: ErrorCode.unknownProfile, created: 9 },
      10,
      none,
    );
    expect(step.outcome.status).toBe("failed");
    expect(step.state.waiting.size).toBe(0);
  });
});

describe("new-tab waits for the tab in the workspace", () => {
  it("is created at once when the workspace already has the tab", () => {
    const state = trackAction(createRequestsState(), newTab(1, 2), 0);
    const step = applyActionResult(state, ok(1, 50), 10, new Set([50]));
    expect(step.outcome).toMatchObject({ status: "created-tab", tab: 50 });
    expect(step.state.waiting.size).toBe(0);
  });

  it("waits, then resolves when a later workspace lists the tab", () => {
    let state = trackAction(createRequestsState(), newTab(1, 2), 0);
    const step = applyActionResult(state, ok(1, 50), 1000, new Set([1, 2]));
    expect(step.outcome).toMatchObject({ status: "waiting-tab", tab: 50 });
    state = step.state;
    expect(nextWaitingDeadline(state)).toBe(1000 + NEW_TAB_APPEAR_TIMEOUT_MS);

    const other = observeTabs(state, new Set([1, 2, 3]));
    expect(other.events).toEqual([]);
    expect(other.state).toBe(state);

    const seen = observeTabs(state, new Set([1, 2, 50]));
    expect(seen.events).toEqual([{ id: 1, tab: 50, status: "appeared" }]);
    expect(seen.state.waiting.size).toBe(0);
    expect(nextWaitingDeadline(seen.state)).toBeNull();
  });

  it("times out after 5 s", () => {
    let state = trackAction(createRequestsState(), newTab(1, 2), 0);
    state = applyActionResult(state, ok(1, 50), 1000, none).state;

    const early = expireWaiting(state, 5999);
    expect(early.events).toEqual([]);
    expect(early.state).toBe(state);

    const late = expireWaiting(state, 6000);
    expect(late.events).toEqual([{ id: 1, tab: 50, status: "timed-out" }]);
    expect(late.state.waiting.size).toBe(0);
  });

  it("only new-tab waits: new-group and others finish at the result", () => {
    const state = trackAction(createRequestsState(), newGroup(1, [5], "g"), 0);
    const step = applyActionResult(state, ok(1, 77), 10, none);
    expect(step.outcome.status).toBe("done");
    expect(step.state.waiting.size).toBe(0);
  });

  it("a waiting request still counts as an id in use", () => {
    let state = trackAction(createRequestsState(), newTab(1, 2), 0);
    state = applyActionResult(state, ok(1, 50), 10, none).state;
    expect(isRequestPending(state, 1)).toBe(true);
    expect(isItemPending(state, { kind: "window", id: 2 })).toBe(false);
  });
});
