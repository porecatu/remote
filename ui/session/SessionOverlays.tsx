// SPDX-License-Identifier: GPL-3.0-or-later
// The overlays of the session of an open desktop (anatomy §4.13, §4.14;
// PRD-004 RF-4.1, RF-4.2, RF-4.9 to RF-4.11). Mounted once by the desktop's
// stack (`app/desktop/[id]/_layout.tsx`), over the workspace and the terminal,
// it draws nothing itself; it reacts to the session store:
// - the confirmation on top of the store (`confirm-request`) opens the close
//   dialog, owned by the session (`session:<desktopId>`), so it stays over
//   whatever screen of the desktop is shown, and speaks the current language
//   while open; Close and Cancel answer it, and
//   the dialog goes away when the store drops it (answered, ended by an
//   `action-result`, run out of time, session dropped);
// - the 60 s ran out: "nothing was closed" (the `confirm-timeout` result the
//   desktop sends after it is not shown again);
// - a failed action becomes its notice (`actionMessages.ts`), with its code in
//   mono when it quotes one, `cancelled` none; a tree that went stale updates
//   by itself with the next `workspace`;
// - the session dropped with actions unanswered: the notice says so;
// - a tab created by the phone (`new-tab`) is opened in the terminal as soon
//   as it is in the workspace (RF-4.1); the desktop already made it its
//   window's active tab (spec 03 §7);
//   if it never shows up, a notice says so;
// - the session ended (closed or failed), the desktop restarted (the ids of
//   the overlays mean other things now), or the user left the desktop: every
//   overlay of the session closes.
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { sessionOwner } from "@/controllers/overlay";
import { ErrorCode, type RequestId, type TabId } from "@/protocol";
import { activeConfirm } from "@/session/confirm";
import type { SessionState, SessionStore } from "@/session/sessionStore";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { useOverlay } from "@ui/overlay";
import { useServices } from "@ui/services/ServicesContext";

import {
  ACTIONS_LOST_MESSAGE,
  CONFIRM_EXPIRED_MESSAGE,
  NEW_TAB_MISSING_MESSAGE,
  type ActionMessage,
  actionFailureMessage,
  actionMessageText,
  actionToastOptions,
} from "./actionMessages";
import { confirmCloseDialog, confirmTarget } from "./ConfirmCloseDialog";

/** Route of a tab of an open desktop in the terminal. */
export function tabRoute(desktopId: string, tab: TabId): string {
  return `/desktop/${desktopId}/tab/${tab}`;
}

const selectActiveConfirm = (state: SessionState) => activeConfirm(state.confirms);

/** The session is over: nothing it opened makes sense any more. */
function sessionEnded(state: SessionState, previous: SessionState): boolean {
  const ended = state.connection.state === "closed" || state.connection.state === "failed";
  const wasEnded = previous.connection.state === "closed" || previous.connection.state === "failed";
  // The desktop restarted: the store dropped the old tree, whose ids mean other things now.
  const restarted = previous.workspace !== null && state.workspace === null;
  return (ended && !wasEnded) || restarted;
}

export type SessionOverlaysProps = {
  /** The local id of the open desktop. */
  readonly desktopId: string;
};

/** The overlays of the session of `desktopId`; nothing while the desktop is not open. */
export function SessionOverlays({ desktopId }: SessionOverlaysProps) {
  const { registry } = useServices();
  const session = registry.get(desktopId);
  return session === undefined ? null : <SessionOverlaysOf session={session} />;
}

function SessionOverlaysOf({ session }: { readonly session: SessionStore }) {
  const { clock, scheduler } = useServices();
  const overlay = useOverlay();
  const router = useRouter();
  const tr = useT();
  const desktopId = session.desktopId;
  const owner = sessionOwner(desktopId);
  const active = useStoreState(session.store, selectActiveConfirm);
  /** The dialog on screen and the confirmation it shows. */
  const dialog = useRef<{ readonly confirm: RequestId; readonly id: string } | null>(null);
  /** Confirmations that ran out of time here: the desktop's `confirm-timeout` repeats the notice. */
  const [expired] = useState(() => new Set<RequestId>());

  // The close dialog follows the confirmation on top of the store.
  useEffect(() => {
    const current = dialog.current;
    if (current !== null && current.confirm === active?.id) {
      return;
    }
    if (current !== null) {
      dialog.current = null;
      overlay.close(current.id);
    }
    if (active === null) {
      return;
    }
    const confirm = active.id;
    const id = overlay.openDialog({
      ...confirmCloseDialog({
        confirm: active,
        target: confirmTarget(session.getState(), active),
        clock,
        scheduler,
        onAnswer: (accept) => {
          session.answerConfirm(confirm, accept);
        },
      }),
      owner,
      onClose: () => {
        if (dialog.current?.id === id) {
          dialog.current = null;
        }
      },
    });
    dialog.current = { confirm, id };
  }, [active, session, overlay, owner, clock, scheduler]);

  // Notices and the created tab.
  useEffect(() => {
    const show = (message: ActionMessage) => {
      overlay.showToast(actionMessageText(message, tr.t), actionToastOptions(message));
    };
    return session.onEvent((event) => {
      switch (event.type) {
        case "action-outcome": {
          const { outcome } = event;
          if (outcome.status === "failed") {
            const { code } = outcome.failure;
            if (code === ErrorCode.confirmTimeout && expired.delete(outcome.request.id)) {
              return;
            }
            const message = outcome.failure.silent ? null : actionFailureMessage(code);
            if (message !== null) {
              show(message);
            }
          } else if (outcome.status === "created-tab") {
            router.push(tabRoute(desktopId, outcome.tab));
          }
          return;
        }
        case "tab-waiting":
          if (event.event.status === "appeared") {
            router.push(tabRoute(desktopId, event.event.tab));
          } else {
            show(NEW_TAB_MISSING_MESSAGE);
          }
          return;
        case "confirm-expired":
          for (const item of event.confirms) {
            expired.add(item.id);
          }
          show(CONFIRM_EXPIRED_MESSAGE);
          return;
        case "actions-lost":
          expired.clear();
          show(ACTIONS_LOST_MESSAGE);
          return;
      }
    });
  }, [session, overlay, router, tr, desktopId, expired]);

  // The session ended: its overlays close.
  useEffect(
    () =>
      session.store.subscribe((state, previous) => {
        if (sessionEnded(state, previous)) {
          overlay.closeOwnedBy(owner);
        }
      }),
    [session, overlay, owner],
  );

  // The user left the desktop.
  useEffect(
    () => () => {
      overlay.closeOwnedBy(owner);
    },
    [overlay, owner],
  );

  return null;
}
