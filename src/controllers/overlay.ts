// SPDX-License-Identifier: GPL-3.0-or-later

// The stack of overlays of the app (ADR-0011; anatomy §4.12 to §4.14, §5):
// bottom sheets and central dialogs, one over the other, and the temporary
// notices (snackbars). One store for the whole app, drawn by a single layer
// over the navigator (`ui/overlay/`). Pure: no React; the content of an entry
// is opaque here (the layer keeps a render function in it).
//
// Rules this file keeps:
// - an overlay belongs to the app or to a session (`session:<desktopId>`),
//   never to the screen that opened it: leaving the screen keeps it, and
//   `closeOwnedBy` closes everything of a session when it ends;
// - closing is two steps: `close` marks the entry `closing` at once (it is no
//   longer the top, the back button skips it, its `onClose` runs once), and
//   the layer calls `remove` when the exit animation ends;
// - one snackbar at a time (§4.14): the next one replaces the current one,
//   unless the current one is more severe; then it waits in the queue, where a
//   newer notice of the same severity or below replaces the older one.

import { type StoreApi, createStore } from "zustand/vanilla";

/** Who an overlay belongs to: the whole app, or the session of one desktop. */
export type OverlayOwner = "app" | `session:${string}`;

/** The owner of the overlays of the session of a desktop (its local id). */
export function sessionOwner(desktopId: string): OverlayOwner {
  return `session:${desktopId}`;
}

export type OverlayKind = "sheet" | "dialog";

/**
 * Why an overlay closed: `dismiss` (back button, drag down, touch outside,
 * screen reader escape), `action` (closed by code: a button, a choice, a
 * timeout) or `owner` (its session ended).
 */
export type OverlayCloseReason = "dismiss" | "action" | "owner";

export interface OverlayEntry<C> {
  readonly id: string;
  readonly kind: OverlayKind;
  readonly owner: OverlayOwner;
  readonly content: C;
  /** On its way out: drawn until `remove`, but no longer open. */
  readonly closing: boolean;
}

/** The severity of a snackbar, which also sets its priority. */
export type ToastSeverity = "info" | "warning" | "error";

const TOAST_PRIORITY: Readonly<Record<ToastSeverity, number>> = { info: 0, warning: 1, error: 2 };

/** The priority of a severity: a notice never hides a more severe one. */
export function toastPriority(severity: ToastSeverity): number {
  return TOAST_PRIORITY[severity];
}

export interface ToastEntry<M> {
  readonly id: string;
  readonly message: M;
  readonly severity: ToastSeverity;
  /** How long it stays on screen once shown, in milliseconds. */
  readonly durationMs: number;
  readonly priority: number;
}

export interface OverlayState<C, M> {
  /** Bottom first; the last open (not `closing`) entry is the top. */
  readonly entries: readonly OverlayEntry<C>[];
  /** The snackbar on screen. */
  readonly toast: ToastEntry<M> | null;
  /** Snackbars waiting behind a more severe one, most severe first. */
  readonly toastQueue: readonly ToastEntry<M>[];
}

export interface OverlayPush<C> {
  readonly kind: OverlayKind;
  readonly content: C;
  /** Default `app`. */
  readonly owner?: OverlayOwner;
  /** Runs once, when the entry starts closing, whatever the reason. */
  readonly onClose?: (reason: OverlayCloseReason) => void;
}

export interface ToastInput<M> {
  readonly message: M;
  /** Default `info`. */
  readonly severity?: ToastSeverity;
  readonly durationMs: number;
}

export interface OverlayController<C, M> {
  readonly store: StoreApi<OverlayState<C, M>>;
  /** Opens an overlay on top of the others; returns its id. */
  push(input: OverlayPush<C>): string;
  /** Starts closing an open entry; false when it is not open (unknown or already closing). */
  close(id: string, reason?: OverlayCloseReason): boolean;
  /** Starts closing the top entry (default reason `dismiss`); the entry closed, or null. */
  closeTop(reason?: OverlayCloseReason): OverlayEntry<C> | null;
  /** Starts closing every open entry of `owner`; how many. */
  closeOwnedBy(owner: OverlayOwner): number;
  /** Drops an entry once its exit is drawn (closing it first if it is still open). */
  remove(id: string): void;
  /** The top open entry, or null. */
  top(): OverlayEntry<C> | null;
  /** Whether an overlay is open. */
  hasOpen(): boolean;
  /** Shows (or queues) a snackbar; returns its id. */
  showToast(input: ToastInput<M>): string;
  /** Takes a snackbar off the screen or out of the queue; false when unknown. */
  dismissToast(id: string): boolean;
}

