// SPDX-License-Identifier: GPL-3.0-or-later

// The controller of the desktop list (PRD-001 RF-1.12 to RF-1.16; PRD-002
// RF-2.2 to RF-2.4 for what comes back to the list): it loads the paired
// desktops from the secure store, renames and removes them, polls presence
// while the list is on screen, opens a desktop through the session registry
// and follows the connection of every open store so each row shows the state
// of its last attempt. Pure: no React; the screen reads `store` and calls the
// actions.
//
// Rules this file keeps:
// - a failed read of `desktops.v1` sets `loadError` and keeps what is in
//   memory: nothing is deleted on its own (anatomy §4.2);
// - presence is polled only while the list is visible (when it shows, on
//   pull-to-refresh and every 30 s), never in the background, and never by
//   opening a channel (RF-1.13). While a round runs, each row keeps its last
//   value, so the label does not flicker;
// - the status of each attempt is persisted by the registry itself
//   (`statusFor` + `markStatus`, src/session/registry.ts); this controller
//   applies the same rule to the list in memory, so the row changes as the
//   attempt goes, without reading the secure store again;
// - a desktop marked "not paired" is not opened: it only offers pairing again
//   and removal (RF-1.16);
// - nothing is logged here; desktop names and relay hosts are content.

import { type StoreApi, createStore } from "zustand/vanilla";
import { type FetchLike, type Presence, PresenceScheduler, queryAllPresence } from "@/net/presence";
import type { Clock, Scheduler } from "@/session/clock";
import { type SessionRegistry, statusFor } from "@/session/registry";
import type { SessionStore } from "@/session/sessionStore";
import type {
  DesktopList,
  DesktopRepository,
  DesktopStatus,
  RenameResult,
} from "@/storage/desktopList";

// ----------------------------------------------------------------- types

export interface DesktopsState {
  /** A read of the list is in flight. */
  readonly loading: boolean;
  /** The first read finished (successfully or not); before it the screen shows skeleton rows. */
  readonly loaded: boolean;
  /** The last read of the secure store failed; `desktops` keeps what it had. */
  readonly loadError: boolean;
  /** The paired desktops, in the stored order, with the status of their last attempt. */
  readonly desktops: DesktopList;
  /** Last presence answer per desktop id; a missing id is `unknown`. */
  readonly presence: Readonly<Record<string, Presence>>;
  /** True while an attempt to open the desktop is running (the row shows "Connecting…"). */
  readonly connecting: Readonly<Record<string, boolean>>;
  /** A pull-to-refresh round is in flight. */
  readonly refreshing: boolean;
}

export type RenameOutcome = RenameResult | { readonly ok: false; readonly reason: "storage" };

export interface DesktopsControllerDeps {
  readonly repository: DesktopRepository;
  readonly registry: SessionRegistry;
  /** For the presence query (HTTPS GET to the relay). */
  readonly fetch: FetchLike;
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  /** Wall clock (ISO 8601 UTC) for the status kept in memory; defaults to `clock.iso`. */
  readonly nowIso?: () => string;
}

export interface DesktopsController {
  readonly store: StoreApi<DesktopsState>;
  /** First read of the list. Same as `reload`. */
  load(): Promise<void>;
  /** Reads the list again ("Try again" on the read error band, or the screen coming back). */
  reload(): Promise<void>;
  /** Pull-to-refresh: queries presence now. Does nothing while the list is hidden. */
  refresh(): Promise<void>;
  /** The list went on (true) or off (false) the screen, or the app went to the background. */
  setVisible(visible: boolean): void;
  /** Local rename (RF-1.15). */
  rename(id: string, name: string): Promise<RenameOutcome>;
  /** Closes the session if open and forgets the desktop (RF-1.15). False when the write failed. */
  remove(id: string): Promise<boolean>;
  /**
   * Opens the desktop through the registry (reconnecting a store that ended,
   * RF-1.14) and returns its store; undefined for an unknown id or a desktop
   * marked "not paired" (RF-1.16).
   */
  open(id: string): SessionStore | undefined;
  /** Stops the polling and every store subscription. */
  dispose(): void;
}

// ----------------------------------------------------------------- row status

