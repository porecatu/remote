// SPDX-License-Identifier: GPL-3.0-or-later
import {
  BACKOFF_DELAYS_MS,
  beginAttempt,
  isRetryDue,
  resetBackoff,
  retryDelay,
  scheduleRetry,
} from "./backoff";

describe("backoff", () => {
  it("waits 1, 2, 4, 8 and 16 s", () => {
    expect(BACKOFF_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 16000]);
    let state = resetBackoff();
    let now = 10_000;
    const waited: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      state = scheduleRetry(state, now);
      const delay = retryDelay(state, now);
      expect(delay).not.toBeNull();
      waited.push(delay ?? -1);
      now = state.dueAt ?? now;
      state = beginAttempt(state);
    }
    expect(waited).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it("is exhausted after the fifth failed attempt", () => {
    let state = resetBackoff();
    for (let i = 0; i < 5; i += 1) {
      state = scheduleRetry(state, 0);
      expect(state.exhausted).toBe(false);
      state = beginAttempt(state);
    }
    state = scheduleRetry(state, 0);
    expect(state.exhausted).toBe(true);
    expect(state.dueAt).toBeNull();
    expect(isRetryDue(state, 1_000_000)).toBe(false);
    expect(retryDelay(state, 0)).toBeNull();
  });

  it("is due only from the scheduled instant", () => {
    const state = scheduleRetry(resetBackoff(), 500);
    expect(isRetryDue(state, 1499)).toBe(false);
    expect(isRetryDue(state, 1500)).toBe(true);
    expect(retryDelay(state, 1000)).toBe(500);
    expect(retryDelay(state, 9999)).toBe(0);
  });

  it("has nothing pending right after a reset or when an attempt begins", () => {
    const fresh = resetBackoff();
    expect(isRetryDue(fresh, 0)).toBe(false);
    expect(retryDelay(fresh, 0)).toBeNull();
    const begun = beginAttempt(scheduleRetry(fresh, 0));
    expect(begun.dueAt).toBeNull();
    expect(begun.attempts).toBe(1);
  });

  it("starts over from 1 s after a reset", () => {
    let state = resetBackoff();
    for (let i = 0; i < 3; i += 1) {
      state = beginAttempt(scheduleRetry(state, 0));
    }
    state = scheduleRetry(resetBackoff(), 0);
    expect(retryDelay(state, 0)).toBe(1000);
  });
});
