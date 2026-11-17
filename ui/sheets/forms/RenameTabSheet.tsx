// SPDX-License-Identifier: GPL-3.0-or-later
// Rename a tab (anatomy §4.12.3, PRD-004 RF-4.3): a sheet with one field (the
// current title, focused and selected), Cancel and Save. An empty field
// disables Save: the way to an empty title is "Restore automatic title", the
// text button under the field, shown only when the title is custom, which
// sends `null`. No length limit in the app (the desktop truncates on its
// bar). Saving a custom title unchanged sends nothing (an automatic title
// saved as is does go: it becomes custom). The sheet sends and closes; the
// tree shows the pending mark and the new title comes in the next `workspace`
// (RF-4.9).
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { TabId } from "@/protocol";
import { renameTab } from "@/session/actions";
import type { SessionStore } from "@/session/sessionStore";
import { findTab } from "@/workspace/selectors";
import { Button, TextField } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { type OverlayApi, Sheet } from "@ui/overlay";
import { spacing } from "@ui/theme";

import { FormFooter } from "./FormFooter";
import {
  type FormSheetOpenOptions,
  formSheetOptions,
  useCloseWhenGone,
  useSendAction,
  useSessionTree,
} from "./useSheetAction";

export type RenameTabSheetProps = {
  readonly session: SessionStore;
  readonly tabId: TabId;
  /** Closes this sheet (from `openSheet`'s controls). */
  readonly close: () => void;
};

/** The rename form of a tab. */
export function RenameTabSheet({ session, tabId, close }: RenameTabSheetProps) {
  const { t } = useT();
  const { workspace } = useSessionTree(session);
  const tab = workspace === null ? undefined : findTab(workspace, tabId);
  const [opened] = useState(() => tab?.title ?? "");
  const [title, setTitle] = useState(opened);
  const send = useSendAction(session);
  useCloseWhenGone(tab !== undefined, close);

  const trimmed = title.trim();
  const save = () => {
    if (trimmed === "") {
      return;
    }
    if (tab !== undefined && tab.custom && trimmed === tab.title) {
      close();
      return;
    }
    if (send((id) => renameTab(id, tabId, trimmed))) {
      close();
    }
  };
  const restore = () => {
    if (send((id) => renameTab(id, tabId, null))) {
      close();
    }
  };

  return (
    <Sheet
      title={t("common.rename")}
      subtitle={tab?.title ?? opened}
      padded
      avoidKeyboard
      testID="rename-tab-sheet"
      footer={
        <FormFooter
          confirmLabel={t("common.save")}
          onConfirm={save}
          onCancel={close}
          confirmDisabled={trimmed === ""}
          testID="rename-tab"
        />
      }
    >
      <View style={styles.form}>
        <TextField
          label={t("rename.tab_field")}
          value={title}
          onChangeText={setTitle}
          autoFocus
          selectTextOnFocus
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={save}
          testID="rename-tab-field"
        />
        {tab?.custom === true ? (
          <View style={styles.restore}>
            <Button
              label={t("rename.restore")}
              variant="text"
              onPress={restore}
              testID="rename-tab-restore"
            />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

/** Opens the rename sheet of a tab, owned by its session. Returns the sheet id. */
export function openRenameTabSheet(
  overlay: OverlayApi,
  props: { readonly session: SessionStore; readonly tabId: TabId } & FormSheetOpenOptions,
): string {
  const { session, tabId, ...options } = props;
  return overlay.openSheet(
    ({ close }) => <RenameTabSheet session={session} tabId={tabId} close={close} />,
    formSheetOptions(session, options),
  );
}

const styles = StyleSheet.create({
  form: {
    rowGap: spacing.formGap,
  },
  restore: {
    alignItems: "flex-start",
  },
});
