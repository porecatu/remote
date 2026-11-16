// SPDX-License-Identifier: GPL-3.0-or-later

// Grid subscriptions of one desktop session (spec 03 §5.1-5.5, PRD-003): which
// panes the app is subscribed to, one `GridModel` and one `Scrollback` per
// subscription, and the routing of the host messages that feed them. Pure
// logic: no React, no socket, no renderer, no clock. What goes out leaves
// through the injected `send`; what comes in arrives at `handle`.
//
// Rules this file keeps:
// - `grid-ack` goes out only after the message was applied (spec 03 §5.4);
// - a snapshot is accepted at any time, a diff needs the snapshot before it and
//   `seq == previous + 1`; anything else is a protocol error: the app sends
//   `error { protocol }` and the session closes, with no attempt to recover;
// - never more than `max_subscriptions` (from the `welcome`) at once;
// - a message for a pane that is not subscribed (late, after an unsubscribe)
//   is dropped, not an error.
//
// The content of a grid or of a history page never reaches the log
// (CLAUDE.md, Segurança): only the `protocol_error` event, with a reason code.

import { GridModel } from "../grid/gridModel";
import { Scrollback } from "../grid/scrollback";
import { logEvent } from "../log";
import {
  type ClientMessage,
  ErrorCode,
  type Message,
  type PaneId,
  type RequestId,
  type SubscriptionEndReason,
} from "../protocol";

/** One subscribed pane: its screen and its history cache. */
export interface PaneSubscription {
  readonly pane: PaneId;
  readonly grid: GridModel;
  readonly scrollback: Scrollback;
}

/** Why a grid message was refused as a protocol error (a `protocol_error` log field). */
export type ProtocolFault = "grid-seq" | "grid-message";

/** What the set tells its owner; the owner decides what a screen does with it. */
export type SubscriptionEvent =
  /** The screen of `pane` changed (snapshot or diff applied); read `takeDirtyRows()`. */
  | { readonly type: "grid"; readonly pane: PaneId }
  /** A history page landed in the cache of `pane`. */
  | { readonly type: "scrollback"; readonly pane: PaneId }
  /** The host ended the subscription (the pane closed, or the host's limit). */
  | { readonly type: "ended"; readonly pane: PaneId; readonly reason: SubscriptionEndReason }
  /**
   * The host answered a subscribe or an input with an error for the pane
   * (`unknown-pane`, `too-many-subscriptions`, `not-subscribed`,
   * `pane-not-running`). The first three also drop the local subscription.
   */
  | { readonly type: "refused"; readonly pane: PaneId; readonly code: ErrorCode }
  /** The bell rang in `pane`; `vibrate` is the decision (PRD-003 RF-3.23). */
  | { readonly type: "bell"; readonly pane: PaneId; readonly vibrate: boolean };

export interface SubscriptionSetOptions {
  /** Sends a message to the host. May throw if the session closed; the set tolerates it. */
  readonly send: (message: ClientMessage) => void;
  /** `max_subscriptions` of the `welcome`. */
  readonly maxSubscriptions: number;
  /** The allocator shared with the actions (`requests.ts`): ids are unique per session. */
  readonly nextRequestId: () => RequestId;
  /** Current value of `settings.bellVibration`; read at every bell. */
  readonly bellVibration: () => boolean;
  readonly onEvent: (event: SubscriptionEvent) => void;
  /**
   * A grid message that is a protocol error arrived: `error { protocol }` was
   * already sent and the set is closed. The owner closes the session.
   */
  readonly onProtocolError: (fault: ProtocolFault) => void;
  /** Cache size of each `Scrollback` (default of the class). */
  readonly maxCachedLines?: number;
}

export type SubscribeResult =
  | { readonly ok: true; readonly resubscribed: boolean }
  /** `limit`: `max_subscriptions` reached, nothing was sent. `closed`: a protocol error ended the set. */
  | { readonly ok: false; readonly reason: "limit" | "closed" };

/** The errors that answer a subscribe (or contradict the subscription) for one pane. */
const DROPS_SUBSCRIPTION: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  ErrorCode.unknownPane,
  ErrorCode.tooManySubscriptions,
  ErrorCode.notSubscribed,
]);
const PANE_ERRORS: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  ...DROPS_SUBSCRIPTION,
  ErrorCode.paneNotRunning,
]);

export class SubscriptionSet {
  private readonly options: SubscriptionSetOptions;
  private readonly subs = new Map<PaneId, PaneSubscription>();
  private max: number;
  private closed = false;

  constructor(options: SubscriptionSetOptions) {
    this.options = options;
    this.max = options.maxSubscriptions;
  }

  get maxSubscriptions(): number {
    return this.max;
  }

  get size(): number {
    return this.subs.size;
  }

  /** Whether a protocol error ended this set: nothing more is sent or applied. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** Subscribed panes (a subscribe was sent and no unsubscribe or end came since). */
  panes(): readonly PaneId[] {
    return [...this.subs.keys()];
  }

  /** Whether `pane` is subscribed. True from the `subscribe` on: the host orders messages. */
  has(pane: PaneId): boolean {
    return this.subs.has(pane);
  }

  /** The grid and history of a subscribed pane, for the renderer. */
  get(pane: PaneId): PaneSubscription | undefined {
    return this.subs.get(pane);
  }

  /** Whether the first `grid-snapshot` of `pane` already arrived. */
  isReady(pane: PaneId): boolean {
    return this.subs.get(pane)?.grid.hasState === true;
  }

