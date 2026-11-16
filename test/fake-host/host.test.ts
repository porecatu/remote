// SPDX-License-Identifier: GPL-3.0-or-later

import { GridModel } from "../../src/grid/gridModel";
import {
  CloseReason,
  ClientSession,
  ErrorCode,
  GoodbyeReason,
  NamedKey,
  PairRejectReason,
  Platform,
  generateStaticKeypair,
  type ClientEvent,
  type GridDiff,
  type GridSnapshot,
  type Message,
  type StaticKeypair,
} from "../../src/protocol/index.ts";
import { createMemoryRelay, createTestClock, testKeypair, type MemoryRelay, type TestClock } from "../../src/protocol/testing.ts";
import { createScenarioHost, type ScenarioHost, type ScenarioHostOptions } from "../../tools/fake-host/host.ts";
import { LIVE_PANE, LIVE_PANE_COLS, LIVE_PANE_ROWS } from "../../tools/fake-host/scenario.ts";

const HOST_KEY = testKeypair(1);

interface World {
  readonly relay: MemoryRelay;
  readonly clock: TestClock;
  readonly host: ScenarioHost;
}

function world(options: Partial<ScenarioHostOptions> = {}): World {
  const relay = createMemoryRelay();
  const clock = createTestClock();
  const host = createScenarioHost({ relay, now: clock.now, hostKey: HOST_KEY, ...options });
  return { relay, clock, host };
}

/** A client of the host over the memory relay, recording what it receives. */
class TestClient {
  readonly messages: Message[] = [];
  readonly events: ClientEvent[] = [];
  private session: ClientSession | null = null;
  private readonly link;

  constructor(
    private readonly w: World,
    start: (now: number) => { session: ClientSession; frames: Uint8Array[] },
  ) {
    const started = start(w.clock.now());
    this.session = started.session;
    this.link = w.relay.connectClient(w.host.hostId, (frame) => {
      for (const event of this.session?.receive(frame, w.clock.now()) ?? []) {
        this.events.push(event);
        if (event.type === "message") {
          this.messages.push(event.message);
        } else if (event.type === "send") {
          this.link?.send(event.frame);
        }
      }
    });
    for (const frame of started.frames) {
      this.link.send(frame);
    }
  }

  static connect(w: World, device: StaticKeypair): TestClient {
    return new TestClient(w, (now) => ClientSession.connect(w.host.hostId, w.host.hostKey, device, now));
  }

  static pair(w: World, device: StaticKeypair, token = true): TestClient {
    const invite = w.host.startPairing("ws://localhost:8787");
    if (!token) {
      invite.token = new Uint8Array(16).fill(9);
    }
    return new TestClient(w, (now) => ClientSession.pair(invite, device, "Phone", Platform.android, now));
  }

  get open(): boolean {
    return this.session?.isOpen === true;
  }

  send(message: Message): void {
    for (const frame of this.session?.send(message, this.w.clock.now()) ?? []) {
      this.link.send(frame);
    }
  }

  ofType<T extends Message["type"]>(type: T): Extract<Message, { type: T }>[] {
    return this.messages.filter((m): m is Extract<Message, { type: T }> => m.type === type);
  }

  /** Grid messages (snapshots and diffs) received so far. */
  grid(): (GridSnapshot | GridDiff)[] {
    return this.messages.filter((m): m is GridSnapshot | GridDiff => m.type === "grid-snapshot" || m.type === "grid-diff");
  }

  ack(message: GridSnapshot | GridDiff): void {
    this.send({ type: "grid-ack", pane: message.pane, seq: message.seq });
  }
}

function hello(client: TestClient): void {
  client.send({ type: "hello", version: [0, 1], app: "porecatu-remote", appVersion: "0.0.0" });
}

function ready(w: World, device = generateStaticKeypair()): TestClient {
  const client = TestClient.connect(w, device);
  hello(client);
  return client;
}

/** Ticks the clock 1 ms at a time, acking every grid message, for `ms`. */
function run(w: World, client: TestClient, ms: number, acking = true): void {
  for (let i = 0; i < ms; i++) {
    w.clock.advance(1);
    w.host.tick(w.clock.now());
    if (acking) {
      const grid = client.grid();
      const last = grid[grid.length - 1];
      if (last !== undefined && acked.get(client) !== last.seq) {
        acked.set(client, last.seq);
        client.ack(last);
      }
    }
  }
}
const acked = new WeakMap<TestClient, number>();

