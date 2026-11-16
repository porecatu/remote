// SPDX-License-Identifier: GPL-3.0-or-later

// Request ids and the per-item pending state of actions (PRD-004 RF-4.9,
// RF-4.10; spec 03 §7). Pure and immutable: the clock (`now`, ms) always
// comes from the caller, and nothing here sends or logs anything.
//
// Life of an action: `trackAction` when it is sent -> `applyActionResult`
// when its `action-result` arrives. A `new-tab` that succeeded keeps a
// "waiting" entry until the tab shows up in a later `workspace`
// (`observeTabs`) or `NEW_TAB_APPEAR_TIMEOUT_MS` passes (`expireWaiting`).

import type { Action, ActionResult, ErrorCode, RequestId, TabId } from "@/protocol";
import { ErrorCode as Codes } from "@/protocol";
import { type ItemRef, itemKey, targetsOf } from "./actions";

/** How long a created tab may take to appear in the workspace (spec 03 §7). */
export const NEW_TAB_APPEAR_TIMEOUT_MS = 5000;

export interface RequestIdAllocator {
  next(): RequestId;
}

export interface AllocatorOptions {
  /** First id handed out (default 1). */
  readonly start?: number;
  /** Ids that must be skipped because a request with them is still pending. */
  readonly isInUse?: (id: RequestId) => boolean;
}

/**
 * Ids are unique among the pending requests of a session (spec 03 §2), and
 * scrollback and actions share one allocator. A counter that skips ids in use
 * and wraps back to 1 before leaving the safe-integer range.
 */
export function createRequestIdAllocator(options: AllocatorOptions = {}): RequestIdAllocator {
  let counter = options.start ?? 1;
  const isInUse = options.isInUse;
  return {
    next(): RequestId {
      for (let guard = 0; guard < 1_000_000; guard += 1) {
        if (counter > Number.MAX_SAFE_INTEGER) {
          counter = 1;
        }
        const id = counter;
        counter += 1;
        if (isInUse === undefined || !isInUse(id)) {
          return id;
        }
      }
      throw new Error("no free request id");
    },
  };
}

export interface PendingAction {
  readonly id: RequestId;
  readonly action: Action;
  readonly targets: readonly ItemRef[];
  readonly sentAt: number;
}

export interface WaitingTab {
  /** The `new-tab` request that created it. */
  readonly id: RequestId;
  readonly tab: TabId;
  readonly deadline: number;
}

export interface RequestsState {
  readonly pending: ReadonlyMap<RequestId, PendingAction>;
  readonly waiting: ReadonlyMap<RequestId, WaitingTab>;
}

export function createRequestsState(): RequestsState {
  return { pending: new Map(), waiting: new Map() };
}

/** The request is in flight (use it as the allocator's `isInUse`). */
export function isRequestPending(state: RequestsState, id: RequestId): boolean {
  return state.pending.has(id) || state.waiting.has(id);
}

/** An item with an action awaiting its result (RF-4.9: it accepts no other action). */
export function isItemPending(state: RequestsState, item: ItemRef): boolean {
  const key = itemKey(item);
  for (const entry of state.pending.values()) {
    if (entry.targets.some((target) => itemKey(target) === key)) {
      return true;
    }
  }
  return false;
}

/** False when the action touches any item that is already pending. */
export function canSendAction(state: RequestsState, action: Action): boolean {
  return !targetsOf(action.do).some((target) => isItemPending(state, target));
}

/** Registers a sent action. The caller checks `canSendAction` first. */
export function trackAction(state: RequestsState, action: Action, now: number): RequestsState {
  const pending = new Map(state.pending);
  pending.set(action.id, {
    id: action.id,
    action,
    targets: targetsOf(action.do),
    sentAt: now,
  });
  return { pending, waiting: state.waiting };
}

/**
 * What the UI does with a failed action (RF-4.10). The text is the caller's
 * choice from the code: this module only classifies.
 */
export interface ActionFailure {
  readonly code: ErrorCode;
  /** `cancelled`: the user declined, so no message is shown. */
  readonly silent: boolean;
  /** `unknown-*`: the tree is stale, so the caller refreshes the view. */
  readonly staleTree: boolean;
}

const STALE_TREE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  Codes.unknownWindow,
  Codes.unknownGroup,
  Codes.unknownTab,
  Codes.unknownPane,
  Codes.unknownProfile,
]);

