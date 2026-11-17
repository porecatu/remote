// SPDX-License-Identifier: GPL-3.0-or-later

// The lifecycle adopting the connection a pairing left open (PRD-001 RF-1.10):
// `hello` on the same channel, early messages, drops, and the registry's
// `openPaired`, up to a full run from the pairing flow to `ready`.

import type { RelaySocket } from "@/net/relaySocket";
import { createSwitchableHandlers } from "@/net/socketHandoff";
import {
  type ClientStart,
  ClientSession,
  ErrorCode,
  GoodbyeReason,
  type Message,
  PROTOCOL_VERSION,
  Platform,
  base64UrlEncode,
  formatPairingUri,
} from "@/protocol";
import { testKeypair } from "@/protocol/testing";
import {
  type PairingContext,
  type PairingEvent,
  type PairingState,
  createPairingState,
  reducePairing,
  savePairedDesktop,
} from "@/pairing/pairingFlow";
import { type Desktop, type DesktopRepository, createDesktopRepository } from "@/storage/desktopList";
import { createMemoryStore } from "@/storage/secureStore";
import {
  type ConnectSession,
  type Lifecycle,
  type LifecycleSnapshot,
  type SessionHandover,
  type WelcomeInfo,
  createLifecycle,
} from "./lifecycle";
import { type SessionRegistry, createSessionRegistry } from "./registry";
import { createSessionStore } from "./sessionStore";
import { type Harness, TEST_RELAY_URL, createHarness, pairOnRelay } from "./testing";

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
  readonly messages: Message[];
  readonly welcomes: WelcomeInfo[];
  readonly connects: number[];
}

function rig(h: Harness = createHarness({ paired: false })): Rig {
  const states: string[] = [];
  const messages: Message[] = [];
  const welcomes: WelcomeInfo[] = [];
  const connects: number[] = [];
  const connect: ConnectSession = (hostId, hostKey, device, nowMs, options): ClientStart => {
    connects.push(nowMs);
    return ClientSession.connect(hostId, hostKey, device, nowMs, options);
  };
  const lifecycle = createLifecycle(
    {
      desktop: h.desktop,
      device: h.device,
      appVersion: "0.0.1",
      openSocket: h.network.openSocket,
      connect,
      clock: h.time.clock,
      scheduler: h.time.scheduler,
    },
    {
      onChange: (next: LifecycleSnapshot, previous: LifecycleSnapshot) => {
        if (next.state !== previous.state) {
          states.push(next.state);
        }
      },
      onWelcome: (info) => welcomes.push(info),
      onMessage: (message) => messages.push(message),
    },
  );
  return { h, lifecycle, states, messages, welcomes, connects };
}

function received(h: Harness, type: Message["type"]): { channel: number; message: Message }[] {
  return h.host.received.filter((entry) => entry.message.type === type);
}

