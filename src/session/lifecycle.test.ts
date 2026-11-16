// SPDX-License-Identifier: GPL-3.0-or-later

import { BACKOFF_DELAYS_MS } from "@/net/backoff";
import {
  ErrorCode,
  GoodbyeReason,
  HANDSHAKE_TIMEOUT_MS,
  type Message,
  PROTOCOL_VERSION,
} from "@/protocol";
import { testKeypair } from "@/protocol/testing";
import {
  BACKGROUND_CLOSE_MS,
  type Lifecycle,
  type LifecycleDeps,
  type LifecycleSnapshot,
  type WelcomeInfo,
  createLifecycle,
  isReconnecting,
} from "./lifecycle";
import {
  type Harness,
  type ScriptedHost,
  createHarness,
  createScriptedHost,
  greetingHost,
  instanceHex,
  makeTheme,
} from "./testing";
import { PROFILES, workspace } from "@/workspace/testing";

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

interface Rig {
  readonly h: Harness;
  readonly lifecycle: Lifecycle;
  readonly states: string[];
  readonly snapshots: LifecycleSnapshot[];
  readonly messages: Message[];
  readonly welcomes: WelcomeInfo[];
}

function rig(options: { paired?: boolean; deps?: Partial<LifecycleDeps> } = {}): Rig {
  const h = createHarness(options.paired === undefined ? {} : { paired: options.paired });
  return rigOn(h, options.deps);
}

function rigOn(h: Harness, deps: Partial<LifecycleDeps> = {}): Rig {
  const states: string[] = [];
  const snapshots: LifecycleSnapshot[] = [];
  const messages: Message[] = [];
  const welcomes: WelcomeInfo[] = [];
  const lifecycle = createLifecycle(
    {
      desktop: h.desktop,
      device: h.device,
      appVersion: "0.0.1",
      openSocket: h.network.openSocket,
      clock: h.time.clock,
      scheduler: h.time.scheduler,
      ...deps,
    },
    {
      onChange: (next, previous) => {
        snapshots.push(next);
        if (next.state !== previous.state) {
          states.push(next.state);
        }
      },
      onWelcome: (info) => welcomes.push(info),
      onMessage: (message) => messages.push(message),
    },
  );
  return { h, lifecycle, states, snapshots, messages, welcomes };
}

/** Starts and lets the network open the socket: with a fake host the session is ready after this. */
function connect(r: Rig): void {
  r.lifecycle.start();
  r.h.network.last().open();
}

/** Replaces the fake host by a scripted one whose replies the test writes. */
function scriptedWith(
  h: Harness,
  onMessage: (message: Message, send: (reply: Message) => void) => void,
): ScriptedHost {
  h.host.detach();
  return createScriptedHost({
    relay: h.relay,
    now: h.time.clock.now,
    hostKey: testKeypair(1),
    hostId: h.host.hostId,
    onMessage,
  });
}

function scripted(h: Harness, instance: number): ScriptedHost {
  return greetingHost(h, instance);
}