function topOf<C>(entries: readonly OverlayEntry<C>[]): OverlayEntry<C> | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry !== undefined && !entry.closing) {
      return entry;
    }
  }
  return null;
}

/** The overlay stack and the snackbar queue of the app. */
export function createOverlayController<C, M = string>(): OverlayController<C, M> {
  const store = createStore<OverlayState<C, M>>()(() => ({
    entries: [],
    toast: null,
    toastQueue: [],
  }));
  const closeHandlers = new Map<string, (reason: OverlayCloseReason) => void>();
  let nextEntry = 0;
  let nextToast = 0;

  /** Marks the open entries in `ids` as closing, then runs their handlers. */
  function startClosing(ids: ReadonlySet<string>, reason: OverlayCloseReason): number {
    const closed: string[] = [];
    store.setState((state) => ({
      entries: state.entries.map((entry) => {
        if (entry.closing || !ids.has(entry.id)) {
          return entry;
        }
        closed.push(entry.id);
        return { ...entry, closing: true };
      }),
    }));
    for (const id of closed) {
      const handler = closeHandlers.get(id);
      closeHandlers.delete(id);
      handler?.(reason);
    }
    return closed.length;
  }

  return {
    store,
    push(input) {
      nextEntry += 1;
      const id = `overlay-${nextEntry}`;
      const entry: OverlayEntry<C> = {
        id,
        kind: input.kind,
        owner: input.owner ?? "app",
        content: input.content,
        closing: false,
      };
      if (input.onClose !== undefined) {
        closeHandlers.set(id, input.onClose);
      }
      store.setState((state) => ({ entries: [...state.entries, entry] }));
      return id;
    },
    close(id, reason = "action") {
      return startClosing(new Set([id]), reason) > 0;
    },
    closeTop(reason = "dismiss") {
      const top = topOf(store.getState().entries);
      if (top === null) {
        return null;
      }
      startClosing(new Set([top.id]), reason);
      return top;
    },
    closeOwnedBy(owner) {
      const ids = new Set(
        store
          .getState()
          .entries.filter((entry) => entry.owner === owner)
          .map((entry) => entry.id),
      );
      return startClosing(ids, "owner");
    },
    remove(id) {
      startClosing(new Set([id]), "action");
      if (store.getState().entries.some((entry) => entry.id === id)) {
        store.setState((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) }));
      }
    },
    top() {
      return topOf(store.getState().entries);
    },
    hasOpen() {
      return topOf(store.getState().entries) !== null;
    },
    showToast(input) {
      nextToast += 1;
      const severity = input.severity ?? "info";
      const toast: ToastEntry<M> = {
        id: `toast-${nextToast}`,
        message: input.message,
        severity,
        durationMs: input.durationMs,
        priority: toastPriority(severity),
      };
      store.setState((state) => {
        const current = state.toast;
        if (current === null || toast.priority >= current.priority) {
          // The waiting notices are all below `current`, hence below this one: they keep waiting.
          return { toast };
        }
        const queue = [...state.toastQueue.filter((queued) => queued.priority > toast.priority), toast];
        queue.sort((a, b) => b.priority - a.priority);
        return { toastQueue: queue };
      });
      return toast.id;
    },
    dismissToast(id) {
      const state = store.getState();
      if (state.toast?.id === id) {
        const [next = null, ...rest] = state.toastQueue;
        store.setState({ toast: next, toastQueue: rest });
        return true;
      }
      if (state.toastQueue.some((queued) => queued.id === id)) {
        store.setState({ toastQueue: state.toastQueue.filter((queued) => queued.id !== id) });
        return true;
      }
      return false;
    },
  };
}