describe("pairing and connection", () => {
  it("pairs a device with the QR token and then accepts it", () => {
    const w = world({ strict: true });
    const device = generateStaticKeypair();
    const pairing = TestClient.pair(w, device);
    expect(pairing.ofType("pair-accepted")).toEqual([{ type: "pair-accepted", hostName: "Fake Desktop" }]);
    expect(w.host.pairedDevices()).toHaveLength(1);
    pairing.send({ type: "goodbye", reason: GoodbyeReason.normal });

    const connected = ready(w, device);
    expect(connected.ofType("welcome")).toHaveLength(1);
  });

  it("rejects a pairing with a wrong token", () => {
    const w = world();
    const wrong = TestClient.pair(w, generateStaticKeypair(), false);
    expect(wrong.ofType("pair-rejected")).toEqual([{ type: "pair-rejected", reason: PairRejectReason.tokenInvalid }]);
    expect(w.host.pairedDevices()).toHaveLength(0);
  });

  it("declines every pairing when asked to", () => {
    const w = world({ declinePairing: true });
    const declined = TestClient.pair(w, generateStaticKeypair());
    expect(declined.ofType("pair-rejected")).toEqual([{ type: "pair-rejected", reason: PairRejectReason.userDeclined }]);
    expect(w.host.pairedDevices()).toHaveLength(0);
  });

  it("accepts an unknown device by default and refuses it in strict mode", () => {
    const lenient = world();
    expect(ready(lenient).ofType("welcome")).toHaveLength(1);

    const strict = world({ strict: true });
    const stranger = TestClient.connect(strict, generateStaticKeypair());
    expect(stranger.ofType("error")).toEqual([{ type: "error", code: ErrorCode.notPaired }]);
  });

  it("answers hello with welcome, theme, profiles and the workspace, in that order", () => {
    const w = world({ maxSubscriptions: 3 });
    const client = ready(w);
    expect(client.messages.map((m) => m.type)).toEqual(["welcome", "theme", "profiles", "workspace"]);
    const [welcome] = client.ofType("welcome");
    expect(welcome).toMatchObject({ maxSubscriptions: 3, hostName: "Fake Desktop" });
    expect(welcome?.hostInstance).toHaveLength(16);
    expect(client.ofType("workspace")[0]?.windows).toHaveLength(2);
  });

  it("keeps the host_instance for the run and changes it between hosts", () => {
    const a = world();
    const first = ready(a).ofType("welcome")[0]?.hostInstance;
    const second = ready(a).ofType("welcome")[0]?.hostInstance;
    expect(second).toEqual(first);
    const other = ready(world()).ofType("welcome")[0]?.hostInstance;
    expect(other).not.toEqual(first);
  });

  it("answers an incompatible version and closes", () => {
    const w = world();
    const client = TestClient.connect(w, generateStaticKeypair());
    client.send({ type: "hello", version: [9, 0], app: "x", appVersion: "0" });
    expect(client.ofType("incompatible")).toHaveLength(1);
    expect(client.events.some((e) => e.type === "closed")).toBe(true);
  });

  it("says goodbye to everyone on shutdown", () => {
    const w = world();
    const client = ready(w);
    expect(w.host.openChannels()).toBe(1);
    w.host.shutdown();
    expect(client.ofType("goodbye")).toEqual([{ type: "goodbye", reason: GoodbyeReason.hostQuitting }]);
    expect(client.events.some((e) => e.type === "closed" && e.reason === CloseReason.normal)).toBe(true);
    expect(w.relay.hasHost(w.host.hostId)).toBe(false);
  });

  it("closes a channel that does not finish the handshake in time", () => {
    const w = world();
    const client = new TestClient(w, (now) => {
      const started = ClientSession.connect(w.host.hostId, w.host.hostKey, generateStaticKeypair(), now);
      return { session: started.session, frames: [] };
    });
    expect(w.relay.channelCount(w.host.hostId)).toBe(1);
    w.clock.advance(16_000);
    w.host.tick(w.clock.now());
    expect(w.relay.channelCount(w.host.hostId)).toBe(0);
    expect(client.open).toBe(false);
  });
});

