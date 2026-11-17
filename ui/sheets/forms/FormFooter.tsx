// SPDX-License-Identifier: GPL-3.0-or-later
// The fixed footer of a form sheet (anatomy §4.12, §4.12.3, §4.12.6): Cancel
// and the confirming button, at the end, `button.gap` apart.
import { StyleSheet, View } from "react-native";

import { Button } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { spacing } from "@ui/theme";

export type FormFooterProps = {
  /** Already translated ("Save", "Create group"). */
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** The form is not valid yet (empty name). */
  readonly confirmDisabled: boolean;
  /** `<testID>-cancel` and `<testID>-confirm`. */
  readonly testID: string;
};

/** Cancel and the primary button of a form sheet. */
export function FormFooter({ confirmLabel, onConfirm, onCancel, confirmDisabled, testID }: FormFooterProps) {
  const { t } = useT();
  return (
    <View style={styles.buttons}>
      <Button label={t("common.cancel")} variant="secondary" onPress={onCancel} testID={`${testID}-cancel`} />
      <Button label={confirmLabel} onPress={onConfirm} disabled={confirmDisabled} testID={`${testID}-confirm`} />
    </View>
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
