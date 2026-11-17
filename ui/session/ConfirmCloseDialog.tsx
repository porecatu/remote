// SPDX-License-Identifier: GPL-3.0-or-later
// The close confirmation (anatomy §4.13, PRD-004 RF-4.2): the desktop asks the
// phone that asked to close a tab or a pane, because closing kills something.
// A central dialog of the overlay layer with:
// - the title with the tab (or pane) title in quotes;
// - the reason: processes running, with up to five names in `type.mono-body`
//   indented by `dialog.list-indent` and "and N more" after them, or an open
//   SSH connection; the pane wording when the action was `close-pane`;
// - on a pinned tab (or a pane of one), the note that the tab also gets
//   unpinned on the computer, `dialog.gap` under the reason: the desktop
//   always asks before closing a pinned tab, and one with nothing alive comes
//   as `running-process` with no processes, which shows only the note
//   (spec 03 §7);
// - Cancel (initial focus, and what the back button answers) and Close tab or
//   Close pane (destructive, no background);
// - the deadline under the buttons: "N s left to answer" (`type.secondary`,
//   `text.tertiary`) over a bar of `deadline.height` (track `border.row`,
//   fill `accent`) that empties over the 60 s; announced at the opening.
//
// The dialog does not close itself at the deadline: the session store drops
// the confirmation, and `SessionOverlays` closes the dialog and says nothing
// was closed. Opened with `useOverlay().openDialog(confirmCloseDialog(…))`, a
// live dialog: its texts follow a change of language while it is open.
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Translator } from "@/i18n/catalog";
import { ConfirmKind, type PaneId, type TabId } from "@/protocol";
import type { Clock, Scheduler } from "@/session/clock";
import { type PendingConfirm, confirmRemainingMs } from "@/session/confirm";
import type { SessionState } from "@/session/sessionStore";
import { leafPanes } from "@/workspace/layout";
import { findPaneOwner, findTab, tabsOf } from "@/workspace/selectors";
import type { DialogProps, LiveDialogDescriptor } from "@ui/overlay";
import { useT } from "@ui/i18n/LocaleProvider";
import { size, spacing, typeStyle, useTheme } from "@ui/theme";

/** Process names listed before "and N more" (§4.13). */
export const MAX_LISTED_PROCESSES = 5;

const MS_PER_SECOND = 1000;

/** What the confirmation would close. */
export type ConfirmTarget = {
  readonly kind: "tab" | "pane";
  /** The title to quote; null when the tree does not have it (the generic title is used). */
  readonly title: string | null;
  /** A pane with no title: its position from 1, quoted as "Pane N" in the current language. */
  readonly untitledPane?: number;
  /** The tab (or the tab of the pane) is pinned: closing it also unpins it on the desktop. */
  readonly pinned: boolean;
};

/** The tab is in the pinned zone of its window. */
function isPinnedTab(state: SessionState, tab: TabId): boolean {
  return state.workspace?.windows.some((win) => win.pinned.some((item) => item.tab === tab)) ?? false;
}

/** The tab title, or null when the tab is not in the tree or has no title. */
function tabTitle(state: SessionState, tab: TabId): string | null {
  if (state.workspace === null) {
    return null;
  }
  const title = findTab(state.workspace, tab)?.title ?? "";
  return title === "" ? null : title;
}

/** The pane of the confirmation: its title, its position when it has none, or neither when the tree does not have it. */
function paneTarget(state: SessionState, pane: PaneId): ConfirmTarget {
  const unknown: ConfirmTarget = { kind: "pane", title: null, pinned: false };
  const workspace = state.workspace;
  if (workspace === null) {
    return unknown;
  }
  const owner = findPaneOwner(workspace, pane);
  const win = owner === undefined ? undefined : workspace.windows.find((item) => item.id === owner.window);
  const tab = win === undefined ? undefined : tabsOf(win).find((item) => item.tab === owner?.tab);
  if (tab === undefined) {
    return unknown;
  }
  const panes = leafPanes(tab.layout);
  const index = panes.findIndex((item) => item.pane === pane);
  const found = panes[index];
  if (found === undefined) {
    return unknown;
  }
  const pinned = isPinnedTab(state, tab.tab);
  return found.title === ""
    ? { kind: "pane", title: null, untitledPane: index + 1, pinned }
    : { kind: "pane", title: found.title, pinned };
}

