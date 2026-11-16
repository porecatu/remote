// SPDX-License-Identifier: GPL-3.0-or-later

// App lock state machine (PRD-001 RF-1.17 and RF-1.18). Pure: no timers, no
// native calls, no storage. Time comes in through the events (`now`, in ms, from
// a monotonic clock), authentication results come in as events, and the caller
// reads the new state and runs whatever it asks for (show the prompt, persist
// `appLock`, show the warning).
//
// Rules:
// - With the lock on, the app starts locked.
// - Coming back from the background after `LOCK_AFTER_BACKGROUND_MS` or more
//   locks it again; a shorter absence does not.
// - Turning the lock off requires a successful authentication.
// - A device with neither biometrics nor a passcode cannot authenticate, so the
//   lock is `unavailable`: the app opens without a lock and the state carries a
//   persistent warning, so the user is never locked out of their own app
//   (PRD-001 RF-1.20).

import type { AuthCapability, AuthFailure, AuthResult } from "./authenticate";

/** RF-1.17: "depois de 1 minuto". */
export const LOCK_AFTER_BACKGROUND_MS = 60_000;

export type LockStatus = "locked" | "unlocked" | "unavailable";

export interface AppLockState {
  /** The setting the user chose; the caller persists it when it changes. */
  readonly appLock: boolean;
  readonly capability: AuthCapability;
  /**
   * `locked`: show only the unlock screen. `unlocked`: show the app (also the
   * status while the lock is off). `unavailable`: lock on but the device cannot
   * authenticate, so the app is open with a warning.
   */
  readonly status: LockStatus;
  /** An authentication is wanted to turn the lock off (RF-1.18). */
  readonly pendingDisable: boolean;
  /** When the app left the foreground; null while it is in the foreground. */
  readonly backgroundedAt: number | null;
  /** Why the last attempt failed; cleared on the next success. */
  readonly lastFailure: AuthFailure | null;
}

export type AppLockEvent =
  | { readonly type: "background"; readonly now: number }
  | { readonly type: "foreground"; readonly now: number }
  /** The setting changed from outside (hot reload of settings, first turn-on). */
  | { readonly type: "config"; readonly appLock: boolean }
  | { readonly type: "capability"; readonly capability: AuthCapability }
  /** The user asked, in the settings, to turn the lock off. */
  | { readonly type: "disable-requested" }
  | { readonly type: "disable-cancelled" }
  | { readonly type: "auth-result"; readonly result: AuthResult };

function resolveStatus(
  appLock: boolean,
  capability: AuthCapability,
  current: LockStatus | null,
): LockStatus {
  if (!appLock) {
    return "unlocked";
  }
  if (capability === "unavailable") {
    return "unavailable";
  }
  // A lock that is on and could authenticate: keep an open session open, and
  // start locked when there is no session yet.
  return current === null ? "locked" : current === "unavailable" ? "locked" : current;
}

export function createAppLockState(
  appLock: boolean,
  capability: AuthCapability,
): AppLockState {
  return {
    appLock,
    capability,
    status: resolveStatus(appLock, capability, null),
    pendingDisable: false,
    backgroundedAt: null,
    lastFailure: null,
  };
}

function withSettings(
  state: AppLockState,
  appLock: boolean,
  capability: AuthCapability,
): AppLockState {
  const status = resolveStatus(appLock, capability, state.status);
  return {
    ...state,
    appLock,
    capability,
    status,
    // Nothing to authenticate for once the lock is off or cannot work.
    pendingDisable: state.pendingDisable && status === "unlocked" && appLock,
  };
}

export function reduceAppLock(state: AppLockState, event: AppLockEvent): AppLockState {
  switch (event.type) {
    case "background":
      // Keep the earliest instant if the platform reports it twice.
      return state.backgroundedAt === null
        ? { ...state, backgroundedAt: event.now }
        : state;

    case "foreground": {
      const since = state.backgroundedAt;
      const next = { ...state, backgroundedAt: null };
      if (since === null || state.status !== "unlocked" || !state.appLock) {
        return next;
      }
      // A clock that went backwards is not trusted: lock.
      const away = event.now - since;
      if (away >= LOCK_AFTER_BACKGROUND_MS || away < 0) {
        return { ...next, status: "locked", pendingDisable: false };
      }
      return next;
    }

    case "config":
      return withSettings(state, event.appLock, state.capability);

    case "capability":
      return withSettings(state, state.appLock, event.capability);

    case "disable-requested":
      if (!state.appLock) {
        return state;
      }
      if (state.status === "unavailable") {
        // Nothing can authenticate, so there is nothing to ask for.
        return { ...state, appLock: false, status: "unlocked", pendingDisable: false };
      }
      // Locked: the settings are not reachable. Unlocked: ask first.
      return state.status === "unlocked" ? { ...state, pendingDisable: true } : state;

    case "disable-cancelled":
      return state.pendingDisable ? { ...state, pendingDisable: false } : state;

    case "auth-result": {
      const { result } = event;
      if (result.kind === "unavailable") {
        return withSettings(
          { ...state, pendingDisable: false },
          state.appLock,
          "unavailable",
        );
      }
      if (result.kind === "failure") {
        // Stay locked; a failed attempt to disable ends the request.
        return { ...state, pendingDisable: false, lastFailure: result.reason };
      }
      if (state.pendingDisable) {
        return {
          ...state,
          appLock: false,
          status: "unlocked",
          pendingDisable: false,
          lastFailure: null,
        };
      }
      return state.status === "locked"
        ? { ...state, status: "unlocked", lastFailure: null }
        : { ...state, lastFailure: null };
    }
  }
}

/** True when the caller should run an authentication now. */
export function needsAuthentication(state: AppLockState): boolean {
  return state.status === "locked" || state.pendingDisable;
}

/** True when any desktop or terminal content may be shown. */
export function isContentVisible(state: AppLockState): boolean {
  return state.status !== "locked";
}

/** True while the lock is on but the device cannot authenticate. */
export function hasPersistentWarning(state: AppLockState): boolean {
  return state.status === "unavailable";
}
