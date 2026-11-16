// SPDX-License-Identifier: GPL-3.0-or-later
import {
  CursorShape,
  ErrorCode,
  type GridDiff,
  type GridSnapshot,
  type Message,
  type ScrollbackPage,
  SubscriptionEndReason,
} from "../protocol";
import { createRequestIdAllocator } from "./requests";
import {
  type ProtocolFault,
  SubscriptionSet,
  type SubscriptionEvent,
  type SubscriptionSetOptions,
} from "./subscription";
import { createFakeHostKit } from "./subscriptionTestkit";

const PANE = 1;
const OTHER = 2;

// A protocol error logs its `protocol_error` event; keep the test output clean.
beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});
const CURSOR = { row: 0, col: 0, shape: CursorShape.block, visible: true } as const;
const PLAIN = [null, null, 0] as const;

function snapshot(over: Partial<GridSnapshot> = {}): GridSnapshot {
  return {
    type: "grid-snapshot",
    pane: PANE,
    seq: 0,
    cols: 4,
    rows: 2,
    history: 10,
    dropped: 0,
    styles: [PLAIN],
    lines: [
      [false, [[0, 1, 0, "ab"]]],
      [false, []],
    ],
    cursor: CURSOR,
    alt: false,
    ...over,
  };
}

function diff(seq: number, over: Partial<GridDiff> = {}): GridDiff {
  return {
    type: "grid-diff",
    pane: PANE,
    seq,
    history: 10,
    dropped: 0,
    styles: [PLAIN],
    lines: [[1, [false, [[0, 1, 0, "cd"]]]]],
    cursor: CURSOR,
    alt: false,
    ...over,
  };
}

/** A set with `send` and events recorded, no socket. */
function makeSet(over: Partial<SubscriptionSetOptions> = {}) {
  const sent: Message[] = [];
  const events: SubscriptionEvent[] = [];
  const faults: ProtocolFault[] = [];
  const ids = createRequestIdAllocator();
  const state = { bell: true };
  const set = new SubscriptionSet({
    send: (message) => sent.push(message),
    maxSubscriptions: 4,
    nextRequestId: () => ids.next(),
    bellVibration: () => state.bell,
    onEvent: (event) => events.push(event),
    onProtocolError: (fault) => faults.push(fault),
    ...over,
  });
  return { set, sent, events, faults, state };
}

