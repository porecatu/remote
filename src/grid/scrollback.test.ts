// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type Line,
  type ScrollbackPage,
  type ScrollbackRequest,
  type Style,
  decodeMessage,
  encodeMessage,
} from "../protocol";
import {
  MAX_IN_FLIGHT,
  MAX_PAGE_LINES,
  REQUEST_TIMEOUT_MS,
  Scrollback,
} from "./scrollback";

const PANE = 7;

const STYLES: readonly Style[] = [[null, null, 0]];

/** A one-span line whose text is `text`. */
function line(text: string): Line {
  return [false, [[0, 1, 0, text]]];
}

function textOf(found: { line: Line } | undefined): string | undefined {
  const text = found?.line[1][0]?.[3];
  return typeof text === "string" ? text : text?.[0];
}

/** Lines "L<n>" for the offsets `high` down to `low`, top to bottom. */
function pageLines(high: number, low: number): Line[] {
  const lines: Line[] = [];
  for (let offset = high; offset >= low; offset -= 1) {
    lines.push(line(`L${String(offset)}`));
  }
  return lines;
}

function makeScrollback(maxCachedLines?: number) {
  let next = 100;
  const sb = new Scrollback({
    pane: PANE,
    nextRequestId: () => {
      next += 1;
      return next;
    },
    ...(maxCachedLines === undefined ? {} : { maxCachedLines }),
  });
  return sb;
}

function page(
  request: ScrollbackRequest,
  history: number,
  lines?: readonly Line[],
  dropped = 0,
): ScrollbackPage {
  return {
    type: "scrollback-page",
    id: request.id,
    pane: request.pane,
    history,
    dropped,
    offset: request.offset,
    styles: STYLES,
    lines: lines ?? pageLines(request.offset + request.count - 1, request.offset),
  };
}

/** A message must survive the real codec to count as valid. */
function viaCodec<T extends ScrollbackPage | ScrollbackRequest>(
  message: T,
  from: "host" | "client",
): T {
  const decoded = decodeMessage(encodeMessage(message), from);
  if (!decoded.ok) throw new Error("message rejected by the codec");
  return decoded.message as T;
}

function ready(history: number, alt = false, dropped = 0): Scrollback {
  const sb = makeScrollback();
  sb.onSnapshot({ history, dropped, alt });
  return sb;
}

function req(request: ScrollbackRequest | null): ScrollbackRequest {
  if (request === null) throw new Error("a request was expected");
  return request;
}

describe("Scrollback requests", () => {
  it("asks for the window around the viewport top, valid on the wire", () => {
    const sb = ready(100);
    const request = req(sb.requestFor(19, 20, 0));
    expect(request).toEqual({
      type: "scrollback-request",
      id: 101,
      pane: PANE,
      offset: 0,
      count: 20,
    });
    expect(viaCodec(request, "client")).toEqual(request);
  });

  it("clamps the window to the history that exists", () => {
    const sb = ready(10);
    // Window 6..25, but the history only reaches offset 9.
    const request = req(sb.requestFor(25, 20, 0));
    expect(request.offset).toBe(6);
    expect(request.count).toBe(4);
    // A window wholly above the history asks for nothing.
    expect(ready(10).requestFor(50, 30, 0)).toBeNull();
  });

  it("asks only for the part not yet cached", () => {
    const sb = ready(100);
    const first = req(sb.requestFor(9, 10, 0));
    sb.applyPage(page(first, 100));
    // Scrolling up: the window 0..19 now only misses 10..19.
    const second = req(sb.requestFor(19, 20, 1));
    expect(second.offset).toBe(10);
    expect(second.count).toBe(10);
  });

  it("returns nothing when everything is cached", () => {
    const sb = ready(100);
    const request = req(sb.requestFor(9, 10, 0));
    sb.applyPage(page(request, 100));
    expect(sb.requestFor(9, 10, 1)).toBeNull();
  });

  it("returns nothing while the same lines are in flight", () => {
    const sb = ready(100);
    req(sb.requestFor(9, 10, 0));
    expect(sb.requestFor(9, 10, 1)).toBeNull();
    expect(sb.pendingRequests).toBe(1);
  });

  it("caps one request at 500 lines, nearest the top first", () => {
    const sb = ready(5000);
    const request = req(sb.requestFor(999, 1000, 0));
    expect(request.count).toBe(MAX_PAGE_LINES);
    expect(request.offset).toBe(500);
    // The next call asks for the rest.
    const rest = req(sb.requestFor(999, 1000, 0));
    expect(rest.offset).toBe(0);
    expect(rest.count).toBe(500);
  });

  it("keeps at most MAX_IN_FLIGHT requests open", () => {
    const sb = ready(5000);
    for (let i = 0; i < MAX_IN_FLIGHT; i += 1) {
      req(sb.requestFor(4000 - i * 1000, 10, 0));
    }
    expect(sb.requestFor(100, 10, 0)).toBeNull();
  });

  it("stops waiting for a request after the timeout", () => {
    const sb = ready(100);
    req(sb.requestFor(9, 10, 1000));
    expect(sb.requestFor(9, 10, 1000 + REQUEST_TIMEOUT_MS - 1)).toBeNull();
    const again = req(sb.requestFor(9, 10, 1000 + REQUEST_TIMEOUT_MS));
    expect(again.id).toBe(102);
  });

  it("asks for nothing without history, on the alternate screen or with bad input", () => {
    expect(ready(0).requestFor(0, 10, 0)).toBeNull();
    expect(ready(100, true).requestFor(9, 10, 0)).toBeNull();
    const sb = ready(100);
    expect(sb.requestFor(-1, 10, 0)).toBeNull();
    expect(sb.requestFor(9, 0, 0)).toBeNull();
    expect(sb.requestFor(1.5, 10, 0)).toBeNull();
  });
});

