// SPDX-License-Identifier: GPL-3.0-or-later

// Reconnection schedule after an unexpected drop (PRD-002 RF-2.4): five
// automatic attempts, waiting 1, 2, 4, 8 and 16 s. When they run out the
// caller offers a manual retry, which starts over with `resetBackoff`.
// Pure: the clock (`now`, in milliseconds) always comes from the caller.

export const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;

export interface BackoffState {
  /** Attempts already scheduled since the last successful connection. */
  readonly attempts: number;
  /** When the pending attempt is due, or null when none is pending. */
  readonly dueAt: number | null;
  /** True once every automatic attempt was used and none is pending. */
  readonly exhausted: boolean;
}

export function resetBackoff(): BackoffState {
  return { attempts: 0, dueAt: null, exhausted: false };
}

/**
 * Registers a failure (a drop, or a reconnection attempt that failed) and
 * schedules the next attempt, or marks the schedule as exhausted.
 */
export function scheduleRetry(state: BackoffState, now: number): BackoffState {
  const delay = BACKOFF_DELAYS_MS[state.attempts];
  if (delay === undefined) {
    return { attempts: state.attempts, dueAt: null, exhausted: true };
  }
  return { attempts: state.attempts + 1, dueAt: now + delay, exhausted: false };
}

/** The pending attempt is due (never true without a pending attempt). */
export function isRetryDue(state: BackoffState, now: number): boolean {
  return state.dueAt !== null && now >= state.dueAt;
}

/** Milliseconds until the pending attempt, or null when none is pending. */
export function retryDelay(state: BackoffState, now: number): number | null {
  if (state.dueAt === null) {
    return null;
  }
  return Math.max(0, state.dueAt - now);
}

/** An attempt starts: it is no longer pending, the counter stays. */
export function beginAttempt(state: BackoffState): BackoffState {
  return { attempts: state.attempts, dueAt: null, exhausted: false };
}