describe("adopting the pairing session (RF-1.10)", () => {
  it("says hello on the pairing channel and reaches ready without opening a socket", () => {
    const r = rig();
    const paired = pairOnRelay(r.h);
    expect(r.h.network.sockets).toHaveLength(1);
    const sentBefore = paired.socket.sent.length;

    r.lifecycle.adopt(paired.handover);

    expect(r.states).toEqual(["greeting", "ready"]);
    expect(r.h.network.sockets).toHaveLength(1);
    expect(r.connects).toEqual([]);
    expect(paired.socket.sent.length).toBe(sentBefore + 1);
    expect(paired.socket.closedByApp).toBe(false);
    expect(received(r.h, "hello").map((entry) => entry.message)).toEqual([
      { type: "hello", version: PROTOCOL_VERSION, app: "porecatu-remote", appVersion: "0.0.1" },
    ]);
    expect(r.welcomes.map((w) => w.hostName)).toEqual(["Test Desktop"]);
    expect(r.messages.map((m) => m.type)).toEqual(["theme", "profiles", "workspace"]);
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "ready", attempt: 0, end: null });
    expect(paired.switchable.queued()).toBe(0);
  });

  it("works on the adopted session once ready: send, and host messages after", () => {
    const r = rig();
    const paired = pairOnRelay(r.h);
    r.lifecycle.adopt(paired.handover);
    expect(r.lifecycle.send({ type: "unsubscribe", pane: 1 })).toBe(true);
    expect(received(r.h, "unsubscribe")).toHaveLength(1);
    r.h.host.broadcast({ type: "bell", pane: 1 });
    expect(r.messages.map((m) => m.type)).toEqual(["theme", "profiles", "workspace", "bell"]);
  });

  it("handles the early messages first: a goodbye ends it before the hello", () => {
    const r = rig();
    const paired = pairOnRelay(r.h, [{ type: "goodbye", reason: GoodbyeReason.remoteDisabled }]);
    r.lifecycle.adopt(paired.handover);

    expect(r.states).toEqual(["greeting", "closed"]);
    expect(r.lifecycle.snapshot().end).toEqual({ reason: "remote-disabled", code: null, hostVersion: null });
    expect(received(r.h, "hello")).toHaveLength(0);
    expect(paired.socket.closedByApp).toBe(true);
  });

  it("an early error { protocol } fails the session", () => {
    const r = rig();
    const paired = pairOnRelay(r.h, [{ type: "error", code: ErrorCode.protocol }]);
    r.lifecycle.adopt(paired.handover);
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "failed", end: { reason: "protocol", code: "remote" } });
    expect(received(r.h, "hello")).toHaveLength(0);
  });

  it("an early message out of order is a protocol error, told to the host", () => {
    const r = rig();
    const paired = pairOnRelay(r.h, [{ type: "bell", pane: 1 }]);
    r.lifecycle.adopt(paired.handover);
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "failed", end: { reason: "protocol", code: "order" } });
    expect(received(r.h, "error").map((entry) => entry.message)).toEqual([
      { type: "error", code: ErrorCode.protocol },
    ]);
    expect(r.messages).toEqual([]);
  });

  it("frames that waited for the handover come after the early messages, in order", () => {
    const r = rig();
    const paired = pairOnRelay(r.h);
    // The host speaks out of turn before the app took the channel over.
    r.h.host.broadcast({ type: "bell", pane: 1 });
    expect(paired.switchable.queued()).toBe(1);

    r.lifecycle.adopt(paired.handover);
    // The bell is read before the welcome that answers the hello.
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "failed", end: { reason: "protocol", code: "order" } });
    expect(r.welcomes).toEqual([]);
  });

  it("a channel that fell before the handover fails as unreachable, with no retry", () => {
    const r = rig();
    const paired = pairOnRelay(r.h);
    paired.socket.drop(1006);
    r.lifecycle.adopt(paired.handover);

    expect(r.lifecycle.snapshot()).toMatchObject({
      state: "failed",
      end: { reason: "unreachable", code: "unreachable:closed:1006" },
    });
    r.h.time.advance(60_000);
    expect(r.h.network.sockets).toHaveLength(1);
    expect(r.connects).toEqual([]);
  });

  it("a drop before the first ready is failed (unreachable), with no retry", () => {
    const r = rig();
    const paired = pairOnRelay(r.h);
    // A host that does not answer the hello.
    r.h.host.detach();
    r.lifecycle.adopt(paired.handover);
    expect(r.lifecycle.snapshot().state).not.toBe("ready");
    r.h.time.advance(60_000);
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "failed", end: { reason: "unreachable" } });
    expect(r.h.network.sockets).toHaveLength(1);
  });

  it("a session no longer open fails as unreachable", () => {
    const r = rig();
    const paired = pairOnRelay(r.h);
    paired.handover.session.close();
    r.lifecycle.adopt(paired.handover);
    expect(r.lifecycle.snapshot()).toMatchObject({
      state: "failed",
      end: { reason: "unreachable", code: "unreachable:adopted-closed" },
    });
    expect(paired.socket.closedByApp).toBe(true);
  });

  it("a drop after ready reconnects with IK on a new socket", () => {
    const r = rig();
    const paired = pairOnRelay(r.h);
    r.lifecycle.adopt(paired.handover);
    expect(r.lifecycle.snapshot().state).toBe("ready");

    paired.socket.drop(1006);
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "reconnecting", attempt: 1 });
    r.h.time.advance(1_000);
    expect(r.connects).toHaveLength(1);
    expect(r.h.network.sockets).toHaveLength(2);
    r.h.network.last().open();

    expect(r.lifecycle.snapshot()).toMatchObject({ state: "ready", attempt: 0 });
    const hellos = received(r.h, "hello");
    expect(hellos).toHaveLength(2);
    expect(hellos[0]?.channel).not.toBe(hellos[1]?.channel);
    expect(r.states).toEqual(["greeting", "ready", "reconnecting", "connecting", "handshaking", "greeting", "ready"]);
  });

  it("replaces a session that is running: the old one closes, the new one is used", () => {
    const r = rig(createHarness());
    r.lifecycle.start();
    const old = r.h.network.last();
    old.open();
    expect(r.lifecycle.snapshot().state).toBe("ready");

    const paired = pairOnRelay(r.h);
    r.lifecycle.adopt(paired.handover);

    expect(old.closedByApp).toBe(true);
    expect(received(r.h, "goodbye")).toHaveLength(1);
    expect(r.lifecycle.snapshot()).toMatchObject({ state: "ready", end: null });
    expect(r.states).toEqual(["connecting", "handshaking", "greeting", "ready", "closed", "greeting", "ready"]);
    expect(r.h.network.sockets).toHaveLength(2);
  });

  it("start after an adopted session ended opens a new connection", () => {
    const r = rig();
    const paired = pairOnRelay(r.h);
    r.lifecycle.adopt(paired.handover);
    r.lifecycle.close();
    expect(r.lifecycle.snapshot().state).toBe("closed");
    expect(paired.socket.closedByApp).toBe(true);

    r.lifecycle.start();
    r.h.network.last().open();
    expect(r.connects).toHaveLength(1);
    expect(r.lifecycle.snapshot().state).toBe("ready");
  });
});