describe("Scrollback pages", () => {
  it("stores the page with the last line at its offset", () => {
    const sb = ready(100);
    const request = req(sb.requestFor(4, 5, 0));
    const message = viaCodec(page(request, 100), "host");
    expect(sb.applyPage(message)).toEqual({ status: "applied", lines: 5 });
    for (let offset = 0; offset < 5; offset += 1) {
      expect(textOf(sb.lineAt(offset))).toBe(`L${String(offset)}`);
    }
    expect(sb.lineAt(5)).toBeUndefined();
    expect(sb.hasRange(0, 5)).toBe(true);
    expect(sb.hasRange(0, 6)).toBe(false);
    expect(sb.lineAt(0)?.styles).toEqual(STYLES);
  });

  it("ignores a page nobody asked for, or for another pane", () => {
    const sb = ready(100);
    const request = req(sb.requestFor(4, 5, 0));
    expect(sb.applyPage({ ...page(request, 100), id: 999 })).toEqual({
      status: "ignored",
    });
    expect(sb.applyPage({ ...page(request, 100), pane: PANE + 1 })).toEqual({
      status: "ignored",
    });
    expect(sb.cachedLines).toBe(0);
    // The request is still open.
    expect(sb.pendingRequests).toBe(1);
    expect(sb.applyPage(page(request, 100)).status).toBe("applied");
    // A duplicate of the same page is ignored.
    expect(sb.applyPage(page(request, 100)).status).toBe("ignored");
  });

  it("accepts a short page without inventing lines", () => {
    const sb = ready(100);
    const request = req(sb.requestFor(9, 10, 0));
    // The host answers with only the 3 lines nearest the screen.
    sb.applyPage(page(request, 100, pageLines(2, 0)));
    expect(sb.cachedLines).toBe(3);
    expect(textOf(sb.lineAt(2))).toBe("L2");
    expect(sb.lineAt(3)).toBeUndefined();
  });

  it("skips lines above the oldest one", () => {
    const sb = ready(3);
    const request = req(sb.requestFor(2, 3, 0));
    // Offsets 0..4 for a history of 3: lines at offsets 3 and 4 do not exist.
    const result = sb.applyPage(page(request, 3, pageLines(4, 0)));
    expect(result).toEqual({ status: "applied", lines: 3 });
    expect(textOf(sb.lineAt(2))).toBe("L2");
  });
});

