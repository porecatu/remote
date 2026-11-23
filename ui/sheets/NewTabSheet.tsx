// SPDX-License-Identifier: GPL-3.0-or-later
// The new tab sheet (anatomy §4.12.8, PRD-004 RF-4.1, RF-4.9), opened by the
// "New tab" rows of the tree, of a window or of a group: the context line
// ("In Window 1", "In group G"), the "Profile" section with a single choice
// of the desktop's profiles (name, type chip and, on the default one, the
// "Default" mark; the default comes first and starts chosen) and the primary
// "Create tab" button fixed at the end. Without `profiles` yet, a spinner.
//
// "Create tab" sends `new-tab` with the chosen profile and the group: from a
// group, its id (the tab is born at its end); from the window row, `null` (a
// loose tab at the end of the track, whatever the group of the desktop's
// active tab). The button turns into a spinner until
// the `action-result`, and the sheet closes when it comes; opening the new tab
// in the app (on `created`) and the error snackbar are handled centrally. The
// button also waits while another action on the window or group is pending
// (RF-4.9). If the window or group leaves the tree, the sheet closes.
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { sessionOwner } from "@/controllers/overlay";
import type { Translator } from "@/i18n/catalog";
import {
  type GroupId,
  type Profile,
  type ProfileId,
  ProfileKind,
  type Profiles,
  type RequestId,
  type WindowId,
} from "@/protocol";
import { newTab, type ItemRef } from "@/session/actions";
import { isItemPending } from "@/session/requests";
import type { SessionState } from "@/session/sessionStore";
import { Badge, Button, RadioGroup, SectionLabel, Spinner, type RadioOption } from "@ui/components";
import { shallowEqual, useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { Sheet, useOverlay, type FocusOrigin, type OverlayApi, type OverlayControls } from "@ui/overlay";
import { size, spacing, typeStyle, useTheme } from "@ui/theme";

import { sendOrWarn, windowNumber, type SheetSession } from "./menus/shared";
import { useRetained } from "./menus/useRetained";
import { findGroup } from "./model";

export type NewTabProps = {
  readonly session: SheetSession;
  readonly windowId: WindowId;
  /** From a group's "New tab" row: the tab is born at the end of this group. */
  readonly groupId?: GroupId;
  /** The element that opened the sheet: it gets the screen reader focus back on close. */
  readonly origin?: FocusOrigin;
};

export type NewTabSheetProps = NewTabProps & {
  /** Closes this sheet (from `openSheet`'s controls). */
  readonly close: OverlayControls["close"];
};

/** Where the new tab goes, from the last tree. */
export type NewTabContext = {
  /** "Window N", from 1. */
  readonly windowNumber: number;
  /** The group's name when opened from a group. */
  readonly groupName: string | null;
};

/** The sheet's context; `undefined` when the window (or the group) left the tree. */
export function newTabContext(
  state: Pick<SessionState, "workspace">,
  windowId: WindowId,
  groupId?: GroupId,
): NewTabContext | undefined {
  const { workspace } = state;
  if (workspace === null) {
    return undefined;
  }
  const number = windowNumber(workspace, windowId);
  if (number === 0) {
    return undefined;
  }
  if (groupId === undefined) {
    return { windowNumber: number, groupName: null };
  }
  const found = findGroup(workspace, groupId);
  if (found === undefined || found.window !== windowId) {
    return undefined;
  }
  return { windowNumber: number, groupName: found.group.name };
}

/** The profiles in the sheet's order: the default first, then the others as the desktop sent them. */
export function orderProfiles(profiles: Profiles): readonly Profile[] {
  const first = profiles.list.filter((profile) => profile.id === profiles.defaultProfile);
  const rest = profiles.list.filter((profile) => profile.id !== profiles.defaultProfile);
  return [...first, ...rest];
}

/** The type chip of a profile ("local", "ssh", "wsl", "other"). */
export function profileKindLabel(kind: Profile["kind"], tr: Pick<Translator, "t">): string {
  switch (kind) {
    case ProfileKind.local:
      return tr.t("new_tab.kind_local");
    case ProfileKind.ssh:
      return tr.t("new_tab.kind_ssh");
    case ProfileKind.wsl:
      return tr.t("new_tab.kind_wsl");
    case ProfileKind.other:
      return tr.t("new_tab.kind_other");
  }
}

/** The composed label of a profile row: name, type and, on the default, "Default". */
export function profileAccessibilityLabel(
  profile: Profile,
  isDefault: boolean,
  tr: Pick<Translator, "t">,
): string {
  const parts = [profile.name, profileKindLabel(profile.kind, tr)];
  if (isDefault) {
    parts.push(tr.t("new_tab.default"));
  }
  return parts.join(tr.t("a11y.separator"));
}

/** The new tab sheet's content; opened by {@link openNewTabSheet}. */
export function NewTabSheet({ session, windowId, groupId, close }: NewTabSheetProps) {
  const tr = useT();
  const { t } = tr;
  const { colors } = useTheme();
  const overlay = useOverlay();
  const profiles = useStoreState(session.store, (state) => state.profiles);
  const current = useStoreState(
    session.store,
    (state) => newTabContext(state, windowId, groupId),
    shallowEqual,
  );
  const context = useRetained(current);
  const [chosen, setChosen] = useState<ProfileId | null>(null);
  const [creating, setCreating] = useState<RequestId | null>(null);
  const target: ItemRef =
    groupId === undefined ? { kind: "window", id: windowId } : { kind: "group", id: groupId };
  const targetPending = useStoreState(session.store, (state) => isItemPending(state.requests, target));
  const created = useStoreState(
    session.store,
    (state) => creating !== null && !state.requests.pending.has(creating),
  );
  const gone = current === undefined && creating === null;

  useEffect(() => {
    if (created || gone) {
      close();
    }
  }, [close, created, gone]);

  const ordered = profiles === null ? null : orderProfiles(profiles);
  // The choice survives a new `profiles` while its profile is still there;
  // otherwise the default (first) is chosen again.
  const selected =
    ordered === null
      ? null
      : chosen !== null && ordered.some((profile) => profile.id === chosen)
        ? chosen
        : (ordered[0]?.id ?? null);

  const subtitle =
    context === undefined
      ? undefined
      : context.groupName === null
        ? t("new_tab.context_window", { number: context.windowNumber })
        : t("new_tab.context_group", { group: context.groupName });

  const onCreate = () => {
    if (selected === null) {
      return;
    }
    const result = sendOrWarn(session, overlay, tr, (id) =>
      newTab(id, windowId, { profile: selected, group: groupId ?? null }),
    );
    if (result.ok) {
      setCreating(result.id);
    }
  };

  const options: RadioOption<ProfileId>[] = (ordered ?? []).map((profile) => {
    const isDefault = profiles !== null && profile.id === profiles.defaultProfile;
    return {
      value: profile.id,
      title: profile.name,
      titleAccessory: <Badge label={profileKindLabel(profile.kind, tr)} font="mono" />,
      ...(isDefault
        ? {
            titleEnd: (
              <Text style={[typeStyle("chip"), { color: colors.accentText }]}>{t("new_tab.default")}</Text>
            ),
          }
        : {}),
      accessibilityLabel: profileAccessibilityLabel(profile, isDefault, tr),
      testID: `new-tab-profile-${profile.id}`,
    };
  });

  const footer = (
    <Button
      label={t("new_tab.create")}
      onPress={onCreate}
      width="full"
      disabled={selected === null}
      loading={creating !== null || targetPending}
      testID="new-tab-create"
    />
  );

  return (
    <Sheet
      title={t("common.new_tab")}
      {...(subtitle === undefined ? {} : { subtitle })}
      footer={footer}
      testID="new-tab-sheet"
    >
      <SectionLabel label={t("new_tab.profile_section")} first />
      {ordered === null ? (
        <View style={styles.loading} testID="new-tab-loading">
          <Spinner />
          <Text style={[typeStyle("secondary"), { color: colors.textSecondary }]}>
            {t("new_tab.loading_profiles")}
          </Text>
        </View>
      ) : (
        <RadioGroup
          accessibilityLabel={t("new_tab.profile_section")}
          options={options}
          value={selected}
          onChange={setChosen}
          testID="new-tab-profiles"
        />
      )}
    </Sheet>
  );
}

/** Opens the new tab sheet, owned by its session. Returns the sheet id. */
export function openNewTabSheet(overlay: OverlayApi, props: NewTabProps): string {
  return overlay.openSheet(({ close }) => <NewTabSheet {...props} close={close} />, {
    owner: sessionOwner(props.session.desktopId),
    ...(props.origin === undefined ? {} : { origin: props.origin }),
  });
}

const styles = StyleSheet.create({
  loading: {
    minHeight: size.rowSingle,
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.rowIconGap,
    paddingHorizontal: spacing.rowPaddingX,
    paddingVertical: spacing.rowPaddingY,
  },
});
