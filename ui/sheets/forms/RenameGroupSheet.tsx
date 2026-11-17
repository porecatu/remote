// SPDX-License-Identifier: GPL-3.0-or-later
// Rename a group (anatomy §4.12.3 "for a group: the same, without the
// restore", PRD-004 RF-4.8): one field with the group name, focused and
// selected, Cancel and Save; an empty name disables Save, and the same name
// sends nothing. The sheet sends and closes; the new name comes in the next
// `workspace` (RF-4.9).
import { useState } from "react";

import type { GroupId } from "@/protocol";
import { renameGroup } from "@/session/actions";
import type { SessionStore } from "@/session/sessionStore";
import { TextField } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { type OverlayApi, Sheet } from "@ui/overlay";

import { findGroup } from "../model";

import { FormFooter } from "./FormFooter";
import {
  type FormSheetOpenOptions,
  formSheetOptions,
  useCloseWhenGone,
  useSendAction,
  useSessionTree,
} from "./useSheetAction";

export type RenameGroupSheetProps = {
  readonly session: SessionStore;
  readonly groupId: GroupId;
  /** Closes this sheet (from `openSheet`'s controls). */
  readonly close: () => void;
};

/** The rename form of a group. */
export function RenameGroupSheet({ session, groupId, close }: RenameGroupSheetProps) {
  const { t } = useT();
  const { workspace } = useSessionTree(session);
  const group = workspace === null ? undefined : findGroup(workspace, groupId)?.group;
  const [opened] = useState(() => group?.name ?? "");
  const [name, setName] = useState(opened);
  const send = useSendAction(session);
  useCloseWhenGone(group !== undefined, close);

  const trimmed = name.trim();
  const save = () => {
    if (trimmed === "") {
      return;
    }
    if (group !== undefined && trimmed === group.name) {
      close();
      return;
    }
    if (send((id) => renameGroup(id, groupId, trimmed))) {
      close();
    }
  };

  return (
    <Sheet
      title={t("common.rename")}
      subtitle={group?.name ?? opened}
      padded
      avoidKeyboard
      testID="rename-group-sheet"
      footer={
        <FormFooter
          confirmLabel={t("common.save")}
          onConfirm={save}
          onCancel={close}
          confirmDisabled={trimmed === ""}
          testID="rename-group"
        />
      }
    >
      <TextField
        label={t("common.group_name")}
        value={name}
        onChangeText={setName}
        autoFocus
        selectTextOnFocus
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={save}
        testID="rename-group-field"
      />
    </Sheet>
  );
}

/** Opens the rename sheet of a group, owned by its session. Returns the sheet id. */
export function openRenameGroupSheet(
  overlay: OverlayApi,
  props: { readonly session: SessionStore; readonly groupId: GroupId } & FormSheetOpenOptions,
): string {
  const { session, groupId, ...options } = props;
  return overlay.openSheet(
    ({ close }) => <RenameGroupSheet session={session} groupId={groupId} close={close} />,
    formSheetOptions(session, options),
  );
}