/**
 * What a confirmation is about, from the pending action it confirms: `close-pane`
 * is about a pane, anything else (`close-tab`) about a tab.
 */
export function confirmTarget(state: SessionState, confirm: PendingConfirm): ConfirmTarget {
  const body = state.requests.pending.get(confirm.id)?.action.do;
  if (body?.type === "close-pane") {
    return paneTarget(state, body.pane);
  }
  if (body?.type === "close-tab") {
    return { kind: "tab", title: tabTitle(state, body.tab), pinned: isPinnedTab(state, body.tab) };
  }
  return { kind: "tab", title: null, pinned: false };
}

/** The dialog title. */
export function confirmTitle(target: ConfirmTarget, t: Translator["t"]): string {
  if (target.untitledPane !== undefined) {
    return t("confirm_close.title_pane", { title: t("panes.untitled", { index: target.untitledPane }) });
  }
  if (target.title === null) {
    return t(target.kind === "pane" ? "confirm_close.title_pane_generic" : "confirm_close.title_tab_generic");
  }
  return t(target.kind === "pane" ? "confirm_close.title_pane" : "confirm_close.title_tab", {
    title: target.title,
  });
}

/** Whole seconds left, rounded up (60 at the opening, 1 in the last second). */
export function secondsLeft(remainingMs: number): number {
  return Math.ceil(Math.max(0, remainingMs) / MS_PER_SECOND);
}

type BodyProps = {
  readonly confirm: PendingConfirm;
  readonly target: ConfirmTarget["kind"];
  /** The tab is pinned: the note that it gets unpinned too. */
  readonly pinned?: boolean;
};

/**
 * The reason, the process list when processes are running, and the unpin
 * note of a pinned tab. A pinned tab with nothing alive (`running-process`
 * without processes) shows only the note.
 */
export function ConfirmCloseBody({ confirm, target, pinned = false }: BodyProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const running = confirm.kind === ConfirmKind.runningProcess;
  const showReason = !(pinned && running && confirm.processes.length === 0);
  const reason = running
    ? t(target === "pane" ? "confirm_close.running_process_pane" : "confirm.running-process")
    : t(target === "pane" ? "confirm_close.ssh_connection_pane" : "confirm.ssh-connection");
  const listed = running ? confirm.processes.slice(0, MAX_LISTED_PROCESSES) : [];
  const more = running ? confirm.processes.length - listed.length : 0;
  return (
    <View testID="confirm-close-body">
      {showReason ? <Text style={[typeStyle("body"), { color: colors.textBody }]}>{reason}</Text> : null}
      {listed.length > 0 ? (
        <View style={styles.list} testID="confirm-close-processes">
          {listed.map((name, index) => (
            <Text key={index} style={[typeStyle("monoBody"), { color: colors.textBody }]}>
              {name}
            </Text>
          ))}
          {more > 0 ? (
            <Text style={[typeStyle("secondary"), { color: colors.textSecondary }]}>
              {t("confirm_close.more_processes", { count: more })}
            </Text>
          ) : null}
        </View>
      ) : null}
      {pinned ? (
        <Text
          style={[typeStyle("body"), { color: colors.textBody }, showReason ? styles.note : null]}
          testID="confirm-close-pinned-note"
        >
          {t("confirm_close.pinned_note")}
        </Text>
      ) : null}
    </View>
  );
}

type DeadlineProps = {
  readonly confirm: PendingConfirm;
  readonly clock: Clock;
  readonly scheduler: Scheduler;
};