describe("lifecycle: the way up", () => {
  it("goes through every state to ready and says hello", () => {
    const r = rig();
    expect(r.lifecycle.snapshot().state).toBe("idle");
    connect(r);

    expect(r.states).toEqual(["connecting", "handshaking", "greeting", "ready"]);
    const hello = r.h.host.received.find((entry) => entry.message.type === "hello")?.message;
    expect(hello).toEqual({
      type: "hello",
      version: PROTOCOL_VERSION,
      app: "porecatu-remote",
      appVersion: "0.0.1",
    });
  });

  it("hands the welcome over before the messages that follow it, and ready only after all three", () => {
    const r = rig();
    r.lifecycle.start();
    r.h.network.last().open();

    expect(r.welcomes).toEqual([
      {
        hostName: "Test Desktop",
        porecatuVersion: "0.0.0-test",
        maxSubscriptions: 4,
        hostInstance: instanceHex(0x5a),
        instanceChanged: false,
      },
    ]);
    expect(r.messages.map((m) => m.type)).toEqual(["theme", "profiles", "workspace"]);
    expect(r.lifecycle.snapshot().welcome).toEqual(r.welcomes[0]);
  });

  it("is not ready while a greeting message is missing", () => {
    const r = rig();
    scriptedWith(r.h, (message, send) => {
      if (message.type === "hello") {
        send({
          type: "welcome",
          version: PROTOCOL_VERSION,
          hostName: "Scripted",
          porecatuVersion: "0.0.0-test",
          maxSubscriptions: 2,
          hostInstance: new Uint8Array(16).fill(1),
        });
        send(makeTheme());
        send(PROFILES);
      }
    });
    connect(r);
    expect(r.lifecycle.snapshot().state).toBe("greeting");
    expect(r.lifecycle.send({ type: "subscribe", pane: 1 })).toBe(false);
  });

  it("sends only when ready", () => {
    const r = rig();
    expect(r.lifecycle.send({ type: "subscribe", pane: 100 })).toBe(false);
    connect(r);
    expect(r.lifecycle.send({ type: "subscribe", pane: 100 })).toBe(true);
    expect(r.h.host.received.map((entry) => entry.message.type)).toContain("subscribe");
  });

  it("ignores start() unless idle, closed or failed", () => {
    const r = rig();
    connect(r);
    r.lifecycle.start();
    expect(r.h.network.sockets).toHaveLength(1);
  });

  it("refuses a desktop whose relay URL or key is unusable", () => {
    const badUrl = rig({ deps: { desktop: { relayUrl: "ws://relay.example", hostId: "x", hostKeyB64: "x" } } });
    badUrl.lifecycle.start();
    expect(badUrl.lifecycle.snapshot()).toMatchObject({
      state: "failed",
      end: { reason: "invalid-desktop", code: "relay-url" },
    });

    const h = createHarness();
    const badKey = rigOn(h, { desktop: { ...h.desktop, hostKeyB64: "short" } });
    badKey.lifecycle.start();
    expect(badKey.lifecycle.snapshot()).toMatchObject({
      state: "failed",
      end: { reason: "invalid-desktop", code: "host-key" },
    });
    expect(h.network.sockets).toHaveLength(0);
  });
});

describe("lifecycle: the first connection ends", () => {
  it("is closed as offline when the relay has no such host", () => {
    const r = rig();
    r.h.host.detach();
    connect(r);
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "closed", end: { reason: "offline" } });
  });

  it("is closed as not-paired when the host does not know the device", () => {
    const r = rig({ paired: false });
    connect(r);
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "closed", end: { reason: "not-paired" } });
    expect(r.messages).toEqual([]);
  });

  it("is closed as incompatible, with the host's version", () => {
    const r = rig();
    scriptedWith(r.h, (message, send) => {
      if (message.type === "hello") {
        send({ type: "incompatible", version: [0, 9] });
      }
    });
    connect(r);
    expect(r.lifecycle.snapshot()).toMatchObject({
      state: "closed",
      end: { reason: "incompatible", hostVersion: [0, 9] },
    });
  });

  it("fails as unreachable, with no retry, when the connection falls before the first ready", () => {
    const r = rig();
    r.lifecycle.start();
    r.h.network.last().drop(1006);
    expect(r.lifecycle.snapshot()).toMatchObject({
      state: "failed",
      end: { reason: "unreachable", code: "unreachable:closed:1006" },
    });
    expect(r.h.time.pending()).toBe(0);
  });

  it("fails as unreachable when the handshake does not finish in time", () => {
    const r = rig();
    r.lifecycle.start();
    expect(r.h.time.pending()).toBe(1);
    r.h.time.advance(HANDSHAKE_TIMEOUT_MS);
    expect(r.lifecycle.snapshot()).toMatchObject({
      state: "failed",
      end: { reason: "unreachable", code: "unreachable:handshake-timeout" },
    });
    expect(r.h.network.last().closedByApp).toBe(true);
  });

  it("can be started again after a failure, with a fresh start", () => {
    const r = rig();
    r.lifecycle.start();
    r.h.network.last().drop();
    r.lifecycle.start();
    r.h.network.last().open();
    expect(r.lifecycle.snapshot().state).toBe("ready");
    expect(r.h.network.sockets).toHaveLength(2);
  });
});

