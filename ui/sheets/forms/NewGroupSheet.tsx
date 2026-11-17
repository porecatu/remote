// SPDX-License-Identifier: GPL-3.0-or-later
// New group with this tab (anatomy §4.12.6, PRD-004 RF-4.7): a field for the
// name (required, focused) and the row of group color swatches from the
// desktop theme, led by "Automatic" (the default: the desktop picks the
// color); Cancel and **Create group** (primary, disabled while the name is
// empty). `new-group` takes the tab; the menus offer it only on a loose tab
// (not pinned: the desktop refuses). The sheet sends and closes; the group
// comes in the next `workspace` (RF-4.9).
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { TabId } from "@/protocol";
import { newGroup } from "@/session/actions";
import type { SessionStore } from "@/session/sessionStore";
import { findTab } from "@/workspace/selectors";
import { TextField } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { type OverlayApi, Sheet } from "@ui/overlay";
import { spacing, typeStyle, useTheme } from "@ui/theme";

import { FormFooter } from "./FormFooter";
import { groupPalette } from "./model";
import { SwatchRow, type SwatchValue } from "./Swatches";
import {
  type FormSheetOpenOptions,
  formSheetOptions,
  useCloseWhenGone,
  useSendAction,
  useSessionTree,
} from "./useSheetAction";

export type NewGroupSheetProps = {
  readonly session: SessionStore;
  /** The tab the new group starts with. */
  readonly tabId: TabId;
  /** Closes this sheet (from `openSheet`'s controls). */
  readonly close: () => void;
};

/** The form that makes a group of a loose tab. */
export function NewGroupSheet({ session, tabId, close }: NewGroupSheetProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const { workspace, theme } = useSessionTree(session);
  const tab = workspace === null ? undefined : findTab(workspace, tabId);
  const [name, setName] = useState("");
  const [color, setColor] = useState<SwatchValue>("auto");
  const send = useSendAction(session);
  useCloseWhenGone(tab !== undefined, close);

  const palette = groupPalette(theme);
  const trimmed = name.trim();
  const create = () => {
    if (trimmed === "") {
      return;
    }
    const sent = send((id) =>
      color === "auto" ? newGroup(id, [tabId], trimmed) : newGroup(id, [tabId], trimmed, color),
    );
    if (sent) {
      close();
    }
  };

  return (
    <Sheet
      title={t("new_group.title")}
      {...(tab === undefined ? {} : { subtitle: tab.title })}
      padded
      avoidKeyboard
      testID="new-group-sheet"
      footer={
        <FormFooter
          confirmLabel={t("new_group.create")}
          onConfirm={create}
          onCancel={close}
          confirmDisabled={trimmed === ""}
          testID="new-group"
        />
      }
    >
      <View style={styles.form}>
        <TextField
          label={t("common.group_name")}
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="sentences"
          returnKeyType="done"
          onSubmitEditing={create}
          testID="new-group-field"
        />
        {/* The label is drawn like the field's; the choice reads it as its own name. */}
        <Text
          accessible={false}
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={[typeStyle("section"), { color: colors.textSection }]}
        >
          {t("group_menu.color")}
        </Text>
        <SwatchRow
          palette={palette}
          value={color}
          onChange={setColor}
          withAuto
          accessibilityLabel={t("group_menu.color")}
          testID="new-group-color"
        />
      </View>
    </Sheet>
  );
}

/** Opens "New group with this tab", owned by the session. Returns the sheet id. */
export function openNewGroupSheet(
  overlay: OverlayApi,
  props: { readonly session: SessionStore; readonly tabId: TabId } & FormSheetOpenOptions,
): string {
  const { session, tabId, ...options } = props;
  return overlay.openSheet(
    ({ close }) => <NewGroupSheet session={session} tabId={tabId} close={close} />,
    formSheetOptions(session, options),
  );
}

const styles = StyleSheet.create({
  form: {
    rowGap: spacing.formGap,
  },
});