describe("subscriptions and flow control", () => {
  it("answers subscribe with a 200x60 snapshot whose seq is 0", () => {
    const client = ready(world());
    client.send({ type: "subscribe", pane: LIVE_PANE });
    const [snapshot] = client.ofType("grid-snapshot");
    expect(snapshot).toMatchObject({ pane: LIVE_PANE, seq: 0, cols: LIVE_PANE_COLS, rows: LIVE_PANE_ROWS });
    expect(snapshot?.lines).toHaveLength(LIVE_PANE_ROWS);
  });

  it("gives other panes an empty snapshot of their own size and refuses unknown ones", () => {
    const client = ready(world());
    client.send({ type: "subscribe", pane: 3 });
    expect(client.ofType("grid-snapshot")[0]).toMatchObject({ pane: 3, cols: 80, rows: 24, history: 0 });
    client.send({ type: "subscribe", pane: 999 });
    expect(client.ofType("error")).toEqual([{ type: "error", code: ErrorCode.unknownPane, pane: 999 }]);
  });

  it("respects max_subscriptions", () => {
    const client = ready(world({ maxSubscriptions: 2 }));
    for (const pane of [1, 3, 4]) {
      client.send({ type: "subscribe", pane });
    }
    expect(client.ofType("grid-snapshot")).toHaveLength(2);
    expect(client.ofType("error")).toEqual([{ type: "error", code: ErrorCode.tooManySubscriptions, pane: 4 }]);
  });

  it("subscribing again sends a new snapshot with the next seq of the same subscription", () => {
    const client = ready(world());
    client.send({ type: "subscribe", pane: LIVE_PANE });
    client.send({ type: "subscribe", pane: LIVE_PANE });
    expect(client.ofType("grid-snapshot").map((m) => m.seq)).toEqual([0, 1]);
  });

  it("keeps at most 2 grid messages unacknowledged and resumes on the ack", () => {
    const w = world();
    const client = ready(w);
    client.send({ type: "subscribe", pane: LIVE_PANE });
    run(w, client, 1000, false);
    expect(client.grid().map((m) => m.seq)).toEqual([0, 1]);
    const first = client.grid()[0];
    if (first === undefined) throw new Error("no snapshot");
    client.ack(first);
    run(w, client, 100, false);
    expect(client.grid().map((m) => m.seq)).toEqual([0, 1, 2]);
  });

  it("sends the accumulated changes as one diff after a stall", () => {
    const w = world();
    const client = ready(w);
    client.send({ type: "subscribe", pane: LIVE_PANE });
    run(w, client, 1000, false);
    for (const message of client.grid()) client.ack(message);
    run(w, client, 40, false);
    const [diff] = client.ofType("grid-diff").slice(1);
    // Thirty frames happened while stalled: the log scrolled, so every log row is in the one diff.
    expect(diff?.lines.length).toBeGreaterThan(50);
  });

  it("sends grid messages at about 30 per second, never above, with consecutive seq numbers", () => {
    const w = world();
    const client = ready(w);
    client.send({ type: "subscribe", pane: LIVE_PANE });
    run(w, client, 5000);
    const grid = client.grid();
    expect(grid.map((m) => m.seq)).toEqual(grid.map((_, i) => i));
    expect(grid.length).toBeGreaterThanOrEqual(5 * 25);
    expect(grid.length).toBeLessThanOrEqual(5 * 30 + 1);
  });

  it("sends nothing to a client that unsubscribed", () => {
    const w = world();
    const client = ready(w);
    client.send({ type: "subscribe", pane: LIVE_PANE });
    client.send({ type: "unsubscribe", pane: LIVE_PANE });
    run(w, client, 500);
    expect(client.grid()).toHaveLength(1);
  });

  it("keeps a grid model that applies every message equal to a fresh snapshot", () => {
    const w = world();
    const client = ready(w);
    const model = new GridModel();
    client.send({ type: "subscribe", pane: LIVE_PANE });
    let applied = 0;
    // Stop right after a message went out: the host state is then exactly what the model holds.
    for (let i = 0; i < 4000 && applied < 100; i++) {
      run(w, client, 1);
      for (const message of client.grid().slice(applied)) {
        const result = message.type === "grid-snapshot" ? model.applySnapshot(message) : model.applyDiff(message);
        expect(result.ok).toBe(true);
        applied += 1;
      }
    }
    expect(applied).toBe(100);

    const fresh = ready(w, generateStaticKeypair());
    fresh.send({ type: "subscribe", pane: LIVE_PANE });
    const reference = new GridModel();
    const [snapshot] = fresh.ofType("grid-snapshot");
    if (snapshot === undefined) throw new Error("no snapshot");
    reference.applySnapshot(snapshot);
    expect(model.history).toBe(reference.history);
    expect(model.dropped).toBe(reference.dropped);
    expect(model.cursor).toEqual(reference.cursor);
    const cell = (grid: GridModel, row: number, col: number): string => {
      const c = grid.cellAt(row, col);
      return JSON.stringify([c.text, c.width, c.continuation, c.style.key]);
    };
    for (let row = 0; row < LIVE_PANE_ROWS; row++) {
      for (let col = 0; col < LIVE_PANE_COLS; col++) {
        expect(cell(model, row, col)).toBe(cell(reference, row, col));
      }
    }
  });
});