describe("subscribe and unsubscribe", () => {
  it("sends subscribe and tracks the pane", () => {
    const { set, sent } = makeSet();
    expect(set.subscribe(PANE)).toEqual({ ok: true, resubscribed: false });
    expect(sent).toEqual([{ type: "subscribe", pane: PANE }]);
    expect(set.has(PANE)).toBe(true);
    expect(set.isReady(PANE)).toBe(false);
    expect(set.panes()).toEqual([PANE]);
  });

  it("subscribing again keeps the model and asks for a new snapshot without using a slot", () => {
    const { set, sent } = makeSet({ maxSubscriptions: 1 });
    set.subscribe(PANE);
    const grid = set.get(PANE)?.grid;
    expect(set.subscribe(PANE)).toEqual({ ok: true, resubscribed: true });
    expect(set.get(PANE)?.grid).toBe(grid);
    expect(sent).toHaveLength(2);
    expect(set.size).toBe(1);
  });

  it("respects max_subscriptions without sending anything", () => {
    const { set, sent } = makeSet({ maxSubscriptions: 2 });
    set.subscribe(1);
    set.subscribe(2);
    sent.length = 0;
    expect(set.subscribe(3)).toEqual({ ok: false, reason: "limit" });
    expect(sent).toEqual([]);
    expect(set.has(3)).toBe(false);
    // Freeing a slot lets the next one in.
    expect(set.unsubscribe(1)).toBe(true);
    expect(set.subscribe(3)).toEqual({ ok: true, resubscribed: false });
  });

  it("unsubscribe sends once and forgets the model; unknown pane sends nothing", () => {
    const { set, sent } = makeSet();
    set.subscribe(PANE);
    sent.length = 0;
    expect(set.unsubscribe(PANE)).toBe(true);
    expect(sent).toEqual([{ type: "unsubscribe", pane: PANE }]);
    expect(set.get(PANE)).toBeUndefined();
    expect(set.unsubscribe(PANE)).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it("reset drops everything locally and takes the new max", () => {
    const { set, sent } = makeSet({ maxSubscriptions: 1 });
    set.subscribe(PANE);
    sent.length = 0;
    set.reset(3);
    expect(sent).toEqual([]);
    expect(set.size).toBe(0);
    expect(set.maxSubscriptions).toBe(3);
  });
});

describe("grid messages", () => {
  it("applies a snapshot, then acks it", () => {
    const { set, sent, events } = makeSet();
    set.subscribe(PANE);
    sent.length = 0;
    expect(set.handle(snapshot({ seq: 7 }))).toBe(true);
    expect(sent).toEqual([{ type: "grid-ack", pane: PANE, seq: 7 }]);
    expect(events).toEqual([{ type: "grid", pane: PANE }]);
    const sub = set.get(PANE);
    expect(set.isReady(PANE)).toBe(true);
    expect(sub?.grid.cellAt(0, 1).text).toBe("b");
    expect(sub?.scrollback.history).toBe(10);
  });

  it("applies a diff on the next seq, acks it and marks the changed row", () => {
    const { set, sent } = makeSet();
    set.subscribe(PANE);
    set.handle(snapshot());
    set.get(PANE)?.grid.takeDirtyRows();
    sent.length = 0;
    set.handle(diff(1, { history: 11, dropped: 1 }));
    expect(sent).toEqual([{ type: "grid-ack", pane: PANE, seq: 1 }]);
    const sub = set.get(PANE);
    expect(sub?.grid.cellAt(1, 0).text).toBe("c");
    expect(sub?.grid.takeDirtyRows()).toEqual([1]);
    expect(sub?.scrollback.dropped).toBe(1);
    expect(sub?.scrollback.history).toBe(11);
  });

  it("acks only after the state was applied", () => {
    let readAtAck: number | null = null;
    const probe = new SubscriptionSet({
      send: (message) => {
        if (message.type === "grid-ack") {
          readAtAck = probe.get(PANE)?.grid.seq ?? null;
        }
      },
      maxSubscriptions: 4,
      nextRequestId: () => 1,
      bellVibration: () => true,
      onEvent: () => undefined,
      onProtocolError: () => undefined,
    });
    probe.subscribe(PANE);
    probe.handle(snapshot({ seq: 3 }));
    expect(readAtAck).toBe(3);
    probe.handle(diff(4));
    expect(readAtAck).toBe(4);
  });

  it("accepts a snapshot at any time, including one with another size and a later seq", () => {
    const { set, faults } = makeSet();
    set.subscribe(PANE);
    set.handle(snapshot());
    set.handle(diff(1));
    set.handle(snapshot({ seq: 2, cols: 3, rows: 1, lines: [[false, []]] }));
    expect(faults).toEqual([]);
    expect(set.get(PANE)?.grid.cols).toBe(3);
    expect(set.get(PANE)?.grid.seq).toBe(2);
  });

  it("a seq gap is a protocol error: error{protocol} goes out, the set closes", () => {
    const { set, sent, faults, events } = makeSet();
    set.subscribe(PANE);
    set.handle(snapshot());
    events.length = 0;
    sent.length = 0;
    set.handle(diff(5));
    expect(sent).toEqual([{ type: "error", code: ErrorCode.protocol }]);
    expect(faults).toEqual(["grid-seq"]);
    expect(events).toEqual([]);
    expect(set.isClosed).toBe(true);
    expect(set.size).toBe(0);
    // Nothing is applied or sent after that.
    sent.length = 0;
    set.handle(snapshot());
    expect(sent).toEqual([]);
    expect(set.subscribe(PANE)).toEqual({ ok: false, reason: "closed" });
    // A new session reopens the set.
    set.reset();
    expect(set.subscribe(PANE)).toEqual({ ok: true, resubscribed: false });
  });

  it("a diff before any snapshot is a protocol error", () => {
    const { set, faults } = makeSet();
    set.subscribe(PANE);
    set.handle(diff(0));
    expect(faults).toEqual(["grid-seq"]);
  });

  it("a malformed message (row out of range) is a protocol error of another kind", () => {
    const { set, faults } = makeSet();
    set.subscribe(PANE);
    set.handle(snapshot());
    set.handle(diff(1, { lines: [[9, [false, []]]] }));
    expect(faults).toEqual(["grid-message"]);
  });

  it("drops a grid message for a pane that is not subscribed (late after unsubscribe)", () => {
    const { set, sent, faults, events } = makeSet();
    set.subscribe(PANE);
    set.handle(snapshot());
    set.unsubscribe(PANE);
    sent.length = 0;
    events.length = 0;
    expect(set.handle(diff(1))).toBe(true);
    expect(set.handle(snapshot({ pane: OTHER }))).toBe(true);
    expect(sent).toEqual([]);
    expect(events).toEqual([]);
    expect(faults).toEqual([]);
  });

  it("a snapshot clears the scrollback cache; a new subscription restarts the sequence at 0", () => {
    const { set } = makeSet();
    set.subscribe(PANE);
    set.handle(snapshot({ seq: 4 }));
    set.unsubscribe(PANE);
    set.subscribe(PANE);
    expect(set.get(PANE)?.grid.hasState).toBe(false);
    set.handle(snapshot({ seq: 0 }));
    set.handle(diff(1));
    expect(set.get(PANE)?.grid.seq).toBe(1);
  });
});

describe("scrollback", () => {
  function page(over: Partial<ScrollbackPage> = {}): ScrollbackPage {
    return {
      type: "scrollback-page",
      id: 1,
      pane: PANE,
      history: 10,
      dropped: 0,
      offset: 0,
      styles: [PLAIN],
      lines: [[false, [[0, 1, 0, "h"]]]],
      ...over,
    };
  }

  it("asks for the missing page and stores the answer by absolute index", () => {
    const { set, sent, events } = makeSet();
    set.subscribe(PANE);
    set.handle(snapshot({ history: 10, dropped: 5 }));
    sent.length = 0;
    events.length = 0;
    expect(set.requestScrollback(PANE, 0, 1, 0)).toBe(true);
    expect(sent).toEqual([{ type: "scrollback-request", id: 1, pane: PANE, offset: 0, count: 1 }]);
    set.handle(page({ dropped: 5 }));
    expect(events).toEqual([{ type: "scrollback", pane: PANE }]);
    expect(set.get(PANE)?.scrollback.lineAt(0)?.line[1][0]?.[3]).toBe("h");
    // The same window is cached now: nothing to ask.
    expect(set.requestScrollback(PANE, 0, 1, 1)).toBe(false);
  });

  it("keeps a cached line at the same absolute index while the history grows", () => {
    const { set } = makeSet();
    set.subscribe(PANE);
    set.handle(snapshot({ history: 10, dropped: 0 }));
    set.requestScrollback(PANE, 0, 1, 0);
    set.handle(page());
    set.handle(diff(1, { history: 12 }));
    // Two lines came below it: it is now at offset 2.
    expect(set.get(PANE)?.scrollback.lineAt(0)).toBeUndefined();
    expect(set.get(PANE)?.scrollback.lineAt(2)).toBeDefined();
  });

  it("ignores a page nobody asked for and for a pane that is not subscribed", () => {
    const { set, events } = makeSet();
    set.subscribe(PANE);
    set.handle(snapshot());
    expect(set.handle(page({ id: 99 }))).toBe(true);
    expect(set.handle(page({ pane: OTHER }))).toBe(true);
    expect(events.filter((e) => e.type === "scrollback")).toEqual([]);
  });

  it("sends nothing for a pane that is not subscribed", () => {
    const { set, sent } = makeSet();
    expect(set.requestScrollback(PANE, 0, 1, 0)).toBe(false);
    expect(sent).toEqual([]);
  });

  it("an error answering a scrollback-request is taken and ignored", () => {
    const { set, events } = makeSet();
    set.subscribe(PANE);
    set.handle(snapshot());
    expect(set.handle({ type: "error", code: ErrorCode.notSubscribed, id: 3, pane: PANE })).toBe(true);
    expect(set.has(PANE)).toBe(true);
    expect(events.filter((e) => e.type === "refused")).toEqual([]);
  });
});

describe("subscription-ended, errors and bell", () => {
  it("subscription-ended drops the subscription and says why", () => {
    const { set, events } = makeSet();
    set.subscribe(PANE);
    set.handle(snapshot());
    events.length = 0;
    set.handle({ type: "subscription-ended", pane: PANE, reason: SubscriptionEndReason.paneClosed });
    expect(set.has(PANE)).toBe(false);
    expect(events).toEqual([{ type: "ended", pane: PANE, reason: SubscriptionEndReason.paneClosed }]);
  });

  it("subscription-ended for a pane that is not subscribed is dropped silently", () => {
    const { set, events } = makeSet();
    expect(
      set.handle({ type: "subscription-ended", pane: PANE, reason: SubscriptionEndReason.hostLimit }),
    ).toBe(true);
    expect(events).toEqual([]);
  });

  it.each([ErrorCode.unknownPane, ErrorCode.tooManySubscriptions, ErrorCode.notSubscribed])(
    "error %i for a pane drops its subscription and reports it",
    (code) => {
      const { set, events } = makeSet();
      set.subscribe(PANE);
      expect(set.handle({ type: "error", code, pane: PANE })).toBe(true);
      expect(set.has(PANE)).toBe(false);
      expect(events).toEqual([{ type: "refused", pane: PANE, code }]);
    },
  );

  it("pane-not-running reports without dropping the subscription", () => {
    const { set, events } = makeSet();
    set.subscribe(PANE);
    set.handle({ type: "error", code: ErrorCode.paneNotRunning, pane: PANE });
    expect(set.has(PANE)).toBe(true);
    expect(events).toEqual([{ type: "refused", pane: PANE, code: ErrorCode.paneNotRunning }]);
  });

  it("leaves other messages and errors without a pane to the owner", () => {
    const { set } = makeSet();
    expect(set.handle({ type: "error", code: ErrorCode.protocol })).toBe(false);
    expect(set.handle({ type: "error", code: ErrorCode.busy, pane: PANE })).toBe(false);
    expect(set.handle({ type: "goodbye", reason: 0 } as Message)).toBe(false);
  });

  it("bell vibrates on a subscribed pane when the setting is on", () => {
    const { set, events, state } = makeSet();
    set.subscribe(PANE);
    set.handle({ type: "bell", pane: PANE });
    expect(events).toEqual([{ type: "bell", pane: PANE, vibrate: true }]);
    events.length = 0;
    state.bell = false;
    set.handle({ type: "bell", pane: PANE });
    expect(events).toEqual([{ type: "bell", pane: PANE, vibrate: false }]);
  });

  it("bell in a pane that is not subscribed never vibrates", () => {
    const { set, events } = makeSet();
    set.handle({ type: "bell", pane: OTHER });
    expect(events).toEqual([{ type: "bell", pane: OTHER, vibrate: false }]);
  });
});

describe("with the package's fake host", () => {
  function connect(max?: number) {
    const kit = createFakeHostKit(max === undefined ? {} : { maxSubscriptions: max });
    const ids = createRequestIdAllocator();
    const events: SubscriptionEvent[] = [];
    const faults: ProtocolFault[] = [];
    const bell = { on: true };
    let set: SubscriptionSet | null = null;
    kit.onMessage = (message) => {
      if (message.type === "welcome") {
        set = new SubscriptionSet({
          send: (m) => kit.send(m),
          maxSubscriptions: message.maxSubscriptions,
          nextRequestId: () => ids.next(),
          bellVibration: () => bell.on,
          onEvent: (e) => events.push(e),
          onProtocolError: (f) => faults.push(f),
        });
        return;
      }
      set?.handle(message);
    };
    kit.open();
    if (set === null) {
      throw new Error("no welcome");
    }
    return { kit, set: set as SubscriptionSet, events, faults, bell };
  }

  const clientMessages = (kit: ReturnType<typeof createFakeHostKit>) =>
    kit.host.received.map((entry) => entry.message);

  it("subscribes, gets the snapshot and confirms it", () => {
    const { kit, set, events } = connect();
    expect(set.maxSubscriptions).toBe(kit.welcome()?.maxSubscriptions);
    set.subscribe(PANE);
    expect(set.isReady(PANE)).toBe(true);
    expect(events).toEqual([{ type: "grid", pane: PANE }]);
    expect(set.get(PANE)?.grid.cellAt(0, 0).text).toBe("$");
    const received = clientMessages(kit);
    expect(received.map((m) => m.type)).toEqual(["hello", "subscribe", "grid-ack"]);
    const ack = received[2];
    expect(ack).toEqual({ type: "grid-ack", pane: PANE, seq: set.get(PANE)?.grid.seq });
  });

  it("applies a diff the host broadcasts and acks it", () => {
    const { kit, set } = connect();
    set.subscribe(PANE);
    const first = set.get(PANE)?.grid.seq ?? 0;
    kit.host.broadcast(diff(first + 1, { history: 0, lines: [[0, [false, [[0, 1, 0, "$ ls"]]]]] }));
    expect(set.get(PANE)?.grid.cellAt(0, 2).text).toBe("l");
    expect(clientMessages(kit).at(-1)).toEqual({ type: "grid-ack", pane: PANE, seq: first + 1 });
  });

  it("closes on a seq gap: the host receives error{protocol}", () => {
    const { kit, set, faults } = connect();
    set.subscribe(PANE);
    const first = set.get(PANE)?.grid.seq ?? 0;
    kit.host.broadcast(diff(first + 3, { history: 0 }));
    expect(faults).toEqual(["grid-seq"]);
    expect(clientMessages(kit).at(-1)).toEqual({ type: "error", code: ErrorCode.protocol });
  });

  it("a subscribe for an unknown pane comes back refused and is dropped", () => {
    const { set, events } = connect();
    set.subscribe(OTHER);
    expect(set.has(OTHER)).toBe(false);
    expect(events).toEqual([{ type: "refused", pane: OTHER, code: ErrorCode.unknownPane }]);
  });

  it("does not exceed the max_subscriptions of the welcome", () => {
    const { kit, set } = connect(1);
    expect(set.maxSubscriptions).toBe(1);
    set.subscribe(PANE);
    const before = kit.host.received.length;
    expect(set.subscribe(OTHER)).toEqual({ ok: false, reason: "limit" });
    expect(kit.host.received).toHaveLength(before);
  });

  it("vibrates on the host's bell for the subscribed pane, unless turned off", () => {
    const { kit, set, events, bell } = connect();
    set.subscribe(PANE);
    events.length = 0;
    kit.host.broadcast({ type: "bell", pane: PANE });
    bell.on = false;
    kit.host.broadcast({ type: "bell", pane: PANE });
    expect(events).toEqual([
      { type: "bell", pane: PANE, vibrate: true },
      { type: "bell", pane: PANE, vibrate: false },
    ]);
  });

  it("ends the subscription when the host says the pane closed", () => {
    const { kit, set, events } = connect();
    set.subscribe(PANE);
    events.length = 0;
    kit.host.broadcast({ type: "subscription-ended", pane: PANE, reason: SubscriptionEndReason.paneClosed });
    expect(set.has(PANE)).toBe(false);
    expect(events).toEqual([{ type: "ended", pane: PANE, reason: SubscriptionEndReason.paneClosed }]);
  });
});
