// SPDX-License-Identifier: GPL-3.0-or-later

import { MAX_INPUT_TEXT_BYTES } from "@/input/send";
import {
  CursorShape,
  ErrorCode,
  type GridDiff,
  type GridSnapshot,
  type Line,
  type Message,
  NamedKey,
  PaneState,
  SplitDir,
  SubscriptionEndReason,
  type WorkspaceMessage,
} from "@/protocol";
import { type SessionEvent, type SessionStore, createSessionStore } from "@/session/sessionStore";
import { type Harness, type ScriptedHost, createHarness, greetingHost } from "@/session/testing";
import { pane, split, tab, win, workspace } from "@/workspace/testing";
import {
  type TerminalEvent,
  type TerminalSession,
  createTerminalSession,
  historyGrowth,
} from "./terminalSession";

// The session and the subscription log their events; keep the test output clean.
beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

const CURSOR = { row: 1, col: 2, shape: CursorShape.block, visible: true } as const;
const PLAIN = [null, null, 0] as const;
const LINE: Line = [false, [[0, 1, 0, "ab"]]];

/** Tab 1 has two panes (100 focused, 101); tab 2 has one (200). Tab 1 is the active one unless `active` says otherwise. */
function tree(
  rev = 1,
  over: { focused?: number; second?: number; state?: PaneState; active?: number } = {},
): WorkspaceMessage {
  return workspace(
    [
      win(
        1,
        [
          tab(1, {
            layout: split(
              SplitDir.sideBySide,
              32768,
              pane(100, over.state === undefined ? {} : { state: over.state }),
              pane(over.second ?? 101),
            ),
            focused: over.focused ?? 100,
          }),
          tab(2),
        ],
        { active: over.active ?? 1 },
      ),
    ],
    rev,
  );
}

function snapshot(paneId: number, seq: number, over: Partial<GridSnapshot> = {}): GridSnapshot {
  return {
    type: "grid-snapshot",
    pane: paneId,
    seq,
    cols: 4,
    rows: 2,
    history: 30,
    dropped: 0,
    styles: [PLAIN],
    lines: [LINE, [false, []]],
    cursor: CURSOR,
    alt: false,
    ...over,
  };
}

function diff(paneId: number, seq: number, over: Partial<GridDiff> = {}): GridDiff {
  return {
    type: "grid-diff",
    pane: paneId,
    seq,
    history: 30,
    dropped: 0,
    styles: [PLAIN],
    lines: [[1, LINE]],
    cursor: CURSOR,
    alt: false,
    ...over,
  };
}

interface Rig {
  readonly h: Harness;
  readonly session: SessionStore;
  host: ScriptedHost;
  readonly terminal: TerminalSession;
  readonly events: TerminalEvent[];
  readonly settings: { bell: boolean; answerHistory: boolean };
  /** Each `grid-ack` the host got, and whether the grid on screen already had that `seq`. */
  readonly acks: { readonly seq: number; readonly applied: boolean }[];
  /** Sends the next in-sequence diff of `paneId`. */
  pushDiff(paneId: number, over?: Partial<GridDiff>): void;
}

/** A greeting host that answers `subscribe` with a snapshot and, when told to, history requests. */
function gridHost(
  r: { -readonly [K in keyof Rig]?: Rig[K] },
  h: Harness,
  instance: number,
  lastSeq: Map<number, number>,
  active = 1,
): ScriptedHost {
  return greetingHost(h, instance, tree(1, { active }), (message, send) => {
    if (message.type === "subscribe") {
      const seq = (lastSeq.get(message.pane) ?? -1) + 1;
      lastSeq.set(message.pane, seq);
      send(snapshot(message.pane, seq));
    } else if (message.type === "grid-ack") {
      r.acks?.push({ seq: message.seq, applied: r.terminal?.grid()?.seq === message.seq });
    } else if (message.type === "scrollback-request" && r.settings?.answerHistory === true) {
      send({
        type: "scrollback-page",
        id: message.id,
        pane: message.pane,
        history: 30,
        dropped: 0,
        offset: message.offset,
        styles: [PLAIN],
        lines: Array.from({ length: message.count }, () => LINE),
      });
    }
  });
}

