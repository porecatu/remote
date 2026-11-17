// SPDX-License-Identifier: GPL-3.0-or-later
// The color of a group (anatomy §4.12.7, PRD-004 RF-4.8): the swatch row of
// §4.12.6 without "Automatic", with the current color marked (ring and
// `check`). The choice is immediate: a touch sends `set-group-color` and
// closes the sheet; touching the current color only closes it.
import type { GroupId } from "@/protocol";
import { setGroupColor } from "@/session/actions";
import type { SessionStore } from "@/session/sessionStore";
import { useT } from "@ui/i18n/LocaleProvider";
import { type OverlayApi, Sheet } from "@ui/overlay";

import { findGroup } from "../model";
import { groupPalette } from "./model";
import { SwatchRow, type SwatchValue } from "./Swatches";
import {
  type FormSheetOpenOptions,
  formSheetOptions,
  useCloseWhenGone,
  useSendAction,
  useSessionTree,
} from "./useSheetAction";

export type GroupColorSheetProps = {
  readonly session: SessionStore;
  readonly groupId: GroupId;
  /** Closes this sheet (from `openSheet`'s controls). */
  readonly close: () => void;
};

/** The color choice of a group. */
export function GroupColorSheet({ session, groupId, close }: GroupColorSheetProps) {
  const { t } = useT();
  const { workspace, theme } = useSessionTree(session);
  const group = workspace === null ? undefined : findGroup(workspace, groupId)?.group;
  const send = useSendAction(session);
  useCloseWhenGone(group !== undefined, close);

  const choose = (value: SwatchValue) => {
    if (value === "auto") {
      return;
    }
    if (group !== undefined && value === group.color) {
      close();
      return;
    }
    if (send((id) => setGroupColor(id, groupId, value))) {
      close();
    }
  };

  return (
    <Sheet
      title={t("group_color.title")}
      {...(group === undefined ? {} : { subtitle: group.name })}
      padded
      testID="group-color-sheet"
    >
      <SwatchRow
        palette={groupPalette(theme)}
        value={group?.color ?? "auto"}
        onChange={choose}
        accessibilityLabel={t("group_color.title")}
        testID="group-color"
      />
    </Sheet>
  );
}

/** Opens the color choice of a group, owned by its session. Returns the sheet id. */
export function openGroupColorSheet(
  overlay: OverlayApi,
  props: { readonly session: SessionStore; readonly groupId: GroupId } & FormSheetOpenOptions,
): string {
  const { session, groupId, ...options } = props;
  return overlay.openSheet(
    ({ close }) => <GroupColorSheet session={session} groupId={groupId} close={close} />,
    formSheetOptions(session, options),
  );
}
