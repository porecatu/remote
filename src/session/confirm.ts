// SPDX-License-Identifier: GPL-3.0-or-later

// Confirmation requests of close actions (spec 03 §7, PRD-004 RF-4.2). The
// host asks the client that requested the action; if nobody answers in 60 s
// the host ends the action with `confirm-timeout`, and the app, which counts
// the same 60 s from when the request arrived, drops the dialog on its own and
// tells the user nothing was closed. Pure: `now` (ms) comes from the caller.

import type { Confirm, ConfirmKind, ConfirmRequest, RequestId } from "@/protocol";

export const CONFIRM_TIMEOUT_MS = 60_000;

export interface PendingConfirm {
  /** The id of the action being confirmed. */
  readonly id: RequestId;
  readonly kind: ConfirmKind;
  /** Process names to list in the dialog. */
  readonly processes: readonly string[];
  readonly receivedAt: number;
  readonly expiresAt: number;
}

/** Confirmations in arrival order; the first is the one on screen. */
export type ConfirmState = readonly PendingConfirm[];

export function createConfirmState(): ConfirmState {
  return [];
}

/** A `confirm-request` arrived. A repeated id replaces the earlier entry. */
export function receiveConfirmRequest(
  state: ConfirmState,
  message: ConfirmRequest,
  now: number,
): ConfirmState {
  const entry: PendingConfirm = {
    id: message.id,
    kind: message.kind,
    processes: [...message.processes],
    receivedAt: now,
    expiresAt: now + CONFIRM_TIMEOUT_MS,
  };
  return [...state.filter((item) => item.id !== message.id), entry];
}

/** The confirmation the dialog shows, or null. */
export function activeConfirm(state: ConfirmState): PendingConfirm | null {
  return state[0] ?? null;
}

/** Milliseconds left of a confirmation (0 when expired). */
export function confirmRemainingMs(entry: PendingConfirm, now: number): number {
  return Math.max(0, entry.expiresAt - now);
}

export interface AnswerStep {
  readonly state: ConfirmState;
  /** The `confirm` to send, or null when the id is not pending (already expired or answered). */
  readonly message: Confirm | null;
}

/** The user chose Close (`accept = true`) or Cancel. */
export function answerConfirm(state: ConfirmState, id: RequestId, accept: boolean): AnswerStep {
  if (!state.some((item) => item.id === id)) {
    return { state, message: null };
  }
  return {
    state: state.filter((item) => item.id !== id),
    message: { type: "confirm", id, accept },
  };
}

export interface ExpireStep {
  readonly state: ConfirmState;
  /** Confirmations dropped on timeout: the UI says nothing was closed. */
  readonly expired: readonly PendingConfirm[];
}

/** Drops the confirmations whose 60 s passed. */
export function expireConfirms(state: ConfirmState, now: number): ExpireStep {
  const expired = state.filter((item) => now >= item.expiresAt);
  if (expired.length === 0) {
    return { state, expired };
  }
  return { state: state.filter((item) => now < item.expiresAt), expired };
}

/** The action ended (its `action-result` arrived): its dialog, if any, goes away. */
export function dropConfirm(state: ConfirmState, id: RequestId): ConfirmState {
  return state.some((item) => item.id === id) ? state.filter((item) => item.id !== id) : state;
}

/** When `expireConfirms` should run next, or null when none is pending. */
export function nextConfirmDeadline(state: ConfirmState): number | null {
  let earliest: number | null = null;
  for (const item of state) {
    if (earliest === null || item.expiresAt < earliest) {
      earliest = item.expiresAt;
    }
  }
  return earliest;
}
