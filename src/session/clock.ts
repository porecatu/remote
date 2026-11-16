// SPDX-License-Identifier: GPL-3.0-or-later

// The two sources of time the session layer receives from outside, so no
// module reads the clock or starts a timer on its own and every test can drive
// both by hand.

export interface Clock {
  /** Milliseconds: deadlines, backoff, request timeouts. Only differences matter. */
  now(): number;
  /** The wall clock as ISO 8601 UTC, for the status recorded in the desktop list. */
  iso(): string;
}

export interface Scheduler {
  /** Runs `callback` once after `delayMs`; the handle only goes back to `clear`. */
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  iso: () => new Date().toISOString(),
};

export const realScheduler: Scheduler = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};
