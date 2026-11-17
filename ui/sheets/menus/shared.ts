// SPDX-License-Identifier: GPL-3.0-or-later
// What the tab and group menus and the new tab sheet share (anatomy §4.12,
// PRD-004 RF-4.9): the part of a session they use, which action kinds are
// pending on an item, the number of a window as the tree shows it, and
// sending an action with the session's notice when it is refused locally.
// Pure, apart from the overlay call; the result of a sent action
// (`action-result`) and the opening of a created tab are handled centrally,
// not here.
import type { Translator } from "@/i18n/catalog";
import type { WindowId, WorkspaceMessage } from "@/protocol";
import { type ActionKind, type ItemRef, itemKey } from "@/session/actions";
import type { RequestsState } from "@/session/requests";
import type { SendActionResult, SessionStore } from "@/session/sessionStore";
import type { OverlayApi } from "@ui/overlay";
import { actionMessageText, actionToastOptions, sendRefusalMessage } from "@ui/session/actionMessages";

/** The part of the session store the sheets read and act on. */
export type SheetSession = Pick<SessionStore, "desktopId" | "store" | "sendAction">;

/** Why `sendAction` refused, without sending anything. */
export type ActionRefusal = Extract<SendActionResult, { readonly ok: false }>["reason"];

/**
 * The kinds of the actions awaiting their result on an item (RF-4.9). Empty
 * when the item accepts another action.
 */
export function pendingKinds(requests: RequestsState, item: ItemRef): ReadonlySet<ActionKind> {
  const key = itemKey(item);
  const kinds = new Set<ActionKind>();
  for (const entry of requests.pending.values()) {
    if (entry.targets.some((target) => itemKey(target) === key)) {
      kinds.add(entry.action.do.type);
    }
  }
  return kinds;
}

/** How a menu item stands against the actions pending on its item. */
export type ItemPendingState = {
  /** Its own action awaits the result: spinner, no touch. */
  readonly pending: boolean;
  /** Another action on the same item awaits its result: dimmed, no touch. */
  readonly blocked: boolean;
};

/** Whether the item of `kind` waits for its own action or is blocked by another one. */
export function itemPendingState(kinds: ReadonlySet<ActionKind>, kind: ActionKind): ItemPendingState {
  const pending = kinds.has(kind);
  return { pending, blocked: !pending && kinds.size > 0 };
}

/** "Window N" counts the windows in the order the desktop sends them, from 1; 0 when it is gone. */
export function windowNumber(workspace: WorkspaceMessage, window: WindowId): number {
  return workspace.windows.findIndex((candidate) => candidate.id === window) + 1;
}

/**
 * Sends an action and, when the session refuses it, shows the session's
 * refusal notice (`sendRefusalMessage`, text and severity in one place).
 */
export function sendOrWarn(
  session: SheetSession,
  overlay: OverlayApi,
  tr: Pick<Translator, "t">,
  build: Parameters<SheetSession["sendAction"]>[0],
): SendActionResult {
  const result = session.sendAction(build);
  const message = sendRefusalMessage(result);
  if (message !== null) {
    overlay.showToast(actionMessageText(message, tr.t), actionToastOptions(message));
  }
  return result;
}
