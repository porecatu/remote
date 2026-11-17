// SPDX-License-Identifier: GPL-3.0-or-later
// What screens use to open sheets and dialogs and show snackbars (ADR-0011):
// they ask the overlay layer, never draw an overlay themselves. An overlay
// belongs to the app or to a session (`sessionOwner(desktopId)`), not to the
// screen: it stays when the screen changes, and `closeOwnedBy` closes the
// overlays of a session that ended.
//
// A dialog is static (its props, read once at the opening) or live (a
// `useProps` hook the dialog runs at every render, so the title, body and
// buttons follow the language and any store). A snackbar is a translated
// text, with an optional part in mono (§4.14: the code of a failed action).
import { createElement, useMemo, type ReactNode } from "react";

import type { OverlayCloseReason, OverlayOwner, ToastSeverity } from "@/controllers/overlay";
import { duration } from "@ui/theme";

import { Dialog, LiveDialog, type DialogButton, type DialogProps } from "./Dialog";
import {
  useOverlayController,
  type AppOverlayController,
  type FocusOrigin,
  type OverlayControls,
} from "./OverlayProvider";

export type SheetOptions = {
  /** Default `app`. */
  readonly owner?: OverlayOwner;
  /** The element that opened the sheet: it gets the screen reader focus back on close. */
  readonly origin?: FocusOrigin;
  /** Runs once when the sheet starts closing, whatever the reason. */
  readonly onClose?: (reason: OverlayCloseReason) => void;
};

/** Where a dialog belongs and what its closing does. */
export type DialogOptions = {
  /** Default `app`; the `confirm-request` dialog belongs to its session. */
  readonly owner?: OverlayOwner;
  readonly origin?: FocusOrigin;
  /**
   * The back button, or the screen reader escape. Default: the `onPress` of
   * the `cancel` button (Cancel and back answer the same, §4.13); for a live
   * dialog, the one of its latest render.
   */
  readonly onDismiss?: () => void;
  /** Runs once when the dialog starts closing, whatever the reason. */
  readonly onClose?: (reason: OverlayCloseReason) => void;
};

/** A dialog whose props are read once, at the opening. */
export type DialogDescriptor = DialogProps & DialogOptions;

/**
 * A dialog whose props are read at every render: `useProps` is a hook (it may
 * call `useT()`, `useStoreState`, `useOverlayFrame`…) and gets the dialog's
 * controls, to close it from an effect.
 */
export type LiveDialogDescriptor = DialogOptions & {
  readonly useProps: (controls: OverlayControls) => DialogProps;
};

export type ToastOptions = {
  /** Default `info`. */
  readonly severity?: ToastSeverity;
  /**
   * A part of the message drawn in mono (`type.mono-body`): the protocol code
   * of a failed action (§4.14). The message carries it already translated;
   * the snackbar draws its first occurrence in mono.
   */
  readonly code?: string;
};

export type OverlayApi = {
  /** Opens a sheet: `render` returns a `<Sheet>`. Returns its id. */
  openSheet(render: (controls: OverlayControls) => ReactNode, options?: SheetOptions): string;
  /** Opens a central dialog, static or live. Returns its id. */
  openDialog(descriptor: DialogDescriptor | LiveDialogDescriptor): string;
  /** Shows a snackbar with an already translated message. Returns its id. */
  showToast(message: string, options?: ToastOptions): string;
  /** Closes a sheet or dialog by code (a choice made, a confirmation expired). */
  close(id: string): void;
  /** Closes every sheet and dialog of an owner (the session ended). */
  closeOwnedBy(owner: OverlayOwner): void;
  /** Takes a snackbar away before its time. */
  dismissToast(id: string): void;
};

/** How long a snackbar of a severity stays (§2.9): errors 8 s, the others 6 s. */
export function toastDuration(severity: ToastSeverity): number {
  return severity === "error" ? duration.snackbarError : duration.snackbarInfo;
}

/** The overlay calls over a store; `useOverlay` binds them to the provider's. */
export function overlayApi(controller: AppOverlayController): OverlayApi {
  return {
    openSheet(render, options = {}) {
      return controller.push({
        kind: "sheet",
        content: { render, ...(options.origin === undefined ? {} : { origin: options.origin }) },
        ...(options.owner === undefined ? {} : { owner: options.owner }),
        ...(options.onClose === undefined ? {} : { onClose: options.onClose }),
      });
    },
    openDialog(descriptor) {
      const { owner, origin, onDismiss, onClose, ...rest } = descriptor;
      /** The buttons on screen: the back button answers as their Cancel. */
      const shown: { buttons: readonly DialogButton[] } = { buttons: [] };
      let render: (controls: OverlayControls) => ReactNode;
      if ("useProps" in rest) {
        const { useProps } = rest;
        render = (controls) =>
          createElement(LiveDialog, {
            useProps,
            controls,
            onProps: (props: DialogProps) => {
              shown.buttons = props.buttons;
            },
          });
      } else {
        shown.buttons = rest.buttons;
        render = () => createElement(Dialog, rest);
      }
      return controller.push({
        kind: "dialog",
        content: { render, ...(origin === undefined ? {} : { origin }) },
        ...(owner === undefined ? {} : { owner }),
        onClose: (reason) => {
          if (reason === "dismiss") {
            const dismiss = onDismiss ?? shown.buttons.find((button) => button.role === "cancel")?.onPress;
            dismiss?.();
          }
          onClose?.(reason);
        },
      });
    },
    showToast(message, options = {}) {
      const severity = options.severity ?? "info";
      return controller.showToast({
        message,
        severity,
        durationMs: toastDuration(severity),
        ...(options.code === undefined ? {} : { code: options.code }),
      });
    },
    close(id) {
      controller.close(id, "action");
    },
    closeOwnedBy(owner) {
      controller.closeOwnedBy(owner);
    },
    dismissToast(id) {
      controller.dismissToast(id);
    },
  };
}

/** Opens sheets and dialogs and shows snackbars on the app's overlay layer. */
export function useOverlay(): OverlayApi {
  const controller = useOverlayController();
  return useMemo(() => overlayApi(controller), [controller]);
}