export function classifyFailure(code: ErrorCode): ActionFailure {
  return {
    code,
    silent: code === Codes.cancelled,
    staleTree: STALE_TREE_CODES.has(code),
  };
}

export type ActionOutcome =
  /** The id is not pending (late, duplicated or from another session). */
  | { readonly status: "unknown" }
  | { readonly status: "failed"; readonly request: PendingAction; readonly failure: ActionFailure }
  | { readonly status: "done"; readonly request: PendingAction }
  /** `new-tab` succeeded; the tab is not in the workspace yet. */
  | { readonly status: "waiting-tab"; readonly request: PendingAction; readonly tab: TabId }
  /** `new-tab` succeeded and the tab is already in the workspace. */
  | { readonly status: "created-tab"; readonly request: PendingAction; readonly tab: TabId };

export interface ResultStep {
  readonly state: RequestsState;
  readonly outcome: ActionOutcome;
}

/**
 * Applies an `action-result`. `knownTabs` is the set of tab ids of the latest
 * `workspace`: the workspace may arrive before the result, and then the tab
 * already counts as present.
 */
export function applyActionResult(
  state: RequestsState,
  result: ActionResult,
  now: number,
  knownTabs: ReadonlySet<TabId>,
): ResultStep {
  const request = state.pending.get(result.id);
  if (request === undefined) {
    return { state, outcome: { status: "unknown" } };
  }
  const pending = new Map(state.pending);
  pending.delete(result.id);
  const base: RequestsState = { pending, waiting: state.waiting };

  if (result.error !== undefined) {
    return {
      state: base,
      outcome: { status: "failed", request, failure: classifyFailure(result.error) },
    };
  }
  if (request.action.do.type !== "new-tab" || result.created === undefined) {
    return { state: base, outcome: { status: "done", request } };
  }
  const tab = result.created;
  if (knownTabs.has(tab)) {
    return { state: base, outcome: { status: "created-tab", request, tab } };
  }
  const waiting = new Map(state.waiting);
  waiting.set(result.id, { id: result.id, tab, deadline: now + NEW_TAB_APPEAR_TIMEOUT_MS });
  return { state: { pending, waiting }, outcome: { status: "waiting-tab", request, tab } };
}

export interface WaitingEvent {
  readonly id: RequestId;
  readonly tab: TabId;
  /** `appeared`: the tab is in the workspace; `timed-out`: it never came (error state). */
  readonly status: "appeared" | "timed-out";
}

export interface WaitingStep {
  readonly state: RequestsState;
  readonly events: readonly WaitingEvent[];
}

/** A `workspace` arrived: resolves the waiting tabs that are now present. */
export function observeTabs(state: RequestsState, tabs: ReadonlySet<TabId>): WaitingStep {
  if (state.waiting.size === 0) {
    return { state, events: [] };
  }
  const waiting = new Map(state.waiting);
  const events: WaitingEvent[] = [];
  for (const entry of state.waiting.values()) {
    if (tabs.has(entry.tab)) {
      waiting.delete(entry.id);
      events.push({ id: entry.id, tab: entry.tab, status: "appeared" });
    }
  }
  if (events.length === 0) {
    return { state, events };
  }
  return { state: { pending: state.pending, waiting }, events };
}

/** Times out the waiting tabs whose deadline passed. */
export function expireWaiting(state: RequestsState, now: number): WaitingStep {
  const waiting = new Map(state.waiting);
  const events: WaitingEvent[] = [];
  for (const entry of state.waiting.values()) {
    if (now >= entry.deadline) {
      waiting.delete(entry.id);
      events.push({ id: entry.id, tab: entry.tab, status: "timed-out" });
    }
  }
  if (events.length === 0) {
    return { state, events };
  }
  return { state: { pending: state.pending, waiting }, events };
}

/** When `expireWaiting` should run next, or null when nothing waits. */
export function nextWaitingDeadline(state: RequestsState): number | null {
  let earliest: number | null = null;
  for (const entry of state.waiting.values()) {
    if (earliest === null || entry.deadline < earliest) {
      earliest = entry.deadline;
    }
  }
  return earliest;
}

/**
 * The session dropped: nothing pending can be answered any more. Returns the
 * emptied state and the requests that were lost, so the UI clears the
 * indicators.
 */
export function dropAll(state: RequestsState): {
  readonly state: RequestsState;
  readonly lost: readonly PendingAction[];
} {
  return { state: createRequestsState(), lost: [...state.pending.values()] };
}
