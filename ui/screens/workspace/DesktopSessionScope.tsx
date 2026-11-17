// SPDX-License-Identifier: GPL-3.0-or-later
// The open desktop around its stack (workspace and terminal; anatomy §3,
// §4.5.1, §4.5.4; PRD-002 RF-2.1 to RF-2.4). Mounted by
// `app/desktop/[id]/_layout.tsx`, it:
// - takes the session the list or the pairing opened (`registry.get`), or
//   opens the desktop itself (a stack restored without one), reading the
//   list first when it was not read yet; an unknown desktop goes back to the
//   list;
// - mounts the session overlays (`SessionOverlays`) once the session exists;
// - tells the screens whether the desktop reached `ready` in this visit (the
//   tree was shown): an end before that is an entry failure, shown by the
//   workspace as a state screen; after it, the tree stays;
// - goes back to the list with the reason in a snackbar when the desktop
//   ends the session (`goodbye`: remote access disabled, Porecatu quit,
//   device revoked; `not-paired` once the tree was shown, §4.5.4). The
//   registry already marked the desktop in the list (offline or not paired);
// - closes the session through the registry when the user leaves the
//   desktop (the stack unmounts).
// Nothing is logged: the desktop's name is content.
import { useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { MessageKey } from "@/i18n/catalog";
import { goodbyeKey } from "@/i18n/protocolMessages";
import { GoodbyeReason } from "@/protocol";
import type { LifecycleSnapshot } from "@/session/lifecycle";
import type { SessionState, SessionStore } from "@/session/sessionStore";
import { useT } from "@ui/i18n/LocaleProvider";
import { useOverlay, type ToastOptions } from "@ui/overlay";
import { useServices } from "@ui/services/ServicesContext";
import { SessionOverlays } from "@ui/session/SessionOverlays";

/** The route of the desktop list, where leaving the desktop goes. */
export const DESKTOP_LIST_ROUTE = "/";

/** What the screens of an open desktop read from its scope. */
export type DesktopSession = {
  /** The local id of the desktop (`desktops.v1`). */
  readonly desktopId: string;
  /** The session store; undefined until the desktop is open. */
  readonly session: SessionStore | undefined;
  /** The session reached `ready` during this visit: the tree was shown. */
  readonly reachedReady: boolean;
  /** Back to the desktop list (the bar's back, "Back to the list"). */
  readonly leave: () => void;
};

const DesktopSessionContext = createContext<DesktopSession | null>(null);

/** The open desktop of the surrounding stack (`DesktopSessionScope`). */
export function useDesktopSession(): DesktopSession {
  const value = useContext(DesktopSessionContext);
  if (value === null) {
    throw new Error("useDesktopSession outside DesktopSessionScope");
  }
  return value;
}

/** The snackbar that goes with leaving the desktop. */
export type LeaveNotice = {
  readonly key: MessageKey;
  readonly severity: NonNullable<ToastOptions["severity"]>;
};

/**
 * Whether the end of the session takes the user back to the list, and with
 * which notice (§4.5.4, RF-2.3, RF-2.4): every `goodbye`, and `not-paired`
 * once the tree was shown (before it, the workspace shows the "not paired"
 * state screen with "Pair again", §4.5.1). Null for every other state.
 */
export function leaveNotice(connection: LifecycleSnapshot, reachedReady: boolean): LeaveNotice | null {
  if (connection.state !== "closed" && connection.state !== "failed") {
    return null;
  }
  switch (connection.end?.reason) {
    case "goodbye":
      return { key: goodbyeKey(GoodbyeReason.normal), severity: "info" };
    case "remote-disabled":
      return { key: goodbyeKey(GoodbyeReason.remoteDisabled), severity: "info" };
    case "host-quitting":
      return { key: goodbyeKey(GoodbyeReason.hostQuitting), severity: "info" };
    case "revoked":
      return { key: goodbyeKey(GoodbyeReason.revoked), severity: "warning" };
    case "not-paired":
      // The anatomy gives both the same notice (§4.5.4).
      return reachedReady ? { key: goodbyeKey(GoodbyeReason.revoked), severity: "warning" } : null;
    default:
      return null;
  }
}

export type DesktopSessionScopeProps = {
  readonly desktopId: string;
  /** The desktop's stack. */
  readonly children: ReactNode;
};

/** The open desktop: its session, its overlays, and leaving it. */
export function DesktopSessionScope({ desktopId, children }: DesktopSessionScopeProps) {
  const { registry, desktops } = useServices();
  const router = useRouter();
  const overlay = useOverlay();
  const tr = useT();
  const [session, setSession] = useState<SessionStore | undefined>(() => registry.get(desktopId));
  /** The session that reached `ready` in this visit (a session opened again starts over). */
  const [readyFor, setReadyFor] = useState(() => (session?.getState().connection.state === "ready" ? session : undefined));
  const reachedReady = session !== undefined && readyFor === session;

  const leave = useCallback(() => {
    router.dismissTo(DESKTOP_LIST_ROUTE);
  }, [router]);

  /** What leaving on its own needs, current (the language may change meanwhile). */
  const latest = useRef({ leave, overlay, tr });
  useEffect(() => {
    latest.current = { leave, overlay, tr };
  }, [leave, overlay, tr]);
  /** The scope already sent the user back to the list on its own. */
  const left = useRef(false);
  const leaveOnce = useCallback((notice: LeaveNotice | null) => {
    if (left.current) {
      return;
    }
    left.current = true;
    const current = latest.current;
    if (notice !== null) {
      current.overlay.showToast(current.tr.t(notice.key), { severity: notice.severity });
    }
    current.leave();
  }, []);

  // Open the desktop when the stack came without its session; close it when
  // the user leaves the desktop.
  useEffect(() => {
    let active = true;
    const take = (): boolean => {
      const found = registry.get(desktopId) ?? desktops.open(desktopId);
      if (found !== undefined) {
        setSession(found);
        return true;
      }
      return false;
    };
    if (!take()) {
      if (desktops.store.getState().loaded) {
        leaveOnce(null);
      } else {
        void desktops.load().then(() => {
          if (active && !take()) {
            leaveOnce(null);
          }
        });
      }
    }
    return () => {
      active = false;
      registry.close(desktopId);
    };
  }, [desktopId, registry, desktops, leaveOnce]);

  // Follow the session: reached `ready`, or ended in a way that leaves the desktop.
  useEffect(() => {
    if (session === undefined) {
      return undefined;
    }
    let ready = false;
    const check = (state: SessionState) => {
      if (state.connection.state === "ready" && !ready) {
        ready = true;
        setReadyFor(session);
      }
      const notice = leaveNotice(state.connection, ready);
      if (notice !== null) {
        leaveOnce(notice);
      }
    };
    check(session.getState());
    return session.store.subscribe((state, previous) => {
      if (state.connection !== previous.connection) {
        check(state);
      }
    });
  }, [session, leaveOnce]);

  const value = useMemo<DesktopSession>(
    () => ({ desktopId, session, reachedReady, leave }),
    [desktopId, session, reachedReady, leave],
  );

  return (
    <DesktopSessionContext.Provider value={value}>
      {children}
      {session === undefined ? null : <SessionOverlays desktopId={desktopId} />}
    </DesktopSessionContext.Provider>
  );
}