describe("scrollback, input, actions and bell", () => {
  it("answers a scrollback request for a subscribed pane and refuses it otherwise", () => {
    const client = ready(world());
    client.send({ type: "scrollback-request", id: 1, pane: LIVE_PANE, offset: 0, count: 10 });
    expect(client.ofType("error")).toEqual([{ type: "error", code: ErrorCode.notSubscribed, id: 1, pane: LIVE_PANE }]);
    client.send({ type: "subscribe", pane: LIVE_PANE });
    client.send({ type: "scrollback-request", id: 2, pane: LIVE_PANE, offset: 0, count: 10 });
    const [page] = client.ofType("scrollback-page");
    expect(page).toMatchObject({ id: 2, pane: LIVE_PANE, offset: 0, dropped: 0 });
    expect(page?.lines).toHaveLength(10);
    expect(page?.history).toBe(client.ofType("grid-snapshot")[0]?.history);
  });

  it("echoes typed text, keys and paste on the prompt row", () => {
    const w = world();
    const client = ready(w);
    client.send({ type: "subscribe", pane: LIVE_PANE });
    client.send({ type: "text-input", pane: LIVE_PANE, text: "ls" });
    client.send({ type: "key", pane: LIVE_PANE, key: "-", mods: 0 });
    client.send({ type: "paste", pane: LIVE_PANE, text: "la" });
    run(w, client, 100);
    const rows = new Map(client.ofType("grid-diff").flatMap((d) => d.lines));
    expect(rows.get(58)).toEqual([false, [[0, 1, 7, "$ "], [2, 1, 0, "ls-la"]]]);
    client.send({ type: "key", pane: LIVE_PANE, key: NamedKey.backspace, mods: 0 });
    client.send({ type: "key", pane: LIVE_PANE, key: NamedKey.enter, mods: 0 });
    run(w, client, 100);
    expect(client.ofType("grid-diff").pop()?.cursor.col).toBe(2);
  });

  it("refuses input for a pane the client does not subscribe to or that does not run", () => {
    const client = ready(world());
    client.send({ type: "text-input", pane: LIVE_PANE, text: "x" });
    client.send({ type: "subscribe", pane: 3 });
    client.send({ type: "text-input", pane: 3, text: "x" });
    expect(client.ofType("error")).toEqual([
      { type: "error", code: ErrorCode.notSubscribed, pane: LIVE_PANE },
      { type: "error", code: ErrorCode.paneNotRunning, pane: 3 },
    ]);
  });

  it("answers every action as unsupported", () => {
    const client = ready(world());
    client.send({ type: "action", id: 4, do: { type: "close-tab", tab: 2 } });
    expect(client.ofType("action-result")).toEqual([{ type: "action-result", id: 4, error: ErrorCode.unsupported }]);
  });

  it("rings the bell only for clients subscribed to the live pane", () => {
    const w = world();
    const watching = ready(w);
    const idle = ready(w);
    watching.send({ type: "subscribe", pane: LIVE_PANE });
    w.host.ringBell();
    expect(watching.ofType("bell")).toEqual([{ type: "bell", pane: LIVE_PANE }]);
    expect(idle.ofType("bell")).toEqual([]);
  });
});