/** What the status label of a row shows (anatomy §4.2). Codes, never prose. */
export type RowStatus =
  | { readonly kind: "connecting" }
  | { readonly kind: "not-paired" }
  | { readonly kind: "error"; readonly errorCode: string | null }
  | { readonly kind: "online" }
  | { readonly kind: "offline"; readonly errorCode: string | null }
  | { readonly kind: "unknown" };

/**
 * The label of a row: an attempt in flight first, then "not paired" and an
 * error of the last attempt (they hold until a new attempt), then presence,
 * then the offline outcome of the last attempt. A stored "connecting" with no
 * attempt in flight (the app was closed during it) says nothing.
 */
export function rowStatus(state: DesktopsState, id: string): RowStatus {
  if (state.connecting[id] === true) {
    return { kind: "connecting" };
  }
  const last = state.desktops.find((d) => d.id === id)?.lastStatus;
  if (last?.kind === "not-paired") {
    return { kind: "not-paired" };
  }
  if (last?.kind === "error") {
    return { kind: "error", errorCode: last.errorCode ?? null };
  }
  const presence = state.presence[id] ?? "unknown";
  if (presence === "online") {
    return { kind: "online" };
  }
  if (presence === "offline") {
    return { kind: "offline", errorCode: null };
  }
  if (last?.kind === "offline") {
    return { kind: "offline", errorCode: last.errorCode ?? null };
  }
  return { kind: "unknown" };
}

// ----------------------------------------------------------------- controller

const INITIAL: DesktopsState = {
  loading: false,
  loaded: false,
  loadError: false,
  desktops: [],
  presence: {},
  connecting: {},
  refreshing: false,
};

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function sameStatus(a: DesktopStatus, b: DesktopStatus): boolean {
  return a.kind === b.kind && a.errorCode === b.errorCode;
}

