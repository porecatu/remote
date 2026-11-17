// SPDX-License-Identifier: GPL-3.0-or-later
// The confirmation of "Recreate identity" (anatomy §4.4.2, PRD-001 RF-1.3): a
// central dialog that warns every pairing will be lost, with Cancel (the
// initial focus, and what the back button answers) and Recreate
// (destructive). Opened with `useOverlay().openDialog(recreateIdentityDialog(…))`.
import type { Translator } from "@/i18n/catalog";
import type { DialogDescriptor, FocusOrigin } from "@ui/overlay";

export type RecreateIdentityDialogOptions = {
  /** The translator of the current language (`useT()`). */
  readonly t: Translator["t"];
  /** "Recreate" was pressed; the dialog closes. */
  readonly onConfirm: () => void;
  /** The "Recreate identity" button: it gets the screen reader focus back on close. */
  readonly origin?: FocusOrigin;
};

/** The descriptor of the dialog. */
export function recreateIdentityDialog({ t, onConfirm, origin }: RecreateIdentityDialogOptions): DialogDescriptor {
  return {
    ...(origin === undefined ? {} : { origin }),
    title: t("device.recreate_title"),
    body: t("device.recreate_body"),
    buttons: [
      { label: t("common.cancel"), variant: "secondary", role: "cancel", testID: "recreate-cancel" },
      {
        label: t("device.recreate_confirm"),
        variant: "destructiveText",
        onPress: onConfirm,
        testID: "recreate-confirm",
      },
    ],
    initialFocus: 0,
    testID: "recreate-dialog",
  };
}
