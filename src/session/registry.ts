// SPDX-License-Identifier: GPL-3.0-or-later

// One session store per open desktop (docs/arquitetura.md §2, PRD-001
// RF-1.13): opening creates the store and connects, closing disposes it.
// Desktops of the list that are not open have no store and no connection.
//
// The registry is also where the outcome of each connection attempt reaches the
// desktop list (RF-1.12, RF-1.16): the store reports a connection snapshot, and
// `statusFor` turns it into the status recorded with `markStatus`.

import { logEvent } from "@/log";
import type { RandomSource, StaticKeypair } from "@/protocol";
import type { Desktop, DesktopRepository, DesktopStatusKind } from "@/storage/desktopList";
import type { Clock, Scheduler } from "./clock";
import type { ConnectSession, LifecycleSnapshot, OpenSocket } from "./lifecycle";
import { type SessionStore, createSessionStore } from "./sessionStore";

export interface RegistryDeps {
  readonly device: StaticKeypair;
  readonly appVersion: string;
  readonly openSocket: OpenSocket;
  readonly connect?: ConnectSession;
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  readonly random?: RandomSource;
  readonly repository: DesktopRepository;
}

export interface SessionRegistry {
  /**
   * Opens the desktop: creates its store and connects. Opening one that is
   * already open returns the same store, reconnecting it if it had ended; a
   * desktop paired again (another key or relay) gets a new store.
   */
  open(desktop: Desktop): SessionStore;
  get(desktopId: string): SessionStore | undefined;
  /** Disposes the store of the desktop (closing the session cleanly). */
  close(desktopId: string): void;
  closeAll(): void;
  openIds(): readonly string[];
  /** The app went to the background: every session closes after 30 s. */
  enterBackground(): void;
  enterForeground(): void;
}

export interface StatusUpdate {
  readonly kind: DesktopStatusKind;
  readonly errorCode?: string;
}

/**
 * The status of the last connection attempt for a snapshot, or null when the
 * snapshot says nothing about an attempt (idle, the user leaving, the app
 * going to the background).
 */
export function statusFor(snapshot: LifecycleSnapshot): StatusUpdate | null {
  switch (snapshot.state) {
    case "idle":
      return null;
    case "connecting":
    case "handshaking":
    case "greeting":
    case "reconnecting":
      return { kind: "connecting" };
    case "ready":
      return { kind: "connected" };
    case "closed":
    case "failed": {
      const end = snapshot.end;
      if (end === null) {
        return null;
      }
      switch (end.reason) {
        case "user":
        case "background":
          return null;
        case "not-paired":
        case "revoked":
          return { kind: "not-paired" };
        case "offline":
        case "goodbye":
          return { kind: "offline" };
        case "remote-disabled":
        case "host-quitting":
          return { kind: "offline", errorCode: end.reason };
        default:
          return { kind: "error", errorCode: end.code ?? end.reason };
      }
    }
  }
}

function sameTarget(a: Desktop, b: Desktop): boolean {
  return a.hostKeyB64 === b.hostKeyB64 && a.relayUrl === b.relayUrl && a.hostId === b.hostId;
}

export function createSessionRegistry(deps: RegistryDeps): SessionRegistry {
  const stores = new Map<string, { readonly desktop: Desktop; readonly session: SessionStore; readonly stop: () => void }>();

  function build(desktop: Desktop): SessionStore {
    const session = createSessionStore({
      desktop,
      device: deps.device,
      appVersion: deps.appVersion,
      openSocket: deps.openSocket,
      clock: deps.clock,
      scheduler: deps.scheduler,
      ...(deps.connect === undefined ? {} : { connect: deps.connect }),
      ...(deps.random === undefined ? {} : { random: deps.random }),
    });
    let recorded = "";
    const stop = session.store.subscribe((state, previous) => {
      if (state.connection === previous.connection) {
        return;
      }
      const status = statusFor(state.connection);
      if (status === null) {
        return;
      }
      const key = `${status.kind}|${status.errorCode ?? ""}`;
      if (key === recorded) {
        return;
      }
      recorded = key;
      deps.repository
        .markStatus(desktop.id, status.kind, deps.clock.iso(), status.errorCode)
        .catch(() => {
          logEvent("storage_invalid", { item: "desktops.v1", reason: "write" });
        });
    });
    stores.set(desktop.id, { desktop, session, stop });
    return session;
  }

  function drop(desktopId: string): void {
    const entry = stores.get(desktopId);
    if (entry === undefined) {
      return;
    }
    stores.delete(desktopId);
    entry.stop();
    entry.session.dispose();
  }

  return {
    open(desktop) {
      const existing = stores.get(desktop.id);
      if (existing !== undefined) {
        if (sameTarget(existing.desktop, desktop)) {
          existing.session.start();
          return existing.session;
        }
        drop(desktop.id);
      }
      const session = build(desktop);
      session.start();
      return session;
    },
    get: (desktopId) => stores.get(desktopId)?.session,
    close: drop,
    closeAll() {
      for (const id of [...stores.keys()]) {
        drop(id);
      }
    },
    openIds: () => [...stores.keys()],
    enterBackground() {
      for (const entry of stores.values()) {
        entry.session.enterBackground();
      }
    },
    enterForeground() {
      for (const entry of stores.values()) {
        entry.session.enterForeground();
      }
    },
  };
}
