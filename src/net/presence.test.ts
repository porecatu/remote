// SPDX-License-Identifier: GPL-3.0-or-later
import {
  type FetchLike,
  PRESENCE_INTERVAL_MS,
  PresenceScheduler,
  nextPollDelay,
  presenceUrl,
  queryAllPresence,
  queryPresence,
} from "./presence";

const HOST = "abcdefghijklmnopqrstuvwxyz234567";

function fetchStatus(status: number): jest.MockedFunction<FetchLike> {
  return jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(async () => ({ status }));
}

describe("presenceUrl", () => {
  it("derives the https URL from the relay base", () => {
    expect(presenceUrl("wss://relay.example.com", HOST)).toBe(
      `https://relay.example.com/v0/presence/${HOST}`,
    );
  });

  it("keeps the path prefix and drops trailing slashes, query and fragment", () => {
    expect(presenceUrl("wss://example.com.br/relay/", HOST)).toBe(
      `https://example.com.br/relay/v0/presence/${HOST}`,
    );
    expect(presenceUrl("wss://example.com:8443/a/b?x=1#y", HOST)).toBe(
      `https://example.com:8443/a/b/v0/presence/${HOST}`,
    );
  });

  it("allows ws:// only to loopback", () => {
    expect(presenceUrl("ws://localhost:8080", HOST)).toBe(
      `http://localhost:8080/v0/presence/${HOST}`,
    );
    expect(presenceUrl("ws://127.0.0.1:8080", HOST)).toBe(
      `http://127.0.0.1:8080/v0/presence/${HOST}`,
    );
    expect(presenceUrl("ws://[::1]:8080", HOST)).toBe(`http://[::1]:8080/v0/presence/${HOST}`);
    expect(presenceUrl("ws://relay.example.com", HOST)).toBeNull();
    expect(presenceUrl("ws://localhost.evil.com", HOST)).toBeNull();
  });

  it("refuses other schemes, credentials and malformed host ids", () => {
    expect(presenceUrl("https://relay.example.com", HOST)).toBeNull();
    expect(presenceUrl("wss://user:pw@relay.example.com", HOST)).toBeNull();
    expect(presenceUrl("relay.example.com", HOST)).toBeNull();
    expect(presenceUrl("wss://relay.example.com", "short")).toBeNull();
    expect(presenceUrl("wss://relay.example.com", `${HOST.slice(0, 31)}1`)).toBeNull();
  });
});