function rig(options: { open?: boolean; instance?: number; active?: number } = {}): Rig {
  const h = createHarness();
  const lastSeq = new Map<number, number>();
  const partial: { -readonly [K in keyof Rig]?: Rig[K] } = {
    h,
    events: [],
    acks: [],
    settings: { bell: true, answerHistory: false },
  };
  partial.host = gridHost(partial, h, options.instance ?? 1, lastSeq, options.active ?? 1);
  const session = createSessionStore({
    desktop: h.desktop,
    device: h.device,
    appVersion: "0.0.1",
    openSocket: h.network.openSocket,
    clock: h.time.clock,
    scheduler: h.time.scheduler,
  });
  session.start();
  h.network.last().open();
  const settings = partial.settings ?? { bell: true, answerHistory: false };
  const terminal = createTerminalSession({
    session,
    tabId: 1,
    clock: h.time.clock,
    scheduler: h.time.scheduler,
    bellVibrationEnabled: () => settings.bell,
  });
  const events = partial.events ?? [];
  terminal.onEvent((event) => events.push(event));
  const r: Rig = {
    h,
    session,
    host: partial.host,
    terminal,
    events,
    settings,
    acks: partial.acks ?? [],
    pushDiff(paneId, over = {}) {
      const seq = (lastSeq.get(paneId) ?? -1) + 1;
      lastSeq.set(paneId, seq);
      r.host.broadcast(diff(paneId, seq, over));
    },
  };
  partial.terminal = terminal;
  if (options.open !== false) {
    terminal.open();
  }
  return r;
}

function received(r: Rig, type: Message["type"]): Message[] {
  return r.host.received.filter((message) => message.type === type);
}

describe("terminal session: subscription", () => {
  it("subscribes the focused pane of the tab on open, with the fake host", () => {
    const h = createHarness();
    const session = createSessionStore({
      desktop: h.desktop,
      device: h.device,
      appVersion: "0.0.1",
      openSocket: h.network.openSocket,
      clock: h.time.clock,
      scheduler: h.time.scheduler,
    });
    session.start();
    h.network.last().open();
    const terminal = createTerminalSession({
      session,
      tabId: 1,
      clock: h.time.clock,
      scheduler: h.time.scheduler,
      bellVibrationEnabled: () => true,
    });
    expect(terminal.getState().status).toBe("idle");
    terminal.open();

    const fromApp = h.host.received.map((entry) => entry.message);
    expect(fromApp).toContainEqual({ type: "subscribe", pane: 1 });
    expect(fromApp).toContainEqual({ type: "grid-ack", pane: 1, seq: 0 });
    const state = terminal.getState();
    expect(state).toMatchObject({
      paneId: 1,
      focusedPaneId: 1,
      status: "live",
      stale: false,
      cols: 80,
      rows: 24,
      alt: false,
      paneState: PaneState.running,
      canType: true,
      tabGone: null,
    });
    expect(state.cursor).toMatchObject({ row: 0, col: 2 });
    expect(terminal.grid()?.hasState).toBe(true);
    expect(terminal.scrollback()).not.toBeNull();
  });

  it("lists the panes of the tab and keeps the desktop's focus apart from the pane on screen", () => {
    const r = rig();
    const state = r.terminal.getState();
    expect(state.panes.map((p) => p.pane)).toEqual([100, 101]);
    expect(state.layout).not.toBeNull();
    expect(state.paneId).toBe(100);
    expect(state.focusedPaneId).toBe(100);
    expect(received(r, "subscribe")).toEqual([{ type: "subscribe", pane: 100 }]);
  });

  it("acks each grid message only after it was applied, and bumps the version", () => {
    const r = rig();
    const before = r.terminal.getState().version;
    r.pushDiff(100);
    r.pushDiff(100);
    expect(r.acks).toEqual([
      { seq: 0, applied: true },
      { seq: 1, applied: true },
      { seq: 2, applied: true },
    ]);
    expect(r.terminal.getState().version).toBe(before + 2);
    expect(r.terminal.grid()?.lineAt(1)?.spans).toHaveLength(1);
  });

  it("aborts the session on a seq gap, sends one error and does not subscribe again", () => {
    const r = rig();
    r.host.broadcast(diff(100, 5));
    expect(r.events).toContainEqual({ type: "protocol-fault", fault: "grid-seq" });
    expect(r.session.getState().connection).toMatchObject({
      state: "failed",
      end: { reason: "protocol" },
    });
    expect(received(r, "error")).toEqual([{ type: "error", code: ErrorCode.protocol }]);
    r.h.time.advance(60_000);
    expect(received(r, "subscribe")).toHaveLength(1);
    expect(r.terminal.getState()).toMatchObject({ status: "disconnected", canType: false });
  });

  it("cancels the old subscription when another pane is chosen", () => {
    const r = rig();
    r.terminal.tapModifier("ctrl");
    expect(r.terminal.selectPane(101)).toBe(true);
    const flow = r.host.received
      .filter((m) => m.type === "subscribe" || m.type === "unsubscribe")
      .map((m) => m.type + ":" + String((m as { pane: number }).pane));
    expect(flow).toEqual(["subscribe:100", "unsubscribe:100", "subscribe:101"]);
    expect(r.terminal.getState()).toMatchObject({ paneId: 101, focusedPaneId: 100, status: "live" });
    // A pane change drops the armed modifiers.
    expect(r.terminal.getState().modifiers.ctrl).toBe("off");
    expect(r.terminal.selectPane(999)).toBe(false);
  });

  it("marks the pane unavailable when the host ends the subscription", () => {
    const r = rig();
    r.host.broadcast({ type: "subscription-ended", pane: 100, reason: SubscriptionEndReason.hostLimit });
    expect(r.terminal.getState()).toMatchObject({
      status: "unavailable",
      unavailable: { kind: "ended", reason: SubscriptionEndReason.hostLimit },
      stale: true,
      canType: false,
    });
    // The user can try again.
    expect(r.terminal.selectPane(100)).toBe(true);
    expect(r.terminal.getState().status).toBe("live");
  });

  it("sends unsubscribe on close and lets go of everything", () => {
    const r = rig();
    r.terminal.close();
    expect(received(r, "unsubscribe")).toEqual([{ type: "unsubscribe", pane: 100 }]);
    expect(r.terminal.getState()).toMatchObject({ status: "idle", canType: false });
    r.host.broadcast({ type: "bell", pane: 100 });
    r.host.broadcast(workspace([win(1, [tab(2)])], 2));
    expect(r.events).toEqual([]);
    expect(r.terminal.typeText("x")).toBe(false);
    expect(received(r, "text-input")).toEqual([]);
  });
});

