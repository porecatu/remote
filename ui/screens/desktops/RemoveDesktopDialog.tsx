// SPDX-License-Identifier: GPL-3.0-or-later
// The remove dialog of a desktop (anatomy §4.2 "Remover", PRD-001 RF-1.15):
// "Remove Casa?", the reminder that the desktop keeps listing this device
// until it is revoked there, Cancel (initial focus) and Remove (destructive).
import type { Translator } from "@/i18n/catalog";
import type { Desktop } from "@/storage/desktopList";
import type { FocusOrigin, OverlayApi } from "@ui/overlay";

export type RemoveDesktopDialogOptions = {
  readonly desktop: Desktop;
  /** Removes the desktop (`DesktopsController.remove`); called on Remove. */
  readonly onConfirm: (desktop: Desktop) => void;
  /** What opened the dialog: it gets the screen reader focus back on close. */
  readonly origin?: FocusOrigin;
};

/** Opens the confirmation; returns the dialog id. */
export function openRemoveDesktopDialog(
  overlay: OverlayApi,
  tr: Translator,
  { desktop, onConfirm, origin }: RemoveDesktopDialogOptions,
): string {
  const { t } = tr;
  return overlay.openDialog({
    title: t("desktops.remove_title", { name: desktop.name }),
    body: t("desktops.remove_body"),
    buttons: [
      { label: t("common.cancel"), role: "cancel", testID: "remove-cancel" },
      {
        label: t("common.remove"),
        variant: "destructiveText",
        onPress: () => onConfirm(desktop),
        testID: "remove-confirm",
      },
    ],
    testID: "remove-dialog",
    ...(origin === undefined ? {} : { origin }),
  });
}
