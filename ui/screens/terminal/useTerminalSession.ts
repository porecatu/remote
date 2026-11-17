// SPDX-License-Identifier: GPL-3.0-or-later
// The terminal controller of the screen (src/controllers/terminalSession.ts):
// created with the component that calls the hook, opened when it mounts (it
// subscribes the focused pane of the tab, RF-2.10, RF-3.1) and closed when it
// unmounts (`unsubscribe`, RF-3.1). Closing is final: the screen keys that
// component by the session and the tab (`sessionKey`), so another session or
// tab is another controller, and another grid. Since closing is final, an
// effect run twice on mount (React's StrictMode mounts, unmounts and mounts
// again) finds its controller closed and puts a new one in its place, so the
// screen never keeps a dead controller. Also here: the part of the
// controller's state the screen draws, without the grid's `version`, so a
// `grid-diff` never re-renders the screen (only the grid redraws, ADR-0002).
import { useEffect, useRef, useState } from "react";

import {
  type TerminalSession,
  type TerminalState,
  type TerminalStatus,
  type TabGoneReason,
  createTerminalSession,
} from "@/controllers/terminalSession";
import type { Pane, PaneId, PaneState, TabId } from "@/protocol";
import type { SessionStore } from "@/session/sessionStore";
import { shallowEqual, useStoreState } from "@ui/hooks/useStoreState";
import type { Services } from "@ui/services/createServices";
import { useServices } from "@ui/services/ServicesContext";

const sessionNumbers = new WeakMap<SessionStore, number>();
let nextSessionNumber = 1;

/** A React key for the terminal of `tabId` on `session`: it changes with either. */
export function sessionKey(session: SessionStore, tabId: TabId): string {
  let number = sessionNumbers.get(session);
  if (number === undefined) {
    number = nextSessionNumber;
    nextSessionNumber += 1;
    sessionNumbers.set(session, number);
  }
  return `${number}:${tabId}`;
}

type TerminalServices = Pick<Services, "clock" | "scheduler" | "settings">;

function newTerminalSession(session: SessionStore, tabId: TabId, services: TerminalServices): TerminalSession {
  const { clock, scheduler, settings } = services;
  return createTerminalSession({
    session,
    tabId,
    clock,
    scheduler,
    bellVibrationEnabled: () => settings.store.getState().settings.bellVibration,
  });
}

/**
 * The controller of `tabId` on `session` for the life of the calling
 * component (key it with `sessionKey`): opened on mount, closed on unmount.
 * A controller found closed when the effect runs again (StrictMode's second
 * mount) is replaced by a new one, which the next render returns.
 */
export function useTerminalSession(session: SessionStore, tabId: TabId): TerminalSession {
  const services = useServices();
  const [terminal, setTerminal] = useState(() => newTerminalSession(session, tabId, services));
  /** The last controller this component closed: it can never open again. */
  const closed = useRef<TerminalSession | null>(null);
  useEffect(() => {
    if (closed.current === terminal) {
      setTerminal(newTerminalSession(session, tabId, services));
      return;
    }
    terminal.open();
    return () => {
      terminal.close();
      closed.current = terminal;
    };
  }, [terminal, session, tabId, services]);
  return terminal;
}

/** What the screen draws from the controller (never the grid's `version`). */
export type TerminalView = {
  readonly paneId: PaneId | null;
  readonly focusedPaneId: PaneId | null;
  readonly panes: readonly Pane[];
  readonly paneState: PaneState | null;
  readonly exitCode: number | null;
  readonly status: TerminalStatus;
  readonly canType: boolean;
  readonly tabGone: TabGoneReason | null;
};

const selectView = (state: TerminalState): TerminalView => ({
  paneId: state.paneId,
  focusedPaneId: state.focusedPaneId,
  panes: state.panes,
  paneState: state.paneState,
  exitCode: state.exitCode,
  status: state.status,
  canType: state.canType,
  tabGone: state.tabGone,
});

/** The controller's state as the screen uses it; re-renders only when one of these fields changes. */
export function useTerminalView(terminal: TerminalSession): TerminalView {
  return useStoreState(terminal.store, selectView, shallowEqual);
}
