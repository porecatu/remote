// SPDX-License-Identifier: GPL-3.0-or-later
import { isSecureRelayUrl, parseHostId, presenceUrl as derivePresenceUrl } from "@/protocol";

// Presence query (protocol spec 01 §2, PRD-001 RF-1.13): an HTTPS GET that
// tells whether a desktop is registered at the relay, without opening a
// channel. `fetch` and the clock are injected.

export type Presence = "online" | "offline" | "unknown";

export const PRESENCE_INTERVAL_MS = 30_000;

export type FetchLike = (
  url: string,
  init?: { method?: string; signal?: AbortSignal },
) => Promise<{ status: number }>;

/**
 * The protocol's presence URL (`wss://` becomes `https://`, `ws://` becomes
 * `http://`, then `/v0/presence/<host_id>`), or null when the relay URL is
 * not acceptable (`ws://` only to loopback, spec 01 §1) or the host id is
 * malformed. The package function throws on malformed input and does not
 * check the security rule; this guard turns both into a null.
 */
export function presenceUrl(relayUrl: string, hostId: string): string | null {
  if (!isSecureRelayUrl(relayUrl) || parseHostId(hostId) === null) {
    return null;
  }
  return derivePresenceUrl(relayUrl, hostId);
}

/** 204 online, 404 offline; 429, any other status and network errors: unknown. */
export function presenceFromStatus(status: number): Presence {
  if (status === 204) {
    return "online";
  }
  if (status === 404) {
    return "offline";
  }
  return "unknown";
}

export async function queryPresence(
  fetchFn: FetchLike,
  relayUrl: string,
  hostId: string,
  signal?: AbortSignal,
): Promise<Presence> {
  const url = presenceUrl(relayUrl, hostId);
  if (url === null) {
    return "unknown";
  }
  try {
    const init: { method: string; signal?: AbortSignal } = { method: "GET" };
    if (signal !== undefined) {
      init.signal = signal;
    }
    const response = await fetchFn(url, init);
    return presenceFromStatus(response.status);
  } catch {
    return "unknown";
  }
}

export interface PresenceTarget {
  /** Local id of the desktop entry. */
  readonly id: string;
  readonly relayUrl: string;
  readonly hostId: string;
}

/** Queries every target in parallel; one failure never affects the others. */
export async function queryAllPresence(
  fetchFn: FetchLike,
  targets: readonly PresenceTarget[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, Presence>> {
  const results = await Promise.all(
    targets.map(
      async (target) =>
        [target.id, await queryPresence(fetchFn, target.relayUrl, target.hostId, signal)] as const,
    ),
  );
  return new Map(results);
}

/**
 * Milliseconds until the next poll: null while the list is not visible
 * (nothing is polled in the background), 0 when one is due.
 */
export function nextPollDelay(
  visible: boolean,
  lastPollAt: number | null,
  now: number,
): number | null {
  if (!visible) {
    return null;
  }
  if (lastPollAt === null) {
    return 0;
  }
  return Math.max(0, lastPollAt + PRESENCE_INTERVAL_MS - now);
}

export interface PresenceSchedulerDeps {
  now: () => number;
  /** Runs one round of queries; it never throws. */
  poll: () => Promise<void>;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

/**
 * Polls when the list becomes visible, on pull-to-refresh and every 30 s
 * while it stays visible. Hidden list: no timer, no query.
 */
export class PresenceScheduler {
  private visible = false;
  private lastPollAt: number | null = null;
  private timer: unknown = null;
  private running: Promise<void> | null = null;

  constructor(private readonly deps: PresenceSchedulerDeps) {}

  /** The list went on screen. Polls right away. */
  show(): void {
    if (this.visible) {
      return;
    }
    this.visible = true;
    this.lastPollAt = null;
    this.arm();
  }

  /** The list left the screen or the app went to the background. */
  hide(): void {
    this.visible = false;
    this.clear();
  }

  /** Pull-to-refresh: polls now (joins a round already in flight). */
  refresh(): Promise<void> {
    if (!this.visible) {
      return Promise.resolve();
    }
    if (this.running !== null) {
      return this.running;
    }
    this.clear();
    return this.run();
  }

  private clear(): void {
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private arm(): void {
    this.clear();
    if (this.running !== null) {
      return;
    }
    const delay = nextPollDelay(this.visible, this.lastPollAt, this.deps.now());
    if (delay === null) {
      return;
    }
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      this.run().catch(() => undefined);
    }, delay);
  }

  private run(): Promise<void> {
    this.lastPollAt = this.deps.now();
    // A round started while visible may finish after hide(): arm() then does
    // nothing, because it only schedules while the list is visible.
    const round = this.deps.poll().finally(() => {
      this.running = null;
      this.arm();
    });
    this.running = round;
    return round;
  }
}
