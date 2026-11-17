// SPDX-License-Identifier: GPL-3.0-or-later
// Move a tab to a group (anatomy §4.12.4, PRD-004 RF-4.4): a single choice
// list with "No group" on top and the groups of the tab's window (16 color
// swatch, name, tab count). The current choice has the `check`, is disabled
// and reads "current". A touch on another line sends `move-tab-to-group`
// (`null` for "No group") and closes the sheet. With no group in the window
// the list is only "No group", with the note that points to "New group with
// this tab".
import { StyleSheet, Text, View } from "react-native";

import type { GroupId, TabId } from "@/protocol";
import { moveTabToGroup } from "@/session/actions";
import type { SessionStore } from "@/session/sessionStore";
import { findTab } from "@/workspace/selectors";
import { Icon, ListRow } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { type OverlayApi, Sheet } from "@ui/overlay";
import { resolveGroupColor } from "@ui/screens/workspace/rows/rowModel";
import { spacing, typeStyle, useTheme } from "@ui/theme";

import { groupChoices } from "./model";
import { SmallSwatch } from "./Swatches";
import {
  type FormSheetOpenOptions,
  formSheetOptions,
  useCloseWhenGone,
  useSendAction,
  useSessionTree,
} from "./useSheetAction";

export type MoveTabToGroupSheetProps = {
  readonly session: SessionStore;
  readonly tabId: TabId;
  /** Closes this sheet (from `openSheet`'s controls). */
  readonly close: () => void;
};

/** The "Move to group" choice of a tab. */
export function MoveTabToGroupSheet({ session, tabId, close }: MoveTabToGroupSheetProps) {
  const { t, tn } = useT();
  const { colors } = useTheme();
  const { workspace, theme } = useSessionTree(session);
  const tab = workspace === null ? undefined : findTab(workspace, tabId);
  const choices = workspace === null ? undefined : groupChoices(workspace, tabId);
  const send = useSendAction(session);
  useCloseWhenGone(choices !== undefined, close);

  const current = choices?.current ?? null;
  const separator = t("a11y.separator");
  const choose = (group: GroupId | null) => {
    if (send((id) => moveTabToGroup(id, tabId, group))) {
      close();
    }
  };
  const check = (testID: string) => <Icon name="check" role="inline" color="accent" testID={testID} />;
  const label = (parts: readonly string[], isCurrent: boolean) =>
    [...parts, ...(isCurrent ? [t("move.current")] : [])].join(separator);

  const noGroupCurrent = current === null;
  const groups = choices?.groups ?? [];

  return (
    <Sheet
      title={t("move.to_group_title")}
      {...(tab === undefined ? {} : { subtitle: tab.title })}
      testID="move-to-group-sheet"
    >
      {/* A container, not an accessibility element: each line stays its own radio (see `RadioGroup`). */}
      <View
        accessible={false}
        accessibilityRole="radiogroup"
        accessibilityLabel={t("move.to_group_title")}
        testID="move-to-group-choices"
      >
        <ListRow
          title={t("move.no_group")}
          titleVariant="body"
          leading={<SmallSwatch rgb={null} />}
          {...(noGroupCurrent ? { trailing: check("move-to-group-none-check") } : {})}
          accessibilityRole="radio"
          accessibilityLabel={label([t("move.no_group")], noGroupCurrent)}
          checked={noGroupCurrent}
          disabled={noGroupCurrent}
          onPress={() => choose(null)}
          testID="move-to-group-none"
        />
        {groups.map((group) => {
          const isCurrent = group.group === current;
          const count = tn("workspace.tab_count", group.tabCount);
          return (
            <ListRow
              key={group.group}
              title={group.name}
              subtitle={count}
              leading={<SmallSwatch rgb={resolveGroupColor(theme, group.color)} />}
              {...(isCurrent ? { trailing: check(`move-to-group-${group.group}-check`) } : {})}
              accessibilityRole="radio"
              accessibilityLabel={label([group.name, count], isCurrent)}
              checked={isCurrent}
              disabled={isCurrent}
              onPress={() => choose(group.group)}
              testID={`move-to-group-${group.group}`}
            />
          );
        })}
      </View>
      {choices !== undefined && groups.length === 0 ? (
        <Text style={[typeStyle("secondary"), styles.note, { color: colors.textSecondary }]}>
          {t("move.no_groups_note")}
        </Text>
      ) : null}
    </Sheet>
  );
}

/** Opens "Move to group" for a tab, owned by its session. Returns the sheet id. */
export function openMoveTabToGroupSheet(
  overlay: OverlayApi,
  props: { readonly session: SessionStore; readonly tabId: TabId } & FormSheetOpenOptions,
): string {
  const { session, tabId, ...options } = props;
  return overlay.openSheet(
    ({ close }) => <MoveTabToGroupSheet session={session} tabId={tabId} close={close} />,
    formSheetOptions(session, options),
  );
}

const styles = StyleSheet.create({
  note: {
    paddingHorizontal: spacing.sheetPaddingX,
    paddingVertical: spacing.rowPaddingY,
  },
});