describe("queryPresence", () => {
  it("maps 204 to online, 404 to offline, 429 and others to unknown", async () => {
    expect(await queryPresence(fetchStatus(204), "wss://r.example.com", HOST)).toBe("online");
    expect(await queryPresence(fetchStatus(404), "wss://r.example.com", HOST)).toBe("offline");
    expect(await queryPresence(fetchStatus(429), "wss://r.example.com", HOST)).toBe("unknown");
    expect(await queryPresence(fetchStatus(500), "wss://r.example.com", HOST)).toBe("unknown");
    expect(await queryPresence(fetchStatus(200), "wss://r.example.com", HOST)).toBe("unknown");
  });

  it("maps a network error to unknown", async () => {
    const failing: FetchLike = async () => {
      throw new TypeError("Network request failed");
    };
    expect(await queryPresence(failing, "wss://r.example.com", HOST)).toBe("unknown");
  });

  it("sends a GET to the derived URL", async () => {
    const fetchFn = fetchStatus(204);
    await queryPresence(fetchFn, "wss://r.example.com", HOST);
    expect(fetchFn).toHaveBeenCalledWith(`https://r.example.com/v0/presence/${HOST}`, {
      method: "GET",
    });
  });

  it("passes the abort signal along", async () => {
    const fetchFn = fetchStatus(204);
    const controller = new AbortController();
    await queryPresence(fetchFn, "wss://r.example.com", HOST, controller.signal);
    expect(fetchFn.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it("never calls fetch for an unacceptable URL", async () => {
    const fetchFn = fetchStatus(204);
    expect(await queryPresence(fetchFn, "ws://r.example.com", HOST)).toBe("unknown");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("queryAllPresence", () => {
  it("answers per desktop and isolates failures", async () => {
    const other = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const fetchFn: FetchLike = async (url) => {
      if (url.includes(other)) {
        throw new Error("boom");
      }
      return { status: 204 };
    };
    const result = await queryAllPresence(fetchFn, [
      { id: "a", relayUrl: "wss://r.example.com", hostId: HOST },
      { id: "b", relayUrl: "wss://r.example.com", hostId: other },
    ]);
    expect(result.get("a")).toBe("online");
    expect(result.get("b")).toBe("unknown");
  });
});

describe("nextPollDelay", () => {
  it("is null while the list is hidden", () => {
    expect(nextPollDelay(false, null, 0)).toBeNull();
    expect(nextPollDelay(false, 0, 100)).toBeNull();
  });

  it("is zero when nothing was polled yet, then counts down 30 s", () => {
    expect(nextPollDelay(true, null, 5)).toBe(0);
    expect(nextPollDelay(true, 1000, 1000)).toBe(PRESENCE_INTERVAL_MS);
    expect(nextPollDelay(true, 1000, 21_000)).toBe(10_000);
    expect(nextPollDelay(true, 1000, 99_000)).toBe(0);
  });
});

describe("PresenceScheduler", () => {
  interface Timer {
    id: number;
    dueAt: number;
    callback: () => void;
  }

  function setup() {
    let clock = 0;
    let nextId = 1;
    let timers: Timer[] = [];
    const polls: number[] = [];
    let release: (() => void) | null = null;
    let hold = false;
    const scheduler = new PresenceScheduler({
      now: () => clock,
      poll: () => {
        polls.push(clock);
        if (hold) {
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return Promise.resolve();
      },
      setTimer: (callback, ms) => {
        const timer = { id: nextId, dueAt: clock + ms, callback };
        nextId += 1;
        timers.push(timer);
        return timer.id;
      },
      clearTimer: (handle) => {
        timers = timers.filter((t) => t.id !== handle);
      },
    });
    const advance = async (ms: number): Promise<void> => {
      const target = clock + ms;
      for (;;) {
        const due = timers
          .filter((t) => t.dueAt <= target)
          .sort((a, b) => a.dueAt - b.dueAt)[0];
        if (due === undefined) {
          break;
        }
        timers = timers.filter((t) => t.id !== due.id);
        clock = due.dueAt;
        due.callback();
        await flush();
      }
      clock = target;
    };
    return {
      scheduler,
      polls,
      advance,
      pending: () => timers.length,
      holdNextPolls: (value: boolean) => {
        hold = value;
      },
      releasePoll: async () => {
        release?.();
        release = null;
        await flush();
      },
    };
  }

  async function flush(): Promise<void> {
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
  }

  it("polls on show and then every 30 s while visible", async () => {
    const t = setup();
    t.scheduler.show();
    await t.advance(0);
    expect(t.polls).toEqual([0]);
    await t.advance(30_000);
    await t.advance(30_000);
    expect(t.polls).toEqual([0, 30_000, 60_000]);
  });

  it("does not poll, and keeps no timer, while hidden", async () => {
    const t = setup();
    await t.advance(120_000);
    expect(t.polls).toEqual([]);
    t.scheduler.show();
    await t.advance(0);
    t.scheduler.hide();
    expect(t.pending()).toBe(0);
    await t.advance(120_000);
    expect(t.polls).toEqual([120_000]);
  });

  it("polls again right away when shown again", async () => {
    const t = setup();
    t.scheduler.show();
    await t.advance(0);
    t.scheduler.hide();
    await t.advance(10_000);
    t.scheduler.show();
    await t.advance(0);
    expect(t.polls).toEqual([0, 10_000]);
  });

  it("refreshes on demand and restarts the 30 s count", async () => {
    const t = setup();
    t.scheduler.show();
    await t.advance(0);
    await t.advance(20_000);
    await t.scheduler.refresh();
    expect(t.polls).toEqual([0, 20_000]);
    await t.advance(29_999);
    expect(t.polls).toEqual([0, 20_000]);
    await t.advance(1);
    expect(t.polls).toEqual([0, 20_000, 50_000]);
  });

  it("ignores refresh while hidden", async () => {
    const t = setup();
    await t.scheduler.refresh();
    expect(t.polls).toEqual([]);
  });

  it("does not overlap rounds: a refresh joins the one in flight", async () => {
    const t = setup();
    t.holdNextPolls(true);
    t.scheduler.show();
    await t.advance(0);
    const joined = t.scheduler.refresh();
    expect(t.polls).toEqual([0]);
    t.holdNextPolls(false);
    await t.releasePoll();
    await joined;
    expect(t.polls).toEqual([0]);
  });

  it("does not rearm when the list was hidden during a round", async () => {
    const t = setup();
    t.holdNextPolls(true);
    t.scheduler.show();
    await t.advance(0);
    t.scheduler.hide();
    await t.releasePoll();
    expect(t.pending()).toBe(0);
  });
});
