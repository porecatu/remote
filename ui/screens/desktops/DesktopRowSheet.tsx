// SPDX-License-Identifier: GPL-3.0-or-later
// The sheet of a desktop row (anatomy §4.2): titled with the desktop's name,
// it offers Rename and Remove (destructive, last). Each item closes the sheet
// and hands over to the next step (the rename sheet, the remove dialog).
import type { Desktop } from "@/storage/desktopList";
import { useT } from "@ui/i18n/LocaleProvider";
import { Sheet, SheetItem } from "@ui/overlay";

export type DesktopRowSheetProps = {
  readonly desktop: Desktop;
  /** Closes this sheet (from `openSheet`'s controls). */
  readonly close: () => void;
  readonly onRename: (desktop: Desktop) => void;
  readonly onRemove: (desktop: Desktop) => void;
};

/** Rename and Remove for one desktop. */
export function DesktopRowSheet({ desktop, close, onRename, onRemove }: DesktopRowSheetProps) {
  const { t } = useT();
  return (
    <Sheet title={desktop.name} testID="desktop-sheet">
      <SheetItem
        label={t("common.rename")}
        icon="pencil"
        onPress={() => {
          close();
          onRename(desktop);
        }}
        testID="desktop-sheet-rename"
      />
      <SheetItem
        label={t("common.remove")}
        icon="x"
        destructive
        onPress={() => {
          close();
          onRemove(desktop);
        }}
        testID="desktop-sheet-remove"
      />
    </Sheet>
  );
}