describe("Scrollback history growth", () => {
  it("shifts cached lines when a diff grows the history", () => {
    const sb = ready(100);
    const request = req(sb.requestFor(4, 5, 0));
    sb.applyPage(page(request, 100));
    sb.onDiff({ history: 110, dropped: 0, alt: false });
    // old offset + 10
    expect(textOf(sb.lineAt(10))).toBe("L0");
    expect(textOf(sb.lineAt(14))).toBe("L4");
    expect(sb.lineAt(0)).toBeUndefined();
    expect(sb.lineAt(9)).toBeUndefined();
    // The ten new lines are the ones to ask for.
    const next = req(sb.requestFor(9, 10, 1));
    expect(next.offset).toBe(0);
    expect(next.count).toBe(10);
  });

  it("uses the history of the page itself when it grew in flight", () => {
    const sb = ready(100);
    const request = req(sb.requestFor(4, 5, 0));
    sb.onDiff({ history: 103, dropped: 0, alt: false });
    // By the time the host answered, 5 more lines had scrolled in.
    sb.applyPage(page(request, 105));
    expect(sb.history).toBe(105);
    expect(textOf(sb.lineAt(0))).toBe("L0");
    expect(textOf(sb.lineAt(4))).toBe("L4");
  });

  it("keeps older pages in place when a later page reports growth", () => {
    const sb = ready(100);
    const a = req(sb.requestFor(4, 5, 0));
    sb.applyPage(page(a, 100));
    const b = req(sb.requestFor(9, 10, 1));
    // b was asked for offsets 5..9, but 20 new lines arrived before the answer.
    sb.applyPage(page(b, 120));
    expect(sb.history).toBe(120);
    // a's lines moved from offsets 0..4 to 20..24; b's sit at 5..9 of the new history.
    expect(textOf(sb.lineAt(20))).toBe("L0");
    expect(textOf(sb.lineAt(24))).toBe("L4");
    expect(textOf(sb.lineAt(5))).toBe("L5");
    expect(textOf(sb.lineAt(9))).toBe("L9");
  });

  it("drops the cache when the history shrinks", () => {
    const sb = ready(100);
    const request = req(sb.requestFor(4, 5, 0));
    sb.applyPage(page(request, 100));
    sb.onDiff({ history: 0, dropped: 0, alt: false });
    expect(sb.cachedLines).toBe(0);
    expect(sb.lineAt(0)).toBeUndefined();
  });

  it("drops the cache when a page reports a smaller history", () => {
    const sb = ready(100);
    const a = req(sb.requestFor(4, 5, 0));
    sb.applyPage(page(a, 100));
    const b = req(sb.requestFor(14, 10, 1));
    sb.applyPage(page(b, 50, pageLines(9, 5)));
    expect(sb.history).toBe(50);
    // Only the new page is left.
    expect(sb.cachedLines).toBe(5);
    expect(textOf(sb.lineAt(5))).toBe("L5");
  });
});

describe("Scrollback absolute index and dropped (spec 03 §5.5)", () => {
  it("keys a line by dropped + (history - 1 - offset)", () => {
    const sb = ready(100, false, 40);
    const request = req(sb.requestFor(4, 5, 0));
    sb.applyPage(page(request, 100, undefined, 40));
    expect(sb.dropped).toBe(40);
    // offset 0 is the line right above the screen: index 40 + 99.
    expect(textOf(sb.lineAt(0))).toBe("L0");
    expect(sb.cachedLines).toBe(5);
  });

  it("keeps a line at the same place when the history is full and dropped grows", () => {
    const sb = ready(100, false, 0);
    const request = req(sb.requestFor(4, 5, 0));
    sb.applyPage(page(request, 100));
    // Full history: 3 new lines push 3 out the top; `history` stays 100.
    sb.onDiff({ history: 100, dropped: 3, alt: false });
    expect(textOf(sb.lineAt(3))).toBe("L0");
    expect(textOf(sb.lineAt(7))).toBe("L4");
    expect(sb.lineAt(0)).toBeUndefined();
    // The three new lines are the ones to ask for.
    const next = req(sb.requestFor(2, 3, 1));
    expect(next.offset).toBe(0);
    expect(next.count).toBe(3);
  });

  it("evicts the lines whose index fell below dropped", () => {
    const sb = ready(10, false, 0);
    const request = req(sb.requestFor(9, 10, 0));
    sb.applyPage(page(request, 10));
    expect(sb.cachedLines).toBe(10);
    // 4 lines left the top (the old L6..L9 are gone) and 4 new ones came in
    // at the bottom: the survivors L0..L5 now sit at offsets 4..9.
    sb.onDiff({ history: 10, dropped: 4, alt: false });
    expect(sb.cachedLines).toBe(6);
    expect(sb.lineAt(3)).toBeUndefined();
    expect(textOf(sb.lineAt(4))).toBe("L0");
    expect(textOf(sb.lineAt(9))).toBe("L5");
  });

  it("places a page by its own dropped", () => {
    const sb = ready(10, false, 0);
    const request = req(sb.requestFor(9, 10, 0));
    // By the time the host answered, 4 lines had left the top (history still 10).
    const result = sb.applyPage(page(request, 10, undefined, 4));
    expect(sb.dropped).toBe(4);
    expect(result).toEqual({ status: "applied", lines: 10 });
    // Offsets are against the page's own figures: all 10 lines land.
    expect(textOf(sb.lineAt(0))).toBe("L0");
    expect(textOf(sb.lineAt(9))).toBe("L9");
  });

  it("does not ask again for a line that is cached when dropped moved", () => {
    const sb = ready(10, false, 0);
    const request = req(sb.requestFor(4, 5, 0));
    sb.applyPage(page(request, 10));
    sb.onDiff({ history: 10, dropped: 2, alt: false });
    // Offsets 2..6 hold the old 0..4: only 0 and 1 are missing.
    const next = req(sb.requestFor(6, 7, 1));
    expect(next.offset).toBe(0);
    expect(next.count).toBe(2);
  });

  it("drops the cache when dropped goes down (history cleared on the host)", () => {
    const sb = ready(100, false, 50);
    const request = req(sb.requestFor(4, 5, 0));
    sb.applyPage(page(request, 100, undefined, 50));
    sb.onDiff({ history: 100, dropped: 0, alt: false });
    expect(sb.cachedLines).toBe(0);
    expect(sb.dropped).toBe(0);
  });

  it("drops the cache when a page reports a lower dropped", () => {
    const sb = ready(100, false, 50);
    const a = req(sb.requestFor(4, 5, 0));
    sb.applyPage(page(a, 100, undefined, 50));
    const b = req(sb.requestFor(14, 10, 1));
    sb.applyPage(page(b, 30, pageLines(9, 5), 0));
    expect(sb.dropped).toBe(0);
    expect(sb.cachedLines).toBe(5);
  });
});

