// SPDX-License-Identifier: GPL-3.0-or-later
// The rename sheet of a desktop (anatomy §4.2 "Renomear", PRD-001 RF-1.15):
// one field with the current name, selected, and the help line "Only on this
// device" (the name never reaches the desktop), then Cancel and Save. A name
// the list would refuse (empty after trimming, over 64 characters) disables
// Save. A failed write keeps the sheet open and says so in a snackbar.
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { RenameOutcome } from "@/controllers/desktops";
import { type Desktop, MAX_NAME_LENGTH, normalizeName } from "@/storage/desktopList";
import { Button, TextField } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { Sheet } from "@ui/overlay";
import { spacing } from "@ui/theme";

export type RenameDesktopSheetProps = {
  readonly desktop: Desktop;
  /** Closes this sheet (from `openSheet`'s controls). */
  readonly close: () => void;
  /** Writes the new name (`DesktopsController.rename`). */
  readonly onSave: (id: string, name: string) => Promise<RenameOutcome>;
  /** The write failed: the screen tells the user (snackbar). */
  readonly onFailed: () => void;
};

/** A one-field form that renames the desktop on this device only. */
export function RenameDesktopSheet({ desktop, close, onSave, onFailed }: RenameDesktopSheetProps) {
  const { t } = useT();
  const [name, setName] = useState(desktop.name);
  const [saving, setSaving] = useState(false);
  const valid = normalizeName(name) !== null;

  const save = async () => {
    if (!valid || saving) {
      return;
    }
    setSaving(true);
    const outcome = await onSave(desktop.id, name);
    if (outcome.ok || outcome.reason === "not-found") {
      close();
      return;
    }
    setSaving(false);
    if (outcome.reason === "storage") {
      onFailed();
    }
  };

  return (
    <Sheet
      title={t("common.rename")}
      subtitle={desktop.name}
      padded
      avoidKeyboard
      testID="rename-sheet"
      footer={
        <View style={styles.buttons}>
          <Button label={t("common.cancel")} variant="secondary" onPress={close} testID="rename-cancel" />
          <Button
            label={t("common.save")}
            onPress={() => {
              void save();
            }}
            disabled={!valid}
            loading={saving}
            testID="rename-save"
          />
        </View>
      }
    >
      <TextField
        label={t("desktops.rename_field")}
        value={name}
        onChangeText={setName}
        helper={t("desktops.rename_hint")}
        maxLength={MAX_NAME_LENGTH}
        autoFocus
        selectTextOnFocus
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={() => {
          void save();
        }}
        testID="rename-field"
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  buttons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    columnGap: spacing.buttonGap,
    paddingTop: spacing.formGap,
  },
});