export function createDesktopsController(deps: DesktopsControllerDeps): DesktopsController {
  const { repository, registry, clock, scheduler } = deps;
  const nowIso = deps.nowIso ?? (() => clock.iso());
  const store = createStore<DesktopsState>()(() => INITIAL);

  /** The open stores this controller follows, by desktop id. */
  const watched = new Map<string, { readonly session: SessionStore; readonly stop: () => void }>();
  /** Statuses learned from open stores, laid over a list read later (the write may still be queued). */
  const learned = new Map<string, DesktopStatus>();
  let loadRound = 0;
  let disposed = false;

  // ------------------------------------------------------------- connection

  function apply(id: string, session: SessionStore): void {
    const snapshot = session.getState().connection;
    const status = statusFor(snapshot);
    const state = store.getState();
    const isConnecting = status?.kind === "connecting";
    const connecting =
      (state.connecting[id] === true) === isConnecting
        ? state.connecting
        : isConnecting
          ? { ...state.connecting, [id]: true }
          : withoutKey(state.connecting, id);
    let desktops = state.desktops;
    if (status !== null) {
      const next: DesktopStatus =
        status.errorCode === undefined
          ? { kind: status.kind, at: nowIso() }
          : { kind: status.kind, at: nowIso(), errorCode: status.errorCode };
      const current = desktops.find((d) => d.id === id);
      if (current !== undefined && !sameStatus(current.lastStatus, next)) {
        learned.set(id, next);
        desktops = desktops.map((d) => (d.id === id ? { ...d, lastStatus: next } : d));
      }
    }
    if (connecting !== state.connecting || desktops !== state.desktops) {
      store.setState({ connecting, desktops });
    }
  }

  function unwatch(id: string): void {
    const entry = watched.get(id);
    if (entry !== undefined) {
      entry.stop();
      watched.delete(id);
    }
  }

  function watch(id: string, session: SessionStore): void {
    const entry = watched.get(id);
    if (entry?.session !== session) {
      unwatch(id);
      const stop = session.store.subscribe((state, previous) => {
        if (state.connection !== previous.connection) {
          apply(id, session);
        }
      });
      watched.set(id, { session, stop });
    }
    apply(id, session);
  }

  /** Follows the stores opened elsewhere (the pairing hands its session to the registry). */
  function watchOpenStores(): void {
    const ids = new Set(store.getState().desktops.map((d) => d.id));
    for (const id of registry.openIds()) {
      const session = registry.get(id);
      if (session !== undefined && ids.has(id)) {
        watch(id, session);
      }
    }
  }

  // ------------------------------------------------------------- presence

  async function poll(): Promise<void> {
    const targets = store.getState().desktops.map(({ id, relayUrl, hostId }) => ({ id, relayUrl, hostId }));
    if (targets.length === 0) {
      return;
    }
    let answers: ReadonlyMap<string, Presence>;
    try {
      answers = await queryAllPresence(deps.fetch, targets);
    } catch {
      return;
    }
    if (disposed) {
      return;
    }
    const known = new Set(store.getState().desktops.map((d) => d.id));
    const presence = { ...store.getState().presence };
    for (const [id, value] of answers) {
      if (known.has(id)) {
        presence[id] = value;
      }
    }
    store.setState({ presence });
  }

  const presence = new PresenceScheduler({
    now: () => clock.now(),
    poll,
    setTimer: (callback, ms) => scheduler.set(callback, ms),
    clearTimer: (handle) => {
      scheduler.clear(handle);
    },
  });
  let visible = false;

  // ------------------------------------------------------------- actions

  async function reload(): Promise<void> {
    loadRound += 1;
    const round = loadRound;
    store.setState({ loading: true });
    let list: DesktopList;
    try {
      list = await repository.list();
    } catch {
      if (round === loadRound && !disposed) {
        store.setState({ loading: false, loaded: true, loadError: true });
      }
      return;
    }
    if (round !== loadRound || disposed) {
      return;
    }
    for (const id of [...learned.keys()]) {
      if (!list.some((d) => d.id === id)) {
        learned.delete(id);
      }
    }
    const desktops = list.map((d) => {
      const status = learned.get(d.id);
      return status === undefined ? d : { ...d, lastStatus: status };
    });
    const ids = new Set(desktops.map((d) => d.id));
    const state = store.getState();
    const presenceNow: Record<string, Presence> = {};
    for (const [id, value] of Object.entries(state.presence)) {
      if (ids.has(id)) {
        presenceNow[id] = value;
      }
    }
    for (const id of [...watched.keys()]) {
      if (!ids.has(id)) {
        unwatch(id);
      }
    }
    store.setState({ loading: false, loaded: true, loadError: false, desktops, presence: presenceNow });
    watchOpenStores();
    if (visible) {
      // The list may have been shown before it was read, and that round had no
      // target. Not awaited: the list does not wait for the network.
      void presence.refresh();
    }
  }

  return {
    store,
    load: reload,
    reload,
    async refresh() {
      if (!visible) {
        return;
      }
      store.setState({ refreshing: true });
      try {
        await presence.refresh();
      } finally {
        if (!disposed) {
          store.setState({ refreshing: false });
        }
      }
    },
    setVisible(next) {
      if (next === visible || disposed) {
        return;
      }
      visible = next;
      if (next) {
        presence.show();
      } else {
        presence.hide();
      }
    },
    async rename(id, name) {
      let result: RenameResult;
      try {
        result = await repository.rename(id, name);
      } catch {
        return { ok: false, reason: "storage" };
      }
      if (result.ok) {
        const renamed = result.list.find((d) => d.id === id);
        if (renamed !== undefined) {
          store.setState({
            desktops: store.getState().desktops.map((d) => (d.id === id ? { ...d, name: renamed.name } : d)),
          });
        }
      }
      return result;
    },
    async remove(id) {
      unwatch(id);
      registry.close(id);
      try {
        await repository.remove(id);
      } catch {
        return false;
      }
      learned.delete(id);
      const state = store.getState();
      store.setState({
        desktops: state.desktops.filter((d) => d.id !== id),
        presence: withoutKey(state.presence, id),
        connecting: withoutKey(state.connecting, id),
      });
      return true;
    },
    open(id) {
      const desktop = store.getState().desktops.find((d) => d.id === id);
      if (desktop === undefined || desktop.lastStatus.kind === "not-paired" || disposed) {
        return undefined;
      }
      const session = registry.open(desktop);
      watch(id, session);
      return session;
    },
    dispose() {
      disposed = true;
      visible = false;
      presence.hide();
      for (const id of [...watched.keys()]) {
        unwatch(id);
      }
    },
  };
}
