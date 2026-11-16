// SPDX-License-Identifier: GPL-3.0-or-later

// Scrollback of one subscribed pane (spec 03 §5.5, PRD-003 RF-3.11): a cache
// of history pages the host sends on demand, plus the bookkeeping of the
// requests in flight. Pure: no React, no socket, no renderer; the clock
// (`now`, in milliseconds) and the `request-id` allocator come from the caller.
//
// Offsets follow the wire: offset 0 is the history line right above the top
// of the live screen, and the offset grows going up. The cache is keyed by the
// *absolute* index of a line (spec 03 §5.5):
//
//   index = dropped + (history - 1 - offset)     // 0 = first line the pane ever had
//
// `dropped` is how many lines already left the top of the host's history, so
// the index does not move when new output pushes the history up, not even
// when the history is full (`history` constant, `dropped` growing). A line
// whose index is below the current `dropped` no longer exists on the host and
// leaves the cache.
//
// Never logs content (CLAUDE.md, Segurança).

import type {
  Line,
  PaneId,
  RequestId,
  ScrollbackPage,
  ScrollbackRequest,
  Style,
} from "../protocol";

/** The most lines one `scrollback-request` may ask for (spec 03 §5.5). */
export const MAX_PAGE_LINES = 500;

/** A request with no answer after this long stops blocking new requests. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Requests in flight at the same time, at most. */
export const MAX_IN_FLIGHT = 2;

/** Cached lines kept before the ones far from the viewport are dropped. */
export const DEFAULT_MAX_CACHED_LINES = 20_000;

/** A history line with the style table of the page it came in. */
export interface ScrollbackLine {
  readonly line: Line;
  /** The `styles` of the page: `Span` style indexes point into it. */
  readonly styles: readonly Style[];
}

export type ApplyPageResult =
  /** The page was stored (or was empty). */
  | { readonly status: "applied"; readonly lines: number }
  /**
   * The page answers nothing this scrollback is waiting for (late after a
   * snapshot, expired, duplicated, other pane, tab-screen): dropped, not an
   * error.
   */
  | { readonly status: "ignored" };

/** The history figures every grid message carries (spec 03 §5.3, §5.5). */
export interface HistoryState {
  readonly history: number;
  readonly dropped: number;
  readonly alt: boolean;
}

export interface ScrollbackOptions {
  readonly pane: PaneId;
  /** Allocator of `request-id`s (shared with the actions, see `requests.ts`). */
  readonly nextRequestId: () => RequestId;
  readonly maxCachedLines?: number;
}

interface InFlight {
  /** Absolute indexes covered by the request, inclusive. */
  readonly first: number;
  readonly last: number;
  readonly sentAt: number;
}

export class Scrollback {
  private readonly pane: PaneId;
  private readonly nextRequestId: () => RequestId;
  private readonly maxCachedLines: number;

  private historyLines = 0;
  private droppedLines = 0;
  private altScreen = false;
  /** Absolute index -> line. */
  private readonly cache = new Map<number, ScrollbackLine>();
  private readonly inFlight = new Map<RequestId, InFlight>();
  /** Absolute index the viewport last asked for: the eviction anchor. */
  private anchor = 0;

  constructor(options: ScrollbackOptions) {
    this.pane = options.pane;
    this.nextRequestId = options.nextRequestId;
    this.maxCachedLines = options.maxCachedLines ?? DEFAULT_MAX_CACHED_LINES;
  }

  /** History lines the host holds, as of the last message seen. */
  get history(): number {
    return this.historyLines;
  }

  /** Lines already dropped from the top of the host's history, as of the last message seen. */
  get dropped(): number {
    return this.droppedLines;
  }

  /** On the alternate screen there is no history to scroll. */
  get alt(): boolean {
    return this.altScreen;
  }

  get cachedLines(): number {
    return this.cache.size;
  }

  get pendingRequests(): number {
    return this.inFlight.size;
  }

  /**
   * A `grid-snapshot` arrived: the size, the screen or the reflow may have
   * changed, so every cached line and every request in flight is dropped.
   * (A page answering a dropped request is ignored.)
   */
  onSnapshot(state: HistoryState): void {
    this.cache.clear();
    this.inFlight.clear();
    this.historyLines = state.history;
    this.droppedLines = state.dropped;
    this.altScreen = state.alt;
    this.anchor = this.absolute(Math.max(0, state.history - 1));
  }

  /**
   * A `grid-diff` arrived. Growth of `history` or of `dropped` needs no
   * rewrite (the cache is keyed by absolute index), only the eviction of the
   * lines the host no longer holds. A change of screen, a `dropped` that went
   * down or a `history` that shrank with the same `dropped` means the host
   * cleared or replaced lines, so the cache goes.
   */
  onDiff(state: HistoryState): void {
    if (state.alt !== this.altScreen || this.isReset(state)) {
      this.cache.clear();
      this.inFlight.clear();
    }
    this.historyLines = state.history;
    this.droppedLines = state.dropped;
    this.altScreen = state.alt;
    this.evictBelowDropped();
  }

  /** Forgets everything (the subscription ended). */
  reset(): void {
    this.cache.clear();
    this.inFlight.clear();
    this.historyLines = 0;
    this.droppedLines = 0;
    this.altScreen = false;
    this.anchor = 0;
  }

  /** The cached line at `offset` (0 = right above the screen), if any. */
  lineAt(offset: number): ScrollbackLine | undefined {
    if (this.altScreen || !Number.isInteger(offset) || offset < 0) {
      return undefined;
    }
    return this.cache.get(this.absolute(offset));
  }