describe("terminal session: input", () => {
  it("sends typed text, and a single character with Ctrl armed as a key", () => {
    const r = rig();
    expect(r.terminal.typeText("ls")).toBe(true);
    r.terminal.tapModifier("ctrl");
    expect(r.terminal.getState().modifiers.ctrl).toBe("once");
    expect(r.terminal.typeText("c")).toBe(true);
    expect(received(r, "text-input")).toEqual([{ type: "text-input", pane: 100, text: "ls" }]);
    expect(received(r, "key")).toEqual([{ type: "key", pane: 100, key: "c", mods: 0x01 }]);
    expect(r.terminal.getState().modifiers.ctrl).toBe("off");
  });

  it("arms Shift from the bar: Shift+Tab goes with the bit and the armed Shift drops", () => {
    const r = rig();
    expect(r.terminal.pressKey("shift")).toBe(true);
    expect(r.terminal.getState().modifiers.shift).toBe("once");
    expect(r.terminal.pressKey("tab")).toBe(true);
    expect(received(r, "key")).toEqual([{ type: "key", pane: 100, key: NamedKey.tab, mods: 0x04 }]);
    expect(r.terminal.getState().modifiers.shift).toBe("off");
  });

  it("sends the key bar buttons with the locked modifiers; Ctrl and Alt only arm", () => {
    const r = rig();
    expect(r.terminal.pressKey("alt")).toBe(true);
    expect(r.terminal.pressKey("alt")).toBe(true);
    expect(r.terminal.getState().modifiers.alt).toBe("locked");
    expect(r.terminal.pressKey("esc")).toBe(true);
    expect(r.terminal.pressNamedKey(NamedKey.backspace)).toBe(true);
    expect(received(r, "key")).toEqual([
      { type: "key", pane: 100, key: NamedKey.escape, mods: 0 },
      { type: "key", pane: 100, key: NamedKey.backspace, mods: 0x02 },
    ]);
    expect(r.terminal.getState().modifiers.alt).toBe("locked");
  });

  it("sends Esc plain and keeps an armed modifier for the next key (anatomy §4.8)", () => {
    const r = rig();
    r.terminal.tapModifier("ctrl");
    expect(r.terminal.pressKey("esc")).toBe(true);
    expect(r.terminal.getState().modifiers.ctrl).toBe("once");
    r.terminal.typeText("c");
    expect(received(r, "key")).toEqual([
      { type: "key", pane: 100, key: NamedKey.escape, mods: 0 },
      { type: "key", pane: 100, key: "c", mods: 0x01 },
    ]);
    expect(r.terminal.getState().modifiers.ctrl).toBe("off");
  });

  it("asks before pasting more than one line and sends only after the confirmation", () => {
    const r = rig();
    const result = r.terminal.pasteRequest("ls\npwd\n");
    expect(result).toMatchObject({ needsConfirmation: true, analysis: { totalLines: 2 } });
    expect(r.terminal.getState().paste).toMatchObject({ previewLines: ["ls", "pwd"] });
    expect(received(r, "paste")).toEqual([]);

    expect(r.terminal.pasteConfirm()).toBe(true);
    expect(received(r, "paste")).toEqual([{ type: "paste", pane: 100, text: "ls\npwd\n" }]);
    expect(r.terminal.getState().paste).toBeNull();
    expect(r.terminal.pasteConfirm()).toBe(false);

    r.terminal.pasteRequest("a\nb");
    r.terminal.pasteCancel();
    expect(r.terminal.getState().paste).toBeNull();
    expect(r.terminal.pasteConfirm()).toBe(false);
    expect(received(r, "paste")).toHaveLength(1);
  });

  it("pastes a single line right away", () => {
    const r = rig();
    expect(r.terminal.pasteRequest("echo hi")).toEqual({ needsConfirmation: false, sent: true });
    expect(received(r, "paste")).toEqual([{ type: "paste", pane: 100, text: "echo hi" }]);
  });

  it("refuses a paste over 1 MiB, empty text and a lone surrogate before the wire", () => {
    const r = rig();
    expect(r.terminal.pasteRequest("a".repeat(MAX_INPUT_TEXT_BYTES + 1))).toEqual({
      needsConfirmation: false,
      sent: false,
    });
    expect(r.terminal.typeText("")).toBe(false);
    expect(r.terminal.typeText("\ud800")).toBe(false);
    expect(r.events).toEqual([
      { type: "input-refused", code: "too-large" },
      { type: "input-refused", code: "empty" },
      { type: "input-refused", code: "invalid-text" },
    ]);
    expect(received(r, "paste")).toEqual([]);
    expect(received(r, "text-input")).toEqual([]);
  });

  it("refuses input to a pane that is not running", () => {
    const r = rig();
    r.host.broadcast(tree(2, { state: PaneState.exited }));
    expect(r.terminal.getState()).toMatchObject({ paneState: PaneState.exited, canType: false });
    expect(r.terminal.typeText("x")).toBe(false);
    expect(r.events).toEqual([{ type: "input-refused", code: "not-running" }]);
    expect(received(r, "text-input")).toEqual([]);
  });

  it("sends start-pane for the pane on screen", () => {
    const r = rig();
    const result = r.terminal.startPane();
    expect(result.ok).toBe(true);
    expect(received(r, "action")).toEqual([
      { type: "action", id: expect.any(Number), do: { type: "start-pane", pane: 100 } },
    ]);
  });
});

