// SPDX-License-Identifier: GPL-3.0-or-later

import { ErrorCode, type Message, type NamedSession, SessionsMode } from "@/protocol";
import { type SessionStore, createSessionStore } from "@/session/sessionStore";
import { type Harness, type ScriptedHost, createHarness, greetingHost } from "@/session/testing";
import { tab, win, workspace } from "@/workspace/testing";
import { type SavedSessions, createSavedSessions } from "./savedSessions";

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

const LIST: readonly NamedSession[] = [
  { session: 1, name: "api + front", readable: true },
  { session: 2, name: "infra", readable: true },
  { session: 3, name: "backup antigo", readable: false },
];

type ListRequest = Extract<Message, { type: "list-sessions" }>;

interface Rig {
  readonly h: Harness;
  readonly session: SessionStore;
  readonly host: ScriptedHost;
  readonly controller: SavedSessions;
  /** When true the host answers each `list-sessions` at once with `LIST`. */
  readonly settings: { answer: boolean };
}

function rig(options: { ready?: boolean } = {}): Rig {
  const h = createHarness();
  const settings = { answer: false };
  const host = greetingHost(
    h,
    1,
    workspace([win(1, [tab(1)], { active: 1 }), win(2, [tab(2)], { active: 2 })]),
    (message: Message, send) => {
      if (message.type === "list-sessions" && settings.answer) {
        send({ type: "sessions", id: message.id, mode: SessionsMode.newWindow, list: LIST });
      }
    },
  );
  const session = createSessionStore({
    desktop: h.desktop,
    device: h.device,
    appVersion: "0.0.1",
    openSocket: h.network.openSocket,
    clock: h.time.clock,
    scheduler: h.time.scheduler,
  });
  if (options.ready !== false) {
    session.start();
    h.network.last().open();
  }
  const controller = createSavedSessions({ session, scheduler: h.time.scheduler });
  return { h, session, host, controller, settings };
}

function listRequests(r: Rig): ListRequest[] {
  return r.host.received.filter((message): message is ListRequest => message.type === "list-sessions");
}

function answer(r: Rig, id: number, list: readonly NamedSession[] = LIST, mode: SessionsMode = SessionsMode.newWindow): void {
  r.host.broadcast({ type: "sessions", id, mode, list });
}

describe("saved sessions controller: load", () => {
  it("starts in loading and sends nothing until load()", () => {
    const r = rig();
    expect(r.controller.getState()).toEqual({ status: "loading" });
    expect(listRequests(r)).toEqual([]);
  });

  it("sends list-sessions with a request id and waits in loading", () => {
    const r = rig();
    expect(r.controller.load()).toBe(true);
    expect(listRequests(r)).toHaveLength(1);
    expect(r.controller.getState()).toEqual({ status: "loading" });
  });

  it("takes the sessions answer with the same id: mode and list, in the desktop's order", () => {
    const r = rig();
    r.controller.load();
    const [request] = listRequests(r);
    answer(r, request!.id, LIST, SessionsMode.append);
    expect(r.controller.getState()).toEqual({ status: "loaded", mode: SessionsMode.append, list: LIST });
  });

  it("is loaded when the host answers in the same turn, and a second answer changes nothing", () => {
    const r = rig();
    r.settings.answer = true;
    r.controller.load();
    expect(r.controller.getState()).toMatchObject({ status: "loaded", mode: SessionsMode.newWindow });
    answer(r, 999, []);
    expect(r.controller.getState()).toMatchObject({ status: "loaded", list: LIST });
  });

  it("an empty list is a loaded one", () => {
    const r = rig();
    r.controller.load();
    answer(r, listRequests(r)[0]!.id, []);
    expect(r.controller.getState()).toEqual({ status: "loaded", mode: SessionsMode.newWindow, list: [] });
  });

  it("ignores a sessions answer with another id", () => {
    const r = rig();
    r.controller.load();
    const [request] = listRequests(r);
    answer(r, request!.id + 1);
    expect(r.controller.getState()).toEqual({ status: "loading" });
    answer(r, request!.id);
    expect(r.controller.getState()).toMatchObject({ status: "loaded" });
  });

  it("ignores a sessions answer nobody asked for", () => {
    const r = rig();
    answer(r, 1);
    expect(r.controller.getState()).toEqual({ status: "loading" });
  });

  it("fails with no answer in 10 s, and a late answer then changes nothing", () => {
    const r = rig();
    r.controller.load();
    const [request] = listRequests(r);
    r.h.time.advance(9_999);
    expect(r.controller.getState()).toEqual({ status: "loading" });
    r.h.time.advance(1);
    expect(r.controller.getState()).toEqual({ status: "failed" });
    answer(r, request!.id);
    expect(r.controller.getState()).toEqual({ status: "failed" });
  });

  it("an answer in time cancels the deadline", () => {
    const r = rig();
    const before = r.h.time.pending();
    r.controller.load();
    answer(r, listRequests(r)[0]!.id);
    expect(r.h.time.pending()).toBe(before);
    r.h.time.advance(60_000);
    expect(r.controller.getState()).toMatchObject({ status: "loaded" });
  });

  it("load() again after a failure is the try-again: new id, loading, then the new answer", () => {
    const r = rig();
    r.controller.load();
    r.h.time.advance(10_000);
    expect(r.controller.getState()).toEqual({ status: "failed" });
    expect(r.controller.load()).toBe(true);
    expect(r.controller.getState()).toEqual({ status: "loading" });
    const [first, second] = listRequests(r);
    expect(second!.id).not.toBe(first!.id);
    answer(r, first!.id);
    expect(r.controller.getState()).toEqual({ status: "loading" });
    answer(r, second!.id);
    expect(r.controller.getState()).toMatchObject({ status: "loaded" });
  });

  it("load() over a loaded list drops it before asking, and restarts the deadline", () => {
    const r = rig();
    r.settings.answer = true;
    r.controller.load();
    expect(r.controller.getState()).toMatchObject({ status: "loaded" });
    r.settings.answer = false;
    r.controller.load();
    expect(r.controller.getState()).toEqual({ status: "loading" });
    r.h.time.advance(10_000);
    expect(r.controller.getState()).toEqual({ status: "failed" });
  });

  it("fails at once when the session is not ready, sending nothing", () => {
    const r = rig({ ready: false });
    expect(r.controller.load()).toBe(false);
    expect(r.controller.getState()).toEqual({ status: "failed" });
    expect(r.h.time.pending()).toBe(0);
  });

  it("fails when the session leaves ready with the request in flight", () => {
    const r = rig();
    r.controller.load();
    const [request] = listRequests(r);
    r.h.network.last().drop();
    expect(r.controller.getState()).toEqual({ status: "failed" });
    answer(r, request!.id);
    expect(r.controller.getState()).toEqual({ status: "failed" });
  });

  it("keeps a loaded list when the session drops with nothing in flight", () => {
    const r = rig();
    r.settings.answer = true;
    r.controller.load();
    r.h.network.last().drop();
    expect(r.controller.getState()).toMatchObject({ status: "loaded" });
  });
});

