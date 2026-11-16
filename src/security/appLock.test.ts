// SPDX-License-Identifier: GPL-3.0-or-later
import {
  LOCK_AFTER_BACKGROUND_MS,
  createAppLockState,
  hasPersistentWarning,
  isContentVisible,
  needsAuthentication,
  reduceAppLock,
  type AppLockEvent,
  type AppLockState,
} from "./appLock";

const OK: AppLockEvent = { type: "auth-result", result: { kind: "success" } };

function run(state: AppLockState, ...events: AppLockEvent[]): AppLockState {
  return events.reduce(reduceAppLock, state);
}

function unlocked(): AppLockState {
  return run(createAppLockState(true, "available"), OK);
}

describe("start", () => {
  it("starts locked with the lock on", () => {
    const s = createAppLockState(true, "available");
    expect(s.status).toBe("locked");
    expect(needsAuthentication(s)).toBe(true);
    expect(isContentVisible(s)).toBe(false);
  });

  it("starts unlocked with the lock off", () => {
    const s = createAppLockState(false, "available");
    expect(s.status).toBe("unlocked");
    expect(needsAuthentication(s)).toBe(false);
  });

  it("opens without a lock and warns when the device has no security", () => {
    const s = createAppLockState(true, "unavailable");
    expect(s.status).toBe("unavailable");
    expect(isContentVisible(s)).toBe(true);
    expect(needsAuthentication(s)).toBe(false);
    expect(hasPersistentWarning(s)).toBe(true);
  });

  it("does not warn with the lock off, even on an insecure device", () => {
    expect(hasPersistentWarning(createAppLockState(false, "unavailable"))).toBe(false);
  });
});

describe("unlock", () => {
  it("unlocks on success", () => {
    const s = unlocked();
    expect(s.status).toBe("unlocked");
    expect(isContentVisible(s)).toBe(true);
  });

  it.each(["cancelled", "lockout", "failed"] as const)(
    "stays locked after %s and records why",
    (reason) => {
      const s = run(createAppLockState(true, "available"), {
        type: "auth-result",
        result: { kind: "failure", reason },
      });
      expect(s.status).toBe("locked");
      expect(s.lastFailure).toBe(reason);
    },
  );

  it("clears the failure on the next success", () => {
    const s = run(
      createAppLockState(true, "available"),
      { type: "auth-result", result: { kind: "failure", reason: "failed" } },
      OK,
    );
    expect(s.lastFailure).toBeNull();
    expect(s.status).toBe("unlocked");
  });

  it("opens the app when authentication turns out to be unavailable", () => {
    const s = run(createAppLockState(true, "available"), {
      type: "auth-result",
      result: { kind: "unavailable" },
    });
    expect(s.status).toBe("unavailable");
    expect(hasPersistentWarning(s)).toBe(true);
  });
});

describe("background", () => {
  it("does not lock after less than a minute", () => {
    const s = run(
      unlocked(),
      { type: "background", now: 1_000 },
      { type: "foreground", now: 1_000 + LOCK_AFTER_BACKGROUND_MS - 1 },
    );
    expect(s.status).toBe("unlocked");
    expect(s.backgroundedAt).toBeNull();
  });

  it("locks at exactly a minute", () => {
    const s = run(
      unlocked(),
      { type: "background", now: 1_000 },
      { type: "foreground", now: 1_000 + LOCK_AFTER_BACKGROUND_MS },
    );
    expect(s.status).toBe("locked");
  });

  it("measures from the first background event", () => {
    const s = run(
      unlocked(),
      { type: "background", now: 0 },
      { type: "background", now: 50_000 },
      { type: "foreground", now: 61_000 },
    );
    expect(s.status).toBe("locked");
  });

  it("restarts the count on each trip", () => {
    const s = run(
      unlocked(),
      { type: "background", now: 0 },
      { type: "foreground", now: 30_000 },
      { type: "background", now: 30_000 },
      { type: "foreground", now: 80_000 },
    );
    expect(s.status).toBe("unlocked");
  });

  it("locks when the clock went backwards", () => {
    const s = run(
      unlocked(),
      { type: "background", now: 100_000 },
      { type: "foreground", now: 10_000 },
    );
    expect(s.status).toBe("locked");
  });

  it("never locks with the lock off", () => {
    const s = run(
      createAppLockState(false, "available"),
      { type: "background", now: 0 },
      { type: "foreground", now: 10 * LOCK_AFTER_BACKGROUND_MS },
    );
    expect(s.status).toBe("unlocked");
  });

  it("stays unavailable, not locked, on an insecure device", () => {
    const s = run(
      createAppLockState(true, "unavailable"),
      { type: "background", now: 0 },
      { type: "foreground", now: 10 * LOCK_AFTER_BACKGROUND_MS },
    );
    expect(s.status).toBe("unavailable");
  });

  it("a foreground without a background does nothing", () => {
    const s = run(unlocked(), { type: "foreground", now: 10 * LOCK_AFTER_BACKGROUND_MS });
    expect(s.status).toBe("unlocked");
  });

  it("drops a pending disable when the app locks", () => {
    const s = run(
      unlocked(),
      { type: "disable-requested" },
      { type: "background", now: 0 },
      { type: "foreground", now: LOCK_AFTER_BACKGROUND_MS },
    );
    expect(s.status).toBe("locked");
    expect(s.pendingDisable).toBe(false);
    expect(s.appLock).toBe(true);
  });
});

