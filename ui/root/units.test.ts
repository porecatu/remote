// SPDX-License-Identifier: GPL-3.0-or-later
import { failureMessageKey } from "./LockScreen";
import { redirectSystemPath } from "./nativeIntent";
import { toAppStateKind } from "./useAppStateBridge";

describe("toAppStateKind", () => {
  it("passes the three states the shell knows and ignores the rest", () => {
    expect(toAppStateKind("active")).toBe("active");
    expect(toAppStateKind("inactive")).toBe("inactive");
    expect(toAppStateKind("background")).toBe("background");
    expect(toAppStateKind("unknown")).toBeNull();
    expect(toAppStateKind("extension")).toBeNull();
  });
});

describe("failureMessageKey", () => {
  it("maps every failure of the authenticator", () => {
    expect(failureMessageKey(null)).toBeNull();
    expect(failureMessageKey("cancelled")).toBe("app_lock.authentication_failed");
    expect(failureMessageKey("failed")).toBe("app_lock.authentication_failed");
    expect(failureMessageKey("lockout")).toBe("app_lock.lockout");
  });
});

describe("redirectSystemPath", () => {
  const link = "porecatu://pair?v=1&token=secret";

  it("opens the list at a cold start, never the route of the link", () => {
    expect(redirectSystemPath({ path: link, initial: true })).toBe("/");
    expect(redirectSystemPath({ path: "/pair?token=secret", initial: true })).toBe("/");
  });

  it("keeps the current screen for a link while running", () => {
    expect(redirectSystemPath({ path: link, initial: false })).toBeNull();
    expect(redirectSystemPath({ path: "porecatu://desktop/1", initial: false })).toBeNull();
  });
});
