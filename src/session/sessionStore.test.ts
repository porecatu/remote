// SPDX-License-Identifier: GPL-3.0-or-later

import { ErrorCode, ConfirmKind, type Message } from "@/protocol";
import { group, tab, win, workspace } from "@/workspace/testing";
import { activateTab, closeTab, newTab, renameTab } from "./actions";
import { CONFIRM_TIMEOUT_MS } from "./confirm";
import { NEW_TAB_APPEAR_TIMEOUT_MS } from "./requests";
import { type SessionEvent, type SessionStore, createSessionStore } from "./sessionStore";
import { type Harness, createHarness, greetingHost, instanceHex } from "./testing";

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

interface Rig {
  readonly h: Harness;
  readonly session: SessionStore;
  readonly events: SessionEvent[];
  readonly forwarded: Message[];
}

function rig(h: Harness = createHarness()): Rig {
  const session = createSessionStore({
    desktop: h.desktop,
    device: h.device,
    appVersion: "0.0.1",
    openSocket: h.network.openSocket,
    clock: h.time.clock,
    scheduler: h.time.scheduler,
  });
  const events: SessionEvent[] = [];
  const forwarded: Message[] = [];
  session.onEvent((event) => events.push(event));
  session.onMessage((message) => forwarded.push(message));
  return { h, session, events, forwarded };
}

function ready(r: Rig): void {
  r.session.start();
  r.h.network.last().open();
}

function sent(r: Rig, type: Message["type"]): Message[] {
  return r.h.host.received.map((entry) => entry.message).filter((m) => m.type === type);
}

describe("session store: state from the host", () => {
  it("keeps the greeting: workspace, profiles, theme, connection and instance", () => {
    const r = rig();
    expect(r.session.getState()).toMatchObject({
      desktopId: r.h.desktop.id,
      workspace: null,
      profiles: null,
      theme: null,
    });
    ready(r);
    const state = r.session.getState();
    expect(state.connection.state).toBe("ready");
    expect(state.connection.welcome?.maxSubscriptions).toBe(4);
    expect(state.workspace?.windows[0]?.title).toBe("Test Desktop");
    expect(state.profiles?.defaultProfile).toBe("default");
    expect(state.theme?.palette).toHaveLength(16);
    expect(state.expansion.hostInstance).toBe(instanceHex(0x5a));
    expect(state.workspaceDiff).toBeNull();
  });

  it("replaces the workspace whole and reports what changed by id", () => {
    const r = rig();
    ready(r);
    r.h.host.broadcast(workspace([win(1, [tab(1), tab(2)], { active: 1 })], 2));
    const state = r.session.getState();
    expect(state.workspace?.rev).toBe(2);
    expect([...(state.workspaceDiff?.tabsAdded ?? [])]).toEqual([2]);
    expect([...(state.workspaceDiff?.tabsRemoved ?? [])]).toEqual([]);

    r.h.host.broadcast(workspace([win(1, [tab(2)], { active: 2 })], 3));
    expect([...(r.session.getState().workspaceDiff?.tabsRemoved ?? [])]).toEqual([1]);
  });

  it("passes on what it does not consume", () => {
    const r = rig();
    ready(r);
    r.forwarded.length = 0;
    r.h.host.broadcast({ type: "bell", pane: 100 });
    r.h.host.broadcast({ type: "subscription-ended", pane: 100, reason: 0 });
    expect(r.forwarded.map((m) => m.type)).toEqual(["bell", "subscription-ended"]);
  });

  it("stops passing messages to a listener that unsubscribed", () => {
    const r = rig();
    const seen: Message[] = [];
    const off = r.session.onMessage((m) => seen.push(m));
    ready(r);
    off();
    r.h.host.broadcast({ type: "bell", pane: 100 });
    expect(seen.map((m) => m.type)).not.toContain("bell");
  });

  it("mirrors the lifecycle when the session ends", () => {
    const r = rig(createHarness({ paired: false }));
    ready(r);
    expect(r.session.getState().connection).toMatchObject({
      state: "closed",
      end: { reason: "not-paired" },
    });
  });
});

