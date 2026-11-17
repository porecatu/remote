// SPDX-License-Identifier: GPL-3.0-or-later
// Move a tab or a group to another window (anatomy §4.12.5, PRD-004 RF-4.5,
// RF-4.8): the list of the **other** windows (the one it is in does not
// show), each named by the title of its active tab, like the desktop's "Move
// to window…", with its tab count. There is no "new window" in v1. A touch
// sends `move-tab-to-window` or `move-group-to-window` and closes the sheet.
// The menus dim the item when the desktop has one window; if the other
// windows close while the sheet is open, it says so.
import { StyleSheet, Text, View } from "react-native";

import type { WindowId } from "@/protocol";
import { moveGroupToWindow, moveTabToWindow } from "@/session/actions";
import type { SessionStore } from "@/session/sessionStore";
import { findTab } from "@/workspace/selectors";
import { ListRow } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { type OverlayApi, Sheet } from "@ui/overlay";
import { spacing, typeStyle, useTheme } from "@ui/theme";

import { findGroup } from "../model";
import { type MoveTarget, windowChoices } from "./model";
import {
  type FormSheetOpenOptions,
  formSheetOptions,
  useCloseWhenGone,
  useSendAction,
  useSessionTree,
} from "./useSheetAction";

export type MoveToWindowSheetProps = {
  readonly session: SessionStore;
  /** The tab or the group to move. */
  readonly target: MoveTarget;
  /** Closes this sheet (from `openSheet`'s controls). */
  readonly close: () => void;
};

/** The "Move to window" choice of a tab or a group. */
export function MoveToWindowSheet({ session, target, close }: MoveToWindowSheetProps) {
  const { t, tn } = useT();
  const { colors } = useTheme();
  const { workspace } = useSessionTree(session);
  const windows = workspace === null ? undefined : windowChoices(workspace, target);
  const send = useSendAction(session);
  useCloseWhenGone(windows !== undefined, close);

  const subtitle =
    workspace === null
      ? undefined
      : target.kind === "tab"
        ? findTab(workspace, target.id)?.title
        : findGroup(workspace, target.id)?.group.name;
  const choose = (window: WindowId) => {
    const sent = send((id) =>
      target.kind === "tab" ? moveTabToWindow(id, target.id, window) : moveGroupToWindow(id, target.id, window),
    );
    if (sent) {
      close();
    }
  };

  return (
    <Sheet
      title={t("move.to_window_title")}
      {...(subtitle === undefined ? {} : { subtitle })}
      testID="move-to-window-sheet"
    >
      <View>
        {(windows ?? []).map((win) => {
          const count = tn("workspace.tab_count", win.tabCount);
          return (
            <ListRow
              key={win.window}
              title={win.title}
              subtitle={count}
              accessibilityLabel={[win.title, count].join(t("a11y.separator"))}
              onPress={() => choose(win.window)}
              testID={`move-to-window-${win.window}`}
            />
          );
        })}
      </View>
      {windows !== undefined && windows.length === 0 ? (
        <Text style={[typeStyle("secondary"), styles.note, { color: colors.textSecondary }]}>
          {t("tab_menu.single_window_note")}
        </Text>
      ) : null}
    </Sheet>
  );
}

/** Opens "Move to window" for a tab or a group, owned by its session. Returns the sheet id. */
export function openMoveToWindowSheet(
  overlay: OverlayApi,
  props: { readonly session: SessionStore; readonly target: MoveTarget } & FormSheetOpenOptions,
): string {
  const { session, target, ...options } = props;
  return overlay.openSheet(
    ({ close }) => <MoveToWindowSheet session={session} target={target} close={close} />,
    formSheetOptions(session, options),
  );
}

const styles = StyleSheet.create({
  note: {
    paddingHorizontal: spacing.sheetPaddingX,
    paddingVertical: spacing.rowPaddingY,
  },
});