describe("session store: startAdopted", () => {
  it("fills the store from the adopted session", () => {
    const h = createHarness({ paired: false });
    const session = createSessionStore({
      desktop: h.desktop,
      device: h.device,
      appVersion: "0.0.1",
      openSocket: h.network.openSocket,
      clock: h.time.clock,
      scheduler: h.time.scheduler,
    });
    session.startAdopted(pairOnRelay(h).handover);
    const state = session.getState();
    expect(state.connection.state).toBe("ready");
    expect(state.workspace).not.toBeNull();
    expect(state.theme?.palette).toHaveLength(16);
    expect(state.profiles?.defaultProfile).toBe("default");
    expect(h.network.sockets).toHaveLength(1);
    session.dispose();
  });
});

// ----------------------------------------------------------------- registry

interface RegistryRig {
  readonly h: Harness;
  readonly repository: DesktopRepository;
  readonly registry: SessionRegistry;
}

function registryRig(h: Harness = createHarness({ paired: false })): RegistryRig {
  const repository = createDesktopRepository(createMemoryStore());
  const registry = createSessionRegistry({
    device: h.device,
    appVersion: "0.0.1",
    openSocket: h.network.openSocket,
    clock: h.time.clock,
    scheduler: h.time.scheduler,
    repository,
  });
  return { h, repository, registry };
}