describe("session store: actions", () => {
  it("refuses an action before the session is ready", () => {
    const r = rig();
    expect(r.session.sendAction((id) => newTab(id, 1))).toEqual({ ok: false, reason: "not-ready" });
  });

  it("sends the action with a fresh id and tracks it until the result", () => {
    const r = rig();
    ready(r);
    const result = r.session.sendAction((id) => newTab(id, 1));
    expect(result).toEqual({ ok: true, id: 1 });
    expect(sent(r, "action")).toEqual([
      { type: "action", id: 1, do: { type: "new-tab", window: 1 } },
    ]);
    expect(r.session.getState().requests.pending.has(1)).toBe(true);

    r.h.host.broadcast({ type: "action-result", id: 1 });
    expect(r.session.getState().requests.pending.size).toBe(0);
    expect(r.events).toEqual([
      expect.objectContaining({
        type: "action-outcome",
        outcome: expect.objectContaining({ status: "done" }),
      }),
    ]);
  });

  it("accepts no second action on an item with one pending (RF-4.9)", () => {
    const r = rig();
    ready(r);
    expect(r.session.sendAction((id) => renameTab(id, 1, "a")).ok).toBe(true);
    expect(r.session.sendAction((id) => closeTab(id, 1))).toEqual({ ok: false, reason: "busy" });
    expect(sent(r, "action")).toHaveLength(1);
  });

  it("hands out request ids that skip the pending ones", () => {
    const r = rig();
    ready(r);
    r.session.sendAction((id) => closeTab(id, 1));
    expect(r.session.nextRequestId()).toBe(2);
    expect(r.session.nextRequestId()).toBe(3);
  });

  it("reports a failed action, with the stale-tree flag for unknown-*", () => {
    const r = rig();
    ready(r);
    r.session.sendAction((id) => closeTab(id, 1));
    r.h.host.broadcast({ type: "action-result", id: 1, error: ErrorCode.unknownTab });
    expect(r.events[0]).toMatchObject({
      type: "action-outcome",
      outcome: { status: "failed", failure: { code: ErrorCode.unknownTab, staleTree: true } },
    });
  });

  it("ignores a result that is not for a pending action", () => {
    const r = rig();
    ready(r);
    r.h.host.broadcast({ type: "action-result", id: 99 });
    expect(r.events).toEqual([]);
  });

  it("waits for a created tab to show up, and tells when it does", () => {
    const r = rig();
    ready(r);
    r.session.sendAction((id) => newTab(id, 1));
    r.h.host.broadcast({ type: "action-result", id: 1, created: 2 });
    expect(r.events[0]).toMatchObject({ outcome: { status: "waiting-tab", tab: 2 } });
    expect(r.session.getState().requests.waiting.size).toBe(1);

    r.h.host.broadcast(workspace([win(1, [tab(1), tab(2)], { active: 1 })], 2));
    expect(r.events[1]).toEqual({
      type: "tab-waiting",
      event: { id: 1, tab: 2, status: "appeared" },
    });
    expect(r.session.getState().requests.waiting.size).toBe(0);
    expect(r.h.time.pending()).toBe(0);
  });

  it("gives up on a created tab that never shows up", () => {
    const r = rig();
    ready(r);
    r.session.sendAction((id) => newTab(id, 1));
    r.h.host.broadcast({ type: "action-result", id: 1, created: 2 });
    r.h.time.advance(NEW_TAB_APPEAR_TIMEOUT_MS - 1);
    expect(r.events).toHaveLength(1);
    r.h.time.advance(1);
    expect(r.events[1]).toEqual({
      type: "tab-waiting",
      event: { id: 1, tab: 2, status: "timed-out" },
    });
  });

  it("loses the pending actions when the session drops, and keeps the tree", () => {
    const r = rig();
    ready(r);
    r.session.sendAction((id) => closeTab(id, 1));
    r.h.network.last().drop();
    const state = r.session.getState();
    expect(state.connection.state).toBe("reconnecting");
    expect(state.requests.pending.size).toBe(0);
    expect(state.workspace).not.toBeNull();
    expect(r.events).toEqual([
      expect.objectContaining({
        type: "actions-lost",
        lost: [expect.objectContaining({ id: 1 })],
      }),
    ]);
  });

  it("drops a pending activate-tab without an actions-lost event", () => {
    const r = rig();
    ready(r);
    expect(r.session.sendAction((id) => activateTab(id, 1))).toEqual({ ok: true, id: 1 });
    r.h.network.last().drop();
    expect(r.session.getState().requests.pending.size).toBe(0);
    expect(r.events).toEqual([]);
  });
});