  /** Whether the `count` lines from `offset` going up are all cached. */
  hasRange(offset: number, count: number): boolean {
    for (let i = 0; i < count; i += 1) {
      if (this.lineAt(offset + i) === undefined) return false;
    }
    return true;
  }

  /**
   * The viewport shows history down from the line at `viewportTopOffset`
   * (the topmost visible history line); `count` lines toward the screen are
   * wanted. Returns the `scrollback-request` to send for the part of that
   * window nearest the top that is neither cached nor already requested, or
   * null when there is nothing to ask (all cached or in flight, the alternate
   * screen, no history, or too many requests in flight). One request per
   * call, never more than `MAX_PAGE_LINES` lines; call again as pages land.
   */
  requestFor(
    viewportTopOffset: number,
    count: number,
    now: number,
  ): ScrollbackRequest | null {
    this.expire(now);
    if (this.altScreen || this.historyLines === 0) return null;
    if (this.inFlight.size >= MAX_IN_FLIGHT) return null;
    if (
      !Number.isInteger(viewportTopOffset) ||
      !Number.isInteger(count) ||
      viewportTopOffset < 0 ||
      count < 1
    ) {
      return null;
    }

    const top = Math.min(viewportTopOffset, this.historyLines - 1);
    const bottom = Math.max(0, viewportTopOffset - count + 1);
    this.anchor = this.absolute(top);

    // First missing line walking from the top toward the screen.
    let high = -1;
    for (let offset = top; offset >= bottom; offset -= 1) {
      if (!this.isCoveredOrAsked(this.absolute(offset))) {
        high = offset;
        break;
      }
    }
    if (high < 0) return null;

    let low = high;
    while (
      low - 1 >= bottom &&
      high - (low - 1) + 1 <= MAX_PAGE_LINES &&
      !this.isCoveredOrAsked(this.absolute(low - 1))
    ) {
      low -= 1;
    }

    const id = this.nextRequestId();
    this.inFlight.set(id, {
      first: this.absolute(high),
      last: this.absolute(low),
      sentAt: now,
    });
    return {
      type: "scrollback-request",
      id,
      pane: this.pane,
      offset: low,
      count: high - low + 1,
    };
  }

  /**
   * Stores a `scrollback-page`. The page's own `history` and `dropped` are
   * the reference of its offsets (the host answers against the state at
   * response time), so each line lands at
   * `dropped + (history - 1 - offset)`; a line below the current `dropped` is
   * gone from the host and is not stored. A page whose figures went backwards
   * (the host cleared the history) drops the cache.
   */
  applyPage(msg: ScrollbackPage): ApplyPageResult {
    const request = this.inFlight.get(msg.id);
    if (request === undefined || msg.pane !== this.pane || this.altScreen) {
      return { status: "ignored" };
    }
    this.inFlight.delete(msg.id);

    if (this.isReset(msg)) {
      this.cache.clear();
      this.inFlight.clear();
    }
    this.historyLines = msg.history;
    this.droppedLines = msg.dropped;
    this.evictBelowDropped();

    const lines = msg.lines.slice(0, MAX_PAGE_LINES);
    let stored = 0;
    for (let j = 0; j < lines.length; j += 1) {
      const line = lines[j];
      if (line === undefined) continue;
      // The last line of the page is the one at `offset`.
      const offset = msg.offset + (lines.length - 1 - j);
      if (offset >= msg.history) continue;
      this.cache.set(this.absolute(offset), { line, styles: msg.styles });
      stored += 1;
    }
    this.evict();
    return { status: "applied", lines: stored };
  }

  /** Absolute index (spec 03 §5.5) of the line at `offset`, as of the last message seen. */
  private absolute(offset: number): number {
    return this.droppedLines + (this.historyLines - 1 - offset);
  }

  /** The figures went backwards: `dropped` fell, or `history` shrank with the same `dropped`. */
  private isReset(next: { readonly history: number; readonly dropped: number }): boolean {
    return (
      next.dropped < this.droppedLines ||
      (next.dropped === this.droppedLines && next.history < this.historyLines)
    );
  }

  /** Lines whose index fell below `dropped` no longer exist on the host. */
  private evictBelowDropped(): void {
    for (const index of this.cache.keys()) {
      if (index < this.droppedLines) this.cache.delete(index);
    }
  }

  private isCoveredOrAsked(index: number): boolean {
    if (this.cache.has(index)) return true;
    for (const request of this.inFlight.values()) {
      if (index >= request.first && index <= request.last) return true;
    }
    return false;
  }

  private expire(now: number): void {
    for (const [id, request] of this.inFlight) {
      if (now - request.sentAt >= REQUEST_TIMEOUT_MS) this.inFlight.delete(id);
    }
  }

  /** Drops the lines farthest from the viewport once the cache is too big. */
  private evict(): void {
    if (this.cache.size <= this.maxCachedLines) return;
    const keep = Math.floor(this.maxCachedLines * 0.8);
    const anchor = this.anchor;
    const indexes = [...this.cache.keys()].sort(
      (a, b) => Math.abs(b - anchor) - Math.abs(a - anchor),
    );
    const drop = this.cache.size - keep;
    for (let i = 0; i < drop; i += 1) {
      const index = indexes[i];
      if (index !== undefined) this.cache.delete(index);
    }
  }
}