  /**
   * Subscribes to `pane`. Subscribing again to a subscribed pane keeps its
   * subscription and asks for a fresh `grid-snapshot` (spec 03 §5.1); it does
   * not count against the limit.
   */
  subscribe(pane: PaneId): SubscribeResult {
    if (this.closed) {
      return { ok: false, reason: "closed" };
    }
    const existing = this.subs.get(pane);
    if (existing === undefined) {
      if (this.subs.size >= this.max) {
        return { ok: false, reason: "limit" };
      }
      this.subs.set(pane, {
        pane,
        grid: new GridModel(),
        scrollback: new Scrollback({
          pane,
          nextRequestId: this.options.nextRequestId,
          ...(this.options.maxCachedLines === undefined
            ? {}
            : { maxCachedLines: this.options.maxCachedLines }),
        }),
      });
    }
    this.trySend({ type: "subscribe", pane });
    return { ok: true, resubscribed: existing !== undefined };
  }

  /** Leaves `pane`. `false` when it was not subscribed (nothing is sent). */
  unsubscribe(pane: PaneId): boolean {
    const sub = this.subs.get(pane);
    if (sub === undefined) {
      return false;
    }
    this.subs.delete(pane);
    sub.scrollback.reset();
    if (!this.closed) {
      this.trySend({ type: "unsubscribe", pane });
    }
    return true;
  }

  /**
   * Drops every subscription without telling the host (the session ended or
   * reconnected: a new handshake starts from nothing, architecture §
   * Reconexão). Optionally takes the new `max_subscriptions`; reopens a set a
   * protocol error had closed.
   */
  reset(maxSubscriptions: number = this.max): void {
    for (const sub of this.subs.values()) {
      sub.scrollback.reset();
    }
    this.subs.clear();
    this.max = maxSubscriptions;
    this.closed = false;
  }

  /**
   * The `scrollback-request` for the part of the viewport still missing, sent
   * to the host; `true` when one was sent. See `Scrollback.requestFor`.
   */
  requestScrollback(
    pane: PaneId,
    viewportTopOffset: number,
    count: number,
    now: number,
  ): boolean {
    const sub = this.subs.get(pane);
    if (sub === undefined || this.closed) {
      return false;
    }
    const request = sub.scrollback.requestFor(viewportTopOffset, count, now);
    if (request === null) {
      return false;
    }
    this.trySend(request);
    return true;
  }

  /**
   * Routes one host message. Returns `true` when this set took it (even to
   * drop it), `false` when it is not a subscription matter and the owner
   * routes it elsewhere. Never throws for a host message.
   */
  handle(message: Message): boolean {
    switch (message.type) {
      case "grid-snapshot":
      case "grid-diff":
        if (!this.closed) {
          this.applyGrid(message);
        }
        return true;
      case "scrollback-page": {
        const sub = this.subs.get(message.pane);
        if (sub !== undefined && !this.closed && sub.scrollback.applyPage(message).status === "applied") {
          this.options.onEvent({ type: "scrollback", pane: message.pane });
        }
        return true;
      }
      case "subscription-ended": {
        const sub = this.subs.get(message.pane);
        if (sub !== undefined) {
          sub.scrollback.reset();
          this.subs.delete(message.pane);
          this.options.onEvent({ type: "ended", pane: message.pane, reason: message.reason });
        }
        return true;
      }
      case "bell":
        this.options.onEvent({
          type: "bell",
          pane: message.pane,
          // Vibration only where the user is looking: the pane that is subscribed.
          vibrate: this.subs.has(message.pane) && this.options.bellVibration(),
        });
        return true;
      case "error":
        return this.handleError(message.code, message.pane, message.id);
      default:
        return false;
    }
  }

  private handleError(code: ErrorCode, pane: PaneId | undefined, id: RequestId | undefined): boolean {
    if (pane === undefined || !PANE_ERRORS.has(code)) {
      return false;
    }
    if (id !== undefined) {
      // The answer to a scrollback-request: the request simply times out in the cache.
      return true;
    }
    if (DROPS_SUBSCRIPTION.has(code)) {
      const sub = this.subs.get(pane);
      if (sub !== undefined) {
        sub.scrollback.reset();
        this.subs.delete(pane);
      }
    }
    this.options.onEvent({ type: "refused", pane, code });
    return true;
  }

  private applyGrid(message: Extract<Message, { type: "grid-snapshot" | "grid-diff" }>): void {
    const sub = this.subs.get(message.pane);
    if (sub === undefined) {
      return;
    }
    if (message.type === "grid-snapshot") {
      const result = sub.grid.applySnapshot(message);
      if (!result.ok) {
        this.fail("grid-message");
        return;
      }
      sub.scrollback.onSnapshot({ history: message.history, dropped: message.dropped, alt: message.alt });
      this.trySend(result.ack);
    } else {
      const wasSequenced = sub.grid.hasState && message.seq === sub.grid.expectedSeq;
      const result = sub.grid.applyDiff(message);
      if (!result.ok) {
        this.fail(wasSequenced ? "grid-message" : "grid-seq");
        return;
      }
      sub.scrollback.onDiff({ history: message.history, dropped: message.dropped, alt: message.alt });
      this.trySend(result.ack);
    }
    this.options.onEvent({ type: "grid", pane: message.pane });
  }

  /** `error { protocol }` out, set closed, owner told (spec 03 §5.3). */
  private fail(fault: ProtocolFault): void {
    this.closed = true;
    for (const sub of this.subs.values()) {
      sub.scrollback.reset();
    }
    this.subs.clear();
    logEvent("protocol_error", { reason: fault });
    this.trySend({ type: "error", code: ErrorCode.protocol });
    this.options.onProtocolError(fault);
  }

  /**
   * `send` throws once the session closed. That is the session's own failure,
   * which its owner learns through the session events; a callback of a host
   * message must not throw on top of it.
   */
  private trySend(message: ClientMessage): void {
    try {
      this.options.send(message);
    } catch {
      // The session ended; nothing to do here.
    }
  }
}