describe("Scrollback invalidation", () => {
  it("drops cache and requests in flight on a snapshot", () => {
    const sb = ready(100);
    const done = req(sb.requestFor(4, 5, 0));
    sb.applyPage(page(done, 100));
    const late = req(sb.requestFor(14, 10, 1));
    sb.onSnapshot({ history: 40, dropped: 0, alt: false });
    expect(sb.cachedLines).toBe(0);
    expect(sb.pendingRequests).toBe(0);
    expect(sb.history).toBe(40);
    // The answer to the old request arrives after the snapshot: ignored.
    expect(sb.applyPage(page(late, 100))).toEqual({ status: "ignored" });
    expect(sb.cachedLines).toBe(0);
  });

  it("has no history on the alternate screen", () => {
    const sb = ready(100);
    const request = req(sb.requestFor(4, 5, 0));
    sb.applyPage(page(request, 100));
    sb.onDiff({ history: 0, dropped: 0, alt: true });
    expect(sb.alt).toBe(true);
    expect(sb.lineAt(0)).toBeUndefined();
    expect(sb.requestFor(0, 5, 2)).toBeNull();
    expect(sb.cachedLines).toBe(0);
    // Back to the normal screen: a snapshot, history from zero.
    sb.onSnapshot({ history: 30, dropped: 0, alt: false });
    expect(sb.requestFor(4, 5, 3)).not.toBeNull();
  });

  it("ignores a page that arrives while on the alternate screen", () => {
    const sb = ready(100);
    const request = req(sb.requestFor(4, 5, 0));
    sb.onDiff({ history: 0, dropped: 0, alt: true });
    expect(sb.applyPage(page(request, 0, []))).toEqual({ status: "ignored" });
  });

  it("forgets everything on reset", () => {
    const sb = ready(100);
    const request = req(sb.requestFor(4, 5, 0));
    sb.applyPage(page(request, 100));
    sb.reset();
    expect(sb.cachedLines).toBe(0);
    expect(sb.history).toBe(0);
    expect(sb.requestFor(4, 5, 1)).toBeNull();
  });
});

describe("Scrollback cache limit", () => {
  it("evicts the lines farthest from the viewport", () => {
    const sb = makeScrollback(100);
    sb.onSnapshot({ history: 1000, dropped: 0, alt: false });
    // Fill 0..99 (near the screen), then ask for a page far above.
    const near = req(sb.requestFor(99, 100, 0));
    sb.applyPage(page(near, 1000));
    expect(sb.cachedLines).toBe(100);
    const far = req(sb.requestFor(699, 50, 1));
    sb.applyPage(page(far, 1000));
    // 150 lines > 100: down to 80, keeping the ones nearest the far viewport.
    expect(sb.cachedLines).toBe(80);
    expect(textOf(sb.lineAt(699))).toBe("L699");
    expect(textOf(sb.lineAt(650))).toBe("L650");
    expect(sb.lineAt(0)).toBeUndefined();
  });
});