describe("lifecycle: what the host ends it with", () => {
  it.each([
    [GoodbyeReason.normal, "goodbye"],
    [GoodbyeReason.remoteDisabled, "remote-disabled"],
    [GoodbyeReason.revoked, "revoked"],
    [GoodbyeReason.hostQuitting, "host-quitting"],
  ] as const)("goodbye %s is closed as %s, with no retry", (reason, expected) => {
    const r = rig();
    connect(r);
    r.h.host.broadcast({ type: "goodbye", reason });
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "closed", end: { reason: expected } });
    expect(r.h.time.pending()).toBe(0);
    expect(r.h.network.last().closedByApp).toBe(true);
  });

  it("treats error { not-paired } on a live session as not-paired", () => {
    const r = rig();
    connect(r);
    r.h.host.broadcast({ type: "error", code: ErrorCode.notPaired });
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "closed", end: { reason: "not-paired" } });
  });

  it("fails for good on error { protocol } from the host", () => {
    const r = rig();
    connect(r);
    r.h.host.broadcast({ type: "error", code: ErrorCode.protocol });
    expect(r.lifecycle.snapshot()).toMatchObject({
      state: "failed",
      end: { reason: "protocol", code: "remote" },
    });
    expect(r.h.time.pending()).toBe(0);
  });

  it("passes other host errors on like any message", () => {
    const r = rig();
    connect(r);
    r.h.host.broadcast({ type: "error", code: ErrorCode.unknownPane, pane: 7 });
    expect(r.lifecycle.snapshot().state).toBe("ready");
    expect(r.messages[r.messages.length - 1]).toEqual({
      type: "error",
      code: ErrorCode.unknownPane,
      pane: 7,
    });
  });

  it("answers a message before the welcome with error { protocol } and fails", () => {
    const r = rig();
    const host = scriptedWith(r.h, (message, send) => {
      if (message.type === "hello") {
        send(workspace([]));
      }
    });
    connect(r);
    expect(r.lifecycle.snapshot()).toMatchObject({
      state: "failed",
      end: { reason: "protocol", code: "order" },
    });
    expect(host.received.map((m) => m.type)).toEqual(["hello", "error"]);
  });

  it("fails on a second welcome", () => {
    const r = rig();
    connect(r);
    r.h.host.broadcast({
      type: "welcome",
      version: PROTOCOL_VERSION,
      hostName: "x",
      porecatuVersion: "1",
      maxSubscriptions: 1,
      hostInstance: new Uint8Array(16),
    });
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "failed", end: { code: "order" } });
  });
});

describe("lifecycle: dropped connections", () => {
  it("retries on the 1, 2, 4, 8, 16 s schedule and gives up", () => {
    const r = rig();
    connect(r);
    const t0 = r.h.time.clock.now();
    r.h.network.last().drop(1006);
    expect(r.lifecycle.snapshot()).toMatchObject({
      state: "reconnecting",
      attempt: 1,
      retryAt: t0 + BACKOFF_DELAYS_MS[0],
    });
    expect(isReconnecting(r.lifecycle.snapshot())).toBe(true);

    const sockets = r.h.network.sockets.length;
    for (let i = 0; i < BACKOFF_DELAYS_MS.length; i += 1) {
      const delay = BACKOFF_DELAYS_MS[i] ?? 0;
      r.h.time.advance(delay - 1);
      expect(r.h.network.sockets).toHaveLength(sockets + i);
      r.h.time.advance(1);
      expect(r.h.network.sockets).toHaveLength(sockets + i + 1);
      expect(r.lifecycle.snapshot()).toMatchObject({ state: "connecting", attempt: i + 1 });
      expect(isReconnecting(r.lifecycle.snapshot())).toBe(true);
      r.h.network.last().drop(1006);
    }
    expect(r.lifecycle.snapshot()).toMatchObject({
      state: "failed",
      end: { reason: "retries-exhausted" },
    });
    expect(r.h.time.pending()).toBe(0);

    r.lifecycle.start();
    r.h.network.last().open();
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "ready", attempt: 0 });
  });

  it("starts over from zero once a reconnection succeeds", () => {
    const r = rig();
    connect(r);
    r.h.network.last().drop();
    r.h.time.advance(1000);
    r.h.network.last().open();
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "ready", attempt: 0, retryAt: null });

    r.h.network.last().drop();
    expect(r.lifecycle.snapshot()).toMatchObject({ attempt: 1, retryAt: r.h.time.clock.now() + 1000 });
  });

  it("treats the relay closing the channel (host gone) as a drop, and host-unavailable as a failed attempt", () => {
    const r = rig();
    connect(r);
    r.h.host.detach();
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "reconnecting", attempt: 1 });

    r.h.time.advance(1000);
    r.h.network.last().open();
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "reconnecting", attempt: 2 });
    expect(r.lifecycle.snapshot().end).toBeNull();
  });

  it("keeps the welcome of the previous session while reconnecting", () => {
    const r = rig();
    connect(r);
    r.h.network.last().drop();
    expect(r.lifecycle.snapshot().welcome?.hostName).toBe("Test Desktop");
  });
});