describe("turning the lock off", () => {
  it("asks for authentication first", () => {
    const s = run(unlocked(), { type: "disable-requested" });
    expect(s.pendingDisable).toBe(true);
    expect(s.appLock).toBe(true);
    expect(needsAuthentication(s)).toBe(true);
  });

  it("turns off only after a successful authentication", () => {
    const s = run(unlocked(), { type: "disable-requested" }, OK);
    expect(s.appLock).toBe(false);
    expect(s.status).toBe("unlocked");
    expect(s.pendingDisable).toBe(false);
    expect(needsAuthentication(s)).toBe(false);
  });

  it("keeps the lock on when authentication fails", () => {
    const s = run(unlocked(), { type: "disable-requested" }, {
      type: "auth-result",
      result: { kind: "failure", reason: "cancelled" },
    });
    expect(s.appLock).toBe(true);
    expect(s.pendingDisable).toBe(false);
    expect(s.status).toBe("unlocked");
  });

  it("can be cancelled", () => {
    const s = run(unlocked(), { type: "disable-requested" }, { type: "disable-cancelled" });
    expect(s.appLock).toBe(true);
    expect(s.pendingDisable).toBe(false);
  });

  it("cannot be requested while locked", () => {
    const s = run(createAppLockState(true, "available"), { type: "disable-requested" });
    expect(s.pendingDisable).toBe(false);
    expect(s.appLock).toBe(true);
  });

  it("turns off at once on a device that cannot authenticate", () => {
    const s = run(createAppLockState(true, "unavailable"), { type: "disable-requested" });
    expect(s.appLock).toBe(false);
    expect(s.status).toBe("unlocked");
    expect(hasPersistentWarning(s)).toBe(false);
  });

  it("is a no-op when already off", () => {
    const off = createAppLockState(false, "available");
    expect(run(off, { type: "disable-requested" })).toBe(off);
  });
});

describe("turning the lock on", () => {
  it("does not lock the session that turned it on", () => {
    const s = run(createAppLockState(false, "available"), { type: "config", appLock: true });
    expect(s.appLock).toBe(true);
    expect(s.status).toBe("unlocked");
  });

  it("warns when turned on in a device with no security", () => {
    const s = run(createAppLockState(false, "unavailable"), { type: "config", appLock: true });
    expect(s.status).toBe("unavailable");
    expect(hasPersistentWarning(s)).toBe(true);
  });

  it("an external off clears a pending disable and the warning", () => {
    const s = run(
      createAppLockState(true, "unavailable"),
      { type: "config", appLock: false },
    );
    expect(s.status).toBe("unlocked");
    expect(hasPersistentWarning(s)).toBe(false);
  });
});

describe("capability changes", () => {
  it("locks when security appears after an unavailable start", () => {
    const s = run(createAppLockState(true, "unavailable"), {
      type: "capability",
      capability: "available",
    });
    expect(s.status).toBe("locked");
    expect(hasPersistentWarning(s)).toBe(false);
  });

  it("opens a locked app whose device lost its security", () => {
    const s = run(createAppLockState(true, "available"), {
      type: "capability",
      capability: "unavailable",
    });
    expect(s.status).toBe("unavailable");
    expect(isContentVisible(s)).toBe(true);
  });

  it("keeps an unlocked session unlocked when security stays", () => {
    const s = run(unlocked(), { type: "capability", capability: "available" });
    expect(s.status).toBe("unlocked");
  });
});