async function addDesktop(r: RegistryRig, hostKey: Uint8Array): Promise<Desktop> {
  const result = await r.repository.add({
    name: "Desktop",
    relayUrl: TEST_RELAY_URL,
    hostId: r.h.host.hostId,
    hostKeyB64: base64UrlEncode(hostKey),
    pairedAt: r.h.time.clock.iso(),
  });
  if (!result.ok) {
    throw new Error("could not add the desktop");
  }
  return result.desktop;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("registry: openPaired", () => {
  it("creates the store on the pairing connection and records the status", async () => {
    const r = registryRig();
    const desktop = await addDesktop(r, r.h.host.hostKey);
    const session = r.registry.openPaired(desktop, pairOnRelay(r.h).handover);

    expect(session.getState().connection.state).toBe("ready");
    expect(r.registry.get(desktop.id)).toBe(session);
    expect(r.h.network.sockets).toHaveLength(1);
    await flush();
    const list = await r.repository.list();
    expect(list.find((d) => d.id === desktop.id)?.lastStatus.kind).toBe("connected");
  });

  it("replaces the store of a desktop paired again with another key", async () => {
    const r = registryRig();
    const stale = await addDesktop(r, testKeypair(9).publicKey);
    const before = r.registry.open(stale);
    const staleSocket = r.h.network.last();

    const desktop: Desktop = { ...stale, hostKeyB64: base64UrlEncode(r.h.host.hostKey) };
    const session = r.registry.openPaired(desktop, pairOnRelay(r.h).handover);

    expect(session).not.toBe(before);
    expect(staleSocket.closedByApp).toBe(true);
    expect(r.registry.get(desktop.id)).toBe(session);
    expect(session.getState().connection.state).toBe("ready");
    expect(r.registry.openIds()).toEqual([desktop.id]);
  });

  it("keeps the store of the same desktop and moves it to the new connection", async () => {
    const r = registryRig(createHarness());
    const desktop = await addDesktop(r, r.h.host.hostKey);
    const before = r.registry.open(desktop);
    const first = r.h.network.last();
    first.open();
    expect(before.getState().connection.state).toBe("ready");

    const session = r.registry.openPaired(desktop, pairOnRelay(r.h).handover);
    expect(session).toBe(before);
    expect(first.closedByApp).toBe(true);
    expect(session.getState().connection.state).toBe("ready");
  });
});

// ----------------------------------------------------------------- end to end

interface FlowRun {
  readonly state: () => PairingState;
  readonly handover: () => SessionHandover | null;
  readonly settle: () => Promise<void>;
}

/** What the pairing controller does: run the effects on a real socket of the fake network, then hand the channel over. */
function runPairingFlow(h: Harness, repository: DesktopRepository, uri: string): FlowRun {
  const context: PairingContext = { device: h.device, platform: Platform.android };
  const switchable = createSwitchableHandlers();
  let state: PairingState = createPairingState();
  let socket: RelaySocket | null = null;
  let handover: SessionHandover | null = null;
  const queue: PairingEvent[] = [];
  const saves: Promise<void>[] = [];
  let running = false;

  const flowHandlers = {
    onOpen: () => {
      dispatch({ type: "socket-opened", now: h.time.clock.now() });
    },
    onFrame: (frame: Uint8Array) => {
      dispatch({ type: "frame-received", frame, now: h.time.clock.now() });
    },
    onClose: () => {
      dispatch({ type: "socket-closed" });
    },
  };

  function dispatch(event: PairingEvent): void {
    queue.push(event);
    if (running) {
      return;
    }
    running = true;
    try {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        const step = reducePairing(context, state, next);
        state = step.state;
        for (const effect of step.effects) {
          switch (effect.type) {
            case "open-socket":
              switchable.setTarget(flowHandlers);
              socket = h.network.openSocket(effect.url, switchable.handlers);
              break;
            case "send-frame":
              socket?.send(effect.frame);
              break;
            case "close-socket":
              socket?.close();
              break;
            case "save-desktop":
              saves.push(
                savePairedDesktop(repository, effect, h.time.clock.iso()).then((outcome) => {
                  dispatch(outcome);
                }),
              );
              break;
            case "log":
              break;
          }
        }
        if (state.step === "paired" && handover === null && socket !== null && !state.sessionEnded) {
          // In the same turn: nothing that comes from now on reaches the flow.
          switchable.setTarget(null);
          handover = {
            session: state.session,
            socket,
            redirect: (handlers) => {
              switchable.setTarget(handlers);
            },
            early: state.early,
          };
        }
      }
    } finally {
      running = false;
    }
  }

  dispatch({ type: "uri-read", uri });
  dispatch({ type: "name-submitted", name: "My Phone", now: h.time.clock.now() });
  return {
    state: () => state,
    handover: () => handover,
    settle: async () => {
      await flush();
      await Promise.all(saves);
      await flush();
    },
  };
}

describe("pairing flow to ready in the same session (end to end)", () => {
  it("pairs, saves, hands the channel over and reaches ready on it", async () => {
    const r = registryRig();
    const invite = r.h.host.startPairing(TEST_RELAY_URL);
    const run = runPairingFlow(r.h, r.repository, formatPairingUri(invite));
    r.h.network.last().open();
    await run.settle();

    const state = run.state();
    expect(state.step).toBe("paired");
    const handover = run.handover();
    if (state.step !== "paired" || handover === null) {
      throw new Error("not handed over");
    }
    expect(r.h.host.isPaired(r.h.device.publicKey)).toBe(true);

    const session = r.registry.openPaired(state.desktop, handover);
    expect(session.getState().connection.state).toBe("ready");
    expect(session.getState().workspace).not.toBeNull();
    expect(r.h.network.sockets).toHaveLength(1);
    expect(received(r.h, "hello")).toHaveLength(1);

    // A later drop reconnects the normal way (IK, new socket).
    r.h.network.sockets[0]?.drop(1006);
    r.h.time.advance(1_000);
    r.h.network.last().open();
    expect(r.h.network.sockets).toHaveLength(2);
    expect(session.getState().connection.state).toBe("ready");
    r.registry.closeAll();
  });
});