describe("terminal session: bell", () => {
  it("rings with vibration when the setting is on, without it when off", () => {
    const r = rig();
    r.host.broadcast({ type: "bell", pane: 100 });
    r.settings.bell = false;
    r.host.broadcast({ type: "bell", pane: 100 });
    expect(r.events).toEqual([
      { type: "bell", pane: 100, vibrate: true },
      { type: "bell", pane: 100, vibrate: false },
    ]);
  });

  it("ignores the bell of another pane", () => {
    const r = rig();
    r.host.broadcast({ type: "bell", pane: 101 });
    expect(r.events).toEqual([]);
  });
});

describe("terminal session: history", () => {
  it("asks for history pages and tracks them until they land", () => {
    const r = rig();
    r.settings.answerHistory = true;
    const before = r.terminal.getState();
    expect(before.history).toMatchObject({ lines: 30, total: 30, loadingPages: 0, reachedOldest: false });
    expect(r.terminal.requestHistory(29, 10)).toBe(true);
    expect(received(r, "scrollback-request")).toEqual([
      { type: "scrollback-request", id: expect.any(Number), pane: 100, offset: 20, count: 10 },
    ]);
    const after = r.terminal.getState();
    expect(after.history).toMatchObject({ loadingPages: 0, reachedOldest: true });
    expect(after.version).toBeGreaterThan(before.version);
    expect(r.terminal.scrollback()?.lineAt(29)).toBeDefined();
  });

  it("stops showing a request as loading once it timed out", () => {
    const r = rig();
    expect(r.terminal.requestHistory(29, 10)).toBe(true);
    expect(r.terminal.getState().history.loadingPages).toBe(1);
    r.h.time.advance(10_000);
    expect(r.terminal.getState().history.loadingPages).toBe(0);
  });

  it("reports how far the history grew so the text being read stays put", () => {
    const r = rig();
    const first = r.terminal.getState().history;
    r.pushDiff(100, { history: 33 });
    const second = r.terminal.getState().history;
    expect(historyGrowth(first, second)).toBe(3);
    // With the history full, `dropped` grows instead of `history`.
    r.pushDiff(100, { history: 33, dropped: 2 });
    expect(historyGrowth(second, r.terminal.getState().history)).toBe(2);
    // A new snapshot starts the offsets over.
    r.terminal.selectPane(101);
    r.terminal.selectPane(100);
    expect(historyGrowth(second, r.terminal.getState().history)).toBe(0);
  });
});

