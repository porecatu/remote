// SPDX-License-Identifier: GPL-3.0-or-later

import { formatPairingUri, parsePairingUri } from "@/protocol";
import { createTestClock, createFakeHost, createMemoryRelay } from "@/protocol/testing";
import { createAppLockState, isContentVisible, reduceAppLock } from "../security/appLock";
import {
  MAX_LINK_LENGTH,
  createDeepLinkState,
  isPairingLink,
  reduceDeepLink,
  type DeepLinkState,
} from "./deepLink";

function realUri(): string {
  const relay = createMemoryRelay();
  const clock = createTestClock(0);
  const host = createFakeHost({ relay, now: clock.now });
  return formatPairingUri(host.startPairing("wss://relay.example.com"));
}

describe("isPairingLink", () => {
  it("accepts the link the desktop builds", () => {
    const uri = realUri();
    expect(uri.startsWith("porecatu://pair?")).toBe(true);
    expect(isPairingLink(uri)).toBe(true);
    expect(parsePairingUri(uri).ok).toBe(true);
  });

  it.each(["porecatu://pair", "PORECATU://PAIR?v=0", "porecatu://pair/?v=0", "porecatu://pair#x"])(
    "routes %s to the flow (the parser judges it)",
    (url) => {
      expect(isPairingLink(url)).toBe(true);
    },
  );

  it.each([
    "",
    "porecatu://",
    "porecatu://pairing?v=0",
    "porecatu://open?v=0",
    "https://example.com/porecatu://pair",
    "exp+porecatu://expo-development-client/?url=x",
    "porecatu:/pair?v=0",
  ])("ignores %s", (url) => {
    expect(isPairingLink(url)).toBe(false);
  });

  it("ignores a link longer than any valid URI", () => {
    expect(isPairingLink(`porecatu://pair?${"a".repeat(MAX_LINK_LENGTH)}`)).toBe(false);
  });
});

describe("deep link routing (RF-1.5)", () => {
  it("delivers a link at once when the app is unlocked", () => {
    const uri = realUri();
    const step = reduceDeepLink(createDeepLinkState(), { type: "link", url: uri, locked: false });
    expect(step.deliver).toBe(uri);
    expect(step.state).toEqual({ pending: null });
  });

  it("holds a link while locked and delivers it once after the unlock", () => {
    const uri = realUri();
    const held = reduceDeepLink(createDeepLinkState(), { type: "link", url: uri, locked: true });
    expect(held.deliver).toBeNull();
    expect(held.state).toEqual({ pending: uri });

    const unlocked = reduceDeepLink(held.state, { type: "unlocked" });
    expect(unlocked.deliver).toBe(uri);
    expect(unlocked.state).toEqual({ pending: null });

    // A second unlock has nothing left to deliver.
    expect(reduceDeepLink(unlocked.state, { type: "unlocked" }).deliver).toBeNull();
  });

  it("the newest link wins while locked", () => {
    const first = "porecatu://pair?v=0&n=1";
    const second = "porecatu://pair?v=0&n=2";
    let state: DeepLinkState = createDeepLinkState();
    state = reduceDeepLink(state, { type: "link", url: first, locked: true }).state;
    state = reduceDeepLink(state, { type: "link", url: second, locked: true }).state;
    expect(reduceDeepLink(state, { type: "unlocked" }).deliver).toBe(second);
  });

  it("a link that is not a pairing link is dropped, locked or not, and does not disturb a held one", () => {
    const uri = realUri();
    const held = reduceDeepLink(createDeepLinkState(), { type: "link", url: uri, locked: true }).state;
    const other = reduceDeepLink(held, { type: "link", url: "porecatu://open", locked: true });
    expect(other.deliver).toBeNull();
    expect(other.state).toBe(held);
    expect(reduceDeepLink(held, { type: "link", url: "https://x.y", locked: false }).deliver).toBeNull();
  });

  it("an unlocked link supersedes a held one instead of delivering both", () => {
    const held = reduceDeepLink(createDeepLinkState(), {
      type: "link",
      url: "porecatu://pair?v=0&n=1",
      locked: true,
    }).state;
    const step = reduceDeepLink(held, { type: "link", url: "porecatu://pair?v=0&n=2", locked: false });
    expect(step.deliver).toBe("porecatu://pair?v=0&n=2");
    expect(step.state).toEqual({ pending: null });
  });

  it("discard forgets a held link", () => {
    const held = reduceDeepLink(createDeepLinkState(), {
      type: "link",
      url: "porecatu://pair?v=0",
      locked: true,
    }).state;
    const gone = reduceDeepLink(held, { type: "discard" });
    expect(gone.state).toEqual({ pending: null });
    expect(reduceDeepLink(gone.state, { type: "unlocked" }).deliver).toBeNull();
  });
});

describe("with the app lock state machine", () => {
  const capability = "available" as const;

  it("a link at a cold start is held until authentication succeeds", () => {
    const uri = realUri();
    let lock = createAppLockState(true, capability);
    expect(isContentVisible(lock)).toBe(false);

    let link = reduceDeepLink(createDeepLinkState(), {
      type: "link",
      url: uri,
      locked: !isContentVisible(lock),
    });
    expect(link.deliver).toBeNull();

    lock = reduceAppLock(lock, { type: "auth-result", result: { kind: "success" } });
    expect(isContentVisible(lock)).toBe(true);
    link = reduceDeepLink(link.state, { type: "unlocked" });
    expect(link.deliver).toBe(uri);
  });

  it("a link while the lock is unavailable or off is delivered at once", () => {
    const uri = realUri();
    for (const lock of [createAppLockState(false, capability), createAppLockState(true, "unavailable")]) {
      const step = reduceDeepLink(createDeepLinkState(), {
        type: "link",
        url: uri,
        locked: !isContentVisible(lock),
      });
      expect(step.deliver).toBe(uri);
    }
  });
});