describe("session store: confirmations", () => {
  function pendingClose(r: Rig): void {
    r.session.sendAction((id) => closeTab(id, 1));
    r.h.host.broadcast({
      type: "confirm-request",
      id: 1,
      kind: ConfirmKind.runningProcess,
      processes: ["vim"],
    });
  }

  it("shows the confirmation of a pending action and answers it", () => {
    const r = rig();
    ready(r);
    pendingClose(r);
    expect(r.session.getState().confirms).toHaveLength(1);
    expect(r.session.getState().confirms[0]).toMatchObject({ id: 1, processes: ["vim"] });

    expect(r.session.answerConfirm(1, true)).toBe(true);
    expect(sent(r, "confirm")).toEqual([{ type: "confirm", id: 1, accept: true }]);
    expect(r.session.getState().confirms).toHaveLength(0);
    expect(r.session.answerConfirm(1, true)).toBe(false);
  });

  it("drops the dialog when the action ends", () => {
    const r = rig();
    ready(r);
    pendingClose(r);
    r.h.host.broadcast({ type: "action-result", id: 1, error: ErrorCode.cancelled });
    expect(r.session.getState().confirms).toHaveLength(0);
    expect(r.events[0]).toMatchObject({ outcome: { status: "failed", failure: { silent: true } } });
  });

  it("ignores a confirmation request for an action it never sent", () => {
    const r = rig();
    ready(r);
    r.h.host.broadcast({
      type: "confirm-request",
      id: 7,
      kind: ConfirmKind.sshConnection,
      processes: [],
    });
    expect(r.session.getState().confirms).toHaveLength(0);
  });

  it("drops an unanswered confirmation after 60 s and says so", () => {
    const r = rig();
    ready(r);
    pendingClose(r);
    r.h.time.advance(CONFIRM_TIMEOUT_MS - 1);
    expect(r.session.getState().confirms).toHaveLength(1);
    r.h.time.advance(1);
    expect(r.session.getState().confirms).toHaveLength(0);
    expect(r.events[0]).toMatchObject({
      type: "confirm-expired",
      confirms: [expect.objectContaining({ id: 1 })],
    });
  });

  it("clears the confirmations when the session drops", () => {
    const r = rig();
    ready(r);
    pendingClose(r);
    r.h.network.last().drop();
    expect(r.session.getState().confirms).toHaveLength(0);
    expect(r.h.time.pending()).toBe(1); // only the retry
  });
});

describe("session store: group expansion and host instance", () => {
  const tree = workspace([
    win(1, [group(5, [tab(1), tab(2)], { collapsed: true })], { active: 1 }),
  ]);

  function expandedRig(instance: number): { r: Rig; host: ReturnType<typeof greetingHost> } {
    const h = createHarness();
    const host = greetingHost(h, instance, tree);
    const r = rig(h);
    ready(r);
    r.session.toggleGroupExpansion(5);
    expect(r.session.getState().expansion.expanded.has(5)).toBe(true);
    return { r, host };
  }

  it("keeps the local expansion and the tree across a reconnection to the same instance", () => {
    const { r } = expandedRig(1);
    r.h.network.last().drop();
    r.h.time.advance(1000);
    r.h.network.last().open();
    expect(r.session.getState().connection.state).toBe("ready");
    expect(r.session.getState().expansion.expanded.has(5)).toBe(true);
    expect(r.session.getState().workspaceDiff).not.toBeNull();
  });

  it("forgets everything keyed by id when the desktop restarted", () => {
    const { r, host } = expandedRig(1);
    const seenTrees: unknown[] = [];
    r.session.store.subscribe((state) => seenTrees.push(state.workspace));

    host.detach();
    greetingHost(r.h, 2, tree);
    r.h.time.advance(1000);
    r.h.network.last().open();

    const state = r.session.getState();
    expect(state.connection.state).toBe("ready");
    expect(state.expansion.hostInstance).toBe(instanceHex(2));
    expect(state.expansion.expanded.size).toBe(0);
    // The old tree was dropped at the welcome, before the new one arrived.
    expect(seenTrees).toContain(null);
    expect(state.workspaceDiff).toBeNull();
    expect(state.workspace).not.toBeNull();
  });

  it("drops the local expansion of a group the desktop now shows open", () => {
    const { r, host } = expandedRig(1);
    host.broadcast(
      workspace([win(1, [group(5, [tab(1), tab(2)], { collapsed: false })], { active: 1 })], 9),
    );
    expect(r.session.getState().expansion.expanded.size).toBe(0);
  });
});

describe("session store: closing", () => {
  it("says goodbye on close and leaves no timer behind on dispose", () => {
    const r = rig();
    ready(r);
    r.session.sendAction((id) => newTab(id, 1));
    r.h.host.broadcast({ type: "action-result", id: 1, created: 2 });
    expect(r.h.time.pending()).toBe(1);

    r.session.dispose();
    expect(r.session.getState().connection).toMatchObject({ state: "closed", end: { reason: "user" } });
    expect(r.h.time.pending()).toBe(0);
  });

  it("aborts the session on request", () => {
    const r = rig();
    ready(r);
    r.session.abort("seq-gap");
    expect(r.session.getState().connection).toMatchObject({
      state: "failed",
      end: { reason: "protocol", code: "seq-gap" },
    });
  });

  it("relays a plain send to the host", () => {
    const r = rig();
    expect(r.session.send({ type: "subscribe", pane: 100 })).toBe(false);
    ready(r);
    expect(r.session.send({ type: "subscribe", pane: 100 })).toBe(true);
    expect(sent(r, "subscribe")).toEqual([{ type: "subscribe", pane: 100 }]);
  });
});