/** "N s left to answer" over the bar that empties; one update per second. */
export function ConfirmDeadline({ confirm, clock, scheduler }: DeadlineProps) {
  const { tn, t } = useT();
  const { colors } = useTheme();
  const [remaining, setRemaining] = useState(() => confirmRemainingMs(confirm, clock.now()));

  useEffect(() => {
    let handle: unknown = null;
    // Wakes at the next whole second, where the label changes.
    const schedule = (left: number) => {
      handle =
        left <= 0 ? null : scheduler.set(update, left % MS_PER_SECOND === 0 ? MS_PER_SECOND : left % MS_PER_SECOND);
    };
    function update(): void {
      const left = confirmRemainingMs(confirm, clock.now());
      setRemaining(left);
      schedule(left);
    }
    schedule(confirmRemainingMs(confirm, clock.now()));
    return () => {
      if (handle !== null) {
        scheduler.clear(handle);
      }
    };
  }, [confirm, clock, scheduler]);

  const total = Math.max(1, confirm.expiresAt - confirm.receivedAt);
  const seconds = secondsLeft(remaining);
  const totalSeconds = secondsLeft(total);
  const label = tn("confirm_close.time_left", seconds);
  return (
    <View
      style={styles.deadline}
      testID="confirm-close-deadline"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t("confirm_close.deadline")}
      accessibilityValue={{ min: 0, max: totalSeconds, now: seconds, text: label }}
    >
      <Text style={[typeStyle("secondary"), { color: colors.textTertiary }]}>{label}</Text>
      <View style={[styles.track, { backgroundColor: colors.borderRow }]}>
        <View
          testID="confirm-close-deadline-fill"
          style={[
            styles.fill,
            { backgroundColor: colors.accent, width: `${Math.min(1, remaining / total) * 100}%` },
          ]}
        />
      </View>
    </View>
  );
}

export type ConfirmCloseDialogOptions = {
  readonly confirm: PendingConfirm;
  readonly target: ConfirmTarget;
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  /** Close (`true`) or Cancel and the back button (`false`): `SessionStore.answerConfirm`. */
  readonly onAnswer: (accept: boolean) => void;
};

/** The props of the dialog in a language. */
export function confirmCloseDialogProps(
  { confirm, target, clock, scheduler, onAnswer }: ConfirmCloseDialogOptions,
  { t, tn }: Translator,
): DialogProps {
  return {
    title: confirmTitle(target, t),
    body: <ConfirmCloseBody confirm={confirm} target={target.kind} pinned={target.pinned} />,
    footer: <ConfirmDeadline confirm={confirm} clock={clock} scheduler={scheduler} />,
    buttons: [
      {
        label: t("common.cancel"),
        variant: "secondary",
        role: "cancel",
        onPress: () => onAnswer(false),
        testID: "confirm-close-cancel",
      },
      {
        label: t(target.kind === "pane" ? "common.close_pane" : "common.close_tab"),
        variant: "destructiveText",
        onPress: () => onAnswer(true),
        testID: "confirm-close-accept",
      },
    ],
    initialFocus: 0,
    announcement: tn(
      "confirm_close.deadline_announce",
      secondsLeft(confirmRemainingMs(confirm, clock.now())),
    ),
    testID: "confirm-close-dialog",
  };
}

/** The live descriptor of the dialog (without its owner, which the caller sets): it speaks the current language. */
export function confirmCloseDialog(options: ConfirmCloseDialogOptions): LiveDialogDescriptor {
  return {
    useProps: () => confirmCloseDialogProps(options, useT()),
  };
}

const styles = StyleSheet.create({
  list: {
    paddingLeft: spacing.dialogListIndent,
  },
  note: {
    marginTop: spacing.dialogGap,
  },
  deadline: {
    rowGap: spacing.dialogGap,
  },
  track: {
    height: size.deadlineHeight,
    overflow: "hidden",
  },
  fill: {
    height: size.deadlineHeight,
  },
});