describe("lifecycle: host instance", () => {
  it("flags a welcome with another host_instance", () => {
    const r = rig();
    const host = scripted(r.h, 1);
    connect(r);
    expect(r.welcomes[0]?.instanceChanged).toBe(false);

    // Same instance after a drop.
    r.h.network.last().drop();
    r.h.time.advance(1000);
    r.h.network.last().open();
    expect(r.welcomes[1]).toMatchObject({ hostInstance: instanceHex(1), instanceChanged: false });

    // The desktop restarts: the relay closes the channel, and another instance answers.
    host.detach();
    scripted(r.h, 2);
    r.h.time.advance(1000);
    r.h.network.last().open();
    expect(r.welcomes[2]).toMatchObject({ hostInstance: instanceHex(2), instanceChanged: true });
    expect(r.lifecycle.snapshot().state).toBe("ready");
  });
});

describe("lifecycle: closing", () => {
  it("says goodbye and closes when the user leaves", () => {
    const r = rig();
    connect(r);
    r.lifecycle.close();
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "closed", end: { reason: "user" } });
    expect(r.h.host.received.map((entry) => entry.message)).toContainEqual({
      type: "goodbye",
      reason: GoodbyeReason.normal,
    });
    expect(r.h.network.last().closedByApp).toBe(true);
  });

  it("closes while reconnecting, cancelling the retry", () => {
    const r = rig();
    connect(r);
    r.h.network.last().drop();
    r.lifecycle.close();
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "closed", end: { reason: "user" } });
    expect(r.h.time.pending()).toBe(0);
  });

  it("tells the host and fails when the app aborts the session", () => {
    const r = rig();
    connect(r);
    r.lifecycle.abort("seq-gap");
    expect(r.lifecycle.snapshot()).toMatchObject({
      state: "failed",
      end: { reason: "protocol", code: "seq-gap" },
    });
    expect(r.h.host.received.map((entry) => entry.message)).toContainEqual({
      type: "error",
      code: ErrorCode.protocol,
    });
  });

  it("ignores abort and close once it ended", () => {
    const r = rig();
    connect(r);
    r.lifecycle.close();
    const count = r.snapshots.length;
    r.lifecycle.close();
    r.lifecycle.abort("x");
    expect(r.snapshots).toHaveLength(count);
  });
});

describe("lifecycle: background", () => {
  it("closes cleanly after 30 s in the background and reconnects on return", () => {
    const r = rig();
    connect(r);
    r.lifecycle.enterBackground();
    r.h.time.advance(BACKGROUND_CLOSE_MS - 1);
    expect(r.lifecycle.snapshot().state).toBe("ready");

    r.h.time.advance(1);
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "closed", end: { reason: "background" } });
    expect(r.h.host.received.map((entry) => entry.message)).toContainEqual({
      type: "goodbye",
      reason: GoodbyeReason.normal,
    });

    r.lifecycle.enterForeground();
    expect(r.lifecycle.snapshot().state).toBe("connecting");
    r.h.network.last().open();
    expect(r.lifecycle.snapshot().state).toBe("ready");
  });

  it("keeps the session when the app comes back before 30 s", () => {
    const r = rig();
    connect(r);
    r.lifecycle.enterBackground();
    r.h.time.advance(10_000);
    r.lifecycle.enterForeground();
    r.h.time.advance(120_000);
    expect(r.lifecycle.snapshot().state).toBe("ready");
    expect(r.h.network.sockets).toHaveLength(1);
  });

  it("retries a pending reconnection right away on return", () => {
    const r = rig();
    connect(r);
    r.h.network.last().drop();
    r.lifecycle.enterBackground();
    r.lifecycle.enterForeground();
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "connecting", attempt: 1 });
    expect(r.h.network.sockets).toHaveLength(2);
  });

  it("does nothing in the background without a session", () => {
    const r = rig();
    r.lifecycle.enterBackground();
    expect(r.h.time.pending()).toBe(0);
  });

  it("drops a session closed in the background into the retry schedule when it cannot come back", () => {
    const r = rig();
    connect(r);
    r.lifecycle.enterBackground();
    r.h.time.advance(BACKGROUND_CLOSE_MS);
    r.lifecycle.enterForeground();
    r.h.network.last().drop();
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "reconnecting", attempt: 1 });
  });
});
