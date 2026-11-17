// SPDX-License-Identifier: GPL-3.0-or-later
// What every form sheet of tabs and groups shares: the session data it reads,
// the send of its action, and the close when its target left the tree.
//
// A sheet only sends: the `action-result` and its errors are handled once for
// the session (the `action-outcome` events), and the pending mark shows on
// the tree (RF-4.9). An action that could not leave the app (another one is
// pending on the item, the desktop is not connected, the send failed) is told
// in a snackbar, and the sheet stays open.
import { useCallback, useEffect } from "react";

import { type OverlayCloseReason, sessionOwner } from "@/controllers/overlay";
import type { Action, RequestId, Theme, WorkspaceMessage } from "@/protocol";
import type { SessionStore } from "@/session/sessionStore";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { type FocusOrigin, type SheetOptions, useOverlay } from "@ui/overlay";
import { actionMessageText, actionToastOptions, sendRefusalMessage } from "@ui/session/actionMessages";


/** What the caller of an `openXxxSheet` may add. */
export type FormSheetOpenOptions = {
  /** The element that opened the sheet (menu item, row): it gets the focus back on close. */
  readonly origin?: FocusOrigin;
  /** Runs once when the sheet starts closing, whatever the reason. */
  readonly onClose?: (reason: OverlayCloseReason) => void;
};

/** The sheet belongs to the session (it closes when the session ends). */
export function formSheetOptions(session: SessionStore, options: FormSheetOpenOptions): SheetOptions {
  return {
    owner: sessionOwner(session.desktopId),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
    ...(options.onClose === undefined ? {} : { onClose: options.onClose }),
  };
}

/** The last `workspace` and `theme` of the session, live. */
export function useSessionTree(session: SessionStore): {
  readonly workspace: WorkspaceMessage | null;
  readonly theme: Theme | null;
} {
  const workspace = useStoreState(session.store, (state) => state.workspace);
  const theme = useStoreState(session.store, (state) => state.theme);
  return { workspace, theme };
}

/**
 * Sends an action of the session; on a refusal shows its snackbar. True when
 * the action left (the sheet then closes).
 */
export function useSendAction(session: SessionStore): (build: (id: RequestId) => Action) => boolean {
  const { t } = useT();
  const overlay = useOverlay();
  return useCallback(
    (build) => {
      const result = session.sendAction(build);
      const notice = sendRefusalMessage(result);
      if (notice !== null) {
        overlay.showToast(actionMessageText(notice, t), actionToastOptions(notice));
      }
      return result.ok;
    },
    [overlay, session, t],
  );
}

/**
 * Closes the sheet once its tab or group is no longer in the tree (closed or
 * ungrouped on the desktop): there is nothing left to act on.
 */
export function useCloseWhenGone(present: boolean, close: () => void): void {
  useEffect(() => {
    if (!present) {
      close();
    }
  }, [close, present]);
}