describe("saved sessions controller: restore", () => {
  function actionsSent(r: Rig): Message[] {
    return r.host.received.filter((message) => message.type === "action");
  }

  it("sends restore-session without a window and returns the id the store tracks", () => {
    const r = rig();
    const result = r.controller.restore(2);
    if (!result.ok) {
      throw new Error("restore was refused");
    }
    expect(actionsSent(r)).toEqual([{ type: "action", id: result.id, do: { type: "restore-session", session: 2 } }]);
    expect(r.session.getState().requests.pending.has(result.id)).toBe(true);
  });

  it("sends restore-session with the window and marks that window as pending", () => {
    const r = rig();
    const result = r.controller.restore(2, 2);
    if (!result.ok) {
      throw new Error("restore was refused");
    }
    expect(actionsSent(r)).toEqual([
      { type: "action", id: result.id, do: { type: "restore-session", session: 2, window: 2 } },
    ]);
    // The window is busy until the action-result: another action on it is refused.
    expect(r.controller.restore(3, 2)).toEqual({ ok: false, reason: "busy" });
    // A new window marks nothing.
    expect(r.controller.restore(3).ok).toBe(true);
  });

  it("follows the action-result in the store, including the saved-session errors", () => {
    const r = rig();
    const events: unknown[] = [];
    r.session.onEvent((event) => events.push(event));
    const result = r.controller.restore(3);
    if (!result.ok) {
      throw new Error("restore was refused");
    }
    r.host.broadcast({ type: "action-result", id: result.id, error: ErrorCode.sessionUnreadable });
    expect(r.session.getState().requests.pending.size).toBe(0);
    expect(events).toContainEqual({
      type: "action-outcome",
      outcome: expect.objectContaining({
        status: "failed",
        failure: { code: ErrorCode.sessionUnreadable, silent: false, staleTree: false },
      }),
    });
  });

  it("refuses with not-ready when the session is not up", () => {
    const r = rig({ ready: false });
    expect(r.controller.restore(1)).toEqual({ ok: false, reason: "not-ready" });
  });
});

describe("saved sessions controller: dispose", () => {
  it("cancels the deadline and the subscription", () => {
    const r = rig();
    const before = r.h.time.pending();
    r.controller.load();
    expect(r.h.time.pending()).toBe(before + 1);
    const [request] = listRequests(r);
    r.controller.dispose();
    expect(r.h.time.pending()).toBe(before);
    answer(r, request!.id);
    expect(r.controller.getState()).toEqual({ status: "failed" });
  });

  it("drops a loaded list and refuses a new load()", () => {
    const r = rig();
    r.settings.answer = true;
    r.controller.load();
    r.controller.dispose();
    expect(JSON.stringify(r.controller.getState())).not.toContain("infra");
    expect(r.controller.load()).toBe(false);
    expect(listRequests(r)).toHaveLength(1);
    r.controller.dispose();
  });
});