describe("terminal session: the tree and the connection", () => {
  it("follows the focused pane when the pane on screen disappears", () => {
    const r = rig();
    r.terminal.selectPane(101);
    r.host.broadcast(tree(2, { second: 102 }));
    expect(r.terminal.getState().paneId).toBe(100);
    expect(received(r, "subscribe").slice(-1)).toEqual([{ type: "subscribe", pane: 100 }]);
  });

  it("says the tab is gone when it leaves the tree", () => {
    const r = rig();
    r.host.broadcast(workspace([win(1, [tab(2)], { active: 2 })], 2));
    expect(r.events).toEqual([{ type: "tab-gone", reason: "closed" }]);
    expect(r.terminal.getState()).toMatchObject({ tabGone: "closed", canType: false });
  });

  it("subscribes again after a reconnection to the same desktop instance", () => {
    const r = rig();
    r.h.network.last().drop();
    expect(r.session.getState().connection.state).toBe("reconnecting");
    // The last grid stays on screen, marked stale.
    expect(r.terminal.getState()).toMatchObject({ status: "disconnected", stale: true, canType: false });
    expect(r.terminal.grid()?.hasState).toBe(true);

    r.h.time.advance(1000);
    r.h.network.last().open();
    expect(r.session.getState().connection.state).toBe("ready");
    expect(received(r, "subscribe")).toEqual([
      { type: "subscribe", pane: 100 },
      { type: "subscribe", pane: 100 },
    ]);
    expect(r.terminal.getState()).toMatchObject({
      status: "live",
      stale: false,
      canType: true,
      tabGone: null,
    });
    expect(r.events).toEqual([]);
  });

  it("says the tab is gone when the desktop restarted", () => {
    const r = rig();
    r.host.detach();
    expect(r.terminal.getState().status).toBe("disconnected");
    const lastSeq = new Map<number, number>();
    const restarted = gridHost({}, r.h, 2, lastSeq);
    r.h.time.advance(1000);
    r.h.network.last().open();
    expect(r.session.getState().connection.state).toBe("ready");
    expect(r.events).toEqual([{ type: "tab-gone", reason: "restarted" }]);
    expect(r.terminal.getState()).toMatchObject({ tabGone: "restarted", canType: false });
    expect(restarted.received.filter((m) => m.type === "subscribe")).toEqual([]);
  });

  it("waits for the session to be ready before subscribing", () => {
    const h = createHarness();
    const lastSeq = new Map<number, number>();
    const host = gridHost({}, h, 1, lastSeq);
    const session = createSessionStore({
      desktop: h.desktop,
      device: h.device,
      appVersion: "0.0.1",
      openSocket: h.network.openSocket,
      clock: h.time.clock,
      scheduler: h.time.scheduler,
    });
    const terminal = createTerminalSession({
      session,
      tabId: 1,
      clock: h.time.clock,
      scheduler: h.time.scheduler,
      bellVibrationEnabled: () => true,
    });
    terminal.open();
    expect(terminal.getState().status).toBe("disconnected");
    session.start();
    h.network.last().open();
    expect(host.received.filter((m) => m.type === "subscribe")).toEqual([
      { type: "subscribe", pane: 100 },
    ]);
    expect(terminal.getState()).toMatchObject({ status: "live", paneId: 100 });
  });
});

