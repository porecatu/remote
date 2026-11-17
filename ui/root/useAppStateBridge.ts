// SPDX-License-Identifier: GPL-3.0-or-later
// Tells the app shell (src/controllers/appShell.ts) every change of the React
// Native app state: the shell covers the screen while the app is not `active`
// (RF-1.19), starts the background clock of the lock (RF-1.17) and passes
// background/foreground on to the session registry (RF-2.5).
import { useEffect } from "react";
import { AppState } from "react-native";

import type { AppShellController, AppStateKind } from "@/controllers/appShell";

/**
 * The shell's app state for a React Native one. `unknown` (iOS, before the
 * first answer) and `extension` (an app extension context) say nothing about
 * the screen: null, and the shell keeps the state it had.
 */
export function toAppStateKind(status: string | null | undefined): AppStateKind | null {
  switch (status) {
    case "active":
    case "inactive":
    case "background":
      return status;
    default:
      return null;
  }
}

/** Reports the current app state on mount and every change after it. */
export function useAppStateBridge(appShell: Pick<AppShellController, "appStateChanged">): void {
  useEffect(() => {
    const report = (status: string | null | undefined): void => {
      const kind = toAppStateKind(status);
      if (kind !== null) {
        appShell.appStateChanged(kind);
      }
    };
    report(AppState.currentState);
    const subscription = AppState.addEventListener("change", report);
    return () => {
      subscription.remove();
    };
  }, [appShell]);
}