describe("terminal session: activate-tab", () => {
  const ACTIVATE = { type: "action", id: expect.any(Number), do: { type: "activate-tab", tab: 1 } };

  it("makes the tab the active one on the desktop when it opens with the session ready", () => {
    const r = rig({ active: 2 });
    expect(received(r, "action")).toEqual([ACTIVATE]);
    // A background action: nothing on the tree shows it as pending.
    expect(r.session.getState().requests.pending.size).toBe(1);
    expect([...r.session.getState().requests.pending.values()][0]?.targets).toEqual([]);
    expect(r.events).toEqual([]);
  });

  it("sends nothing when the tab already is the active one of its window", () => {
    const r = rig();
    expect(received(r, "action")).toEqual([]);
  });

  it("waits for ready when the screen opened during a reconnection", () => {
    const r = rig({ active: 2, open: false });
    r.h.network.last().drop();
    expect(r.session.getState().connection.state).toBe("reconnecting");
    r.terminal.open();
    r.h.time.advance(1000);
    expect(received(r, "action")).toEqual([]);
    r.h.network.last().open();
    expect(r.session.getState().connection.state).toBe("ready");
    expect(received(r, "action")).toEqual([ACTIVATE]);
  });

  it("does not send it again on a reconnection, a new tree or another pane", () => {
    const r = rig({ active: 2 });
    r.h.network.last().drop();
    r.h.time.advance(1000);
    r.h.network.last().open();
    expect(r.session.getState().connection.state).toBe("ready");
    r.host.broadcast(tree(2, { active: 2 }));
    expect(r.terminal.selectPane(101)).toBe(true);
    expect(received(r, "action")).toEqual([ACTIVATE]);
  });

  it("does not send it once the tab is gone", () => {
    const r = rig({ active: 2, open: false });
    r.host.detach();
    expect(r.session.getState().connection.state).toBe("reconnecting");
    r.terminal.open();
    const restarted = gridHost({}, r.h, 2, new Map(), 2);
    r.h.time.advance(1000);
    r.h.network.last().open();
    expect(r.session.getState().connection.state).toBe("ready");
    expect(r.events).toEqual([{ type: "tab-gone", reason: "restarted" }]);
    expect(restarted.received.filter((m) => m.type === "action")).toEqual([]);
    expect(received(r, "action")).toEqual([]);
  });

  it("shows nothing when the desktop refuses it", () => {
    const r = rig({ active: 2 });
    const sessionEvents: SessionEvent[] = [];
    r.session.onEvent((event) => sessionEvents.push(event));
    const [sent] = received(r, "action");
    expect(sent?.type).toBe("action");
    if (sent?.type !== "action") {
      return;
    }
    r.host.broadcast({ type: "action-result", id: sent.id, error: ErrorCode.unsupported });
    expect(r.events).toEqual([]);
    expect(sessionEvents).toEqual([
      expect.objectContaining({
        type: "action-outcome",
        outcome: expect.objectContaining({
          status: "failed",
          failure: expect.objectContaining({ code: ErrorCode.unsupported, silent: true }),
        }),
      }),
    ]);
    expect(r.session.getState().requests.pending.size).toBe(0);
  });
});
