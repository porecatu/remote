// SPDX-License-Identifier: GPL-3.0-or-later
// The saved sessions sheet (anatomy §4.12.10, PRD-004 RF-4.12 to RF-4.16),
// opened by the `bookmark` of the workspace bar. Two steps in one sheet:
//
// 1. "Saved sessions": the named sessions of the desktop, in its order. The
//    context line says where a restore goes (`new-window`: a new window;
//    `append`: a window of the desktop). With `new-window` a touch restores
//    right away; with `append` it goes to step 2. A session the desktop
//    cannot read (`readable: false`) is a dimmed row with no touch. States:
//    loading (spinner), empty, failed ("Try again" asks again).
// 2. "Which window?" (`append` only): every window of the desktop, as in
//    "Move to window" (§4.12.5), even when there is only one. A touch
//    restores the session into that window.
//
// The pending mark stays on the touched row (a spinner at the right) and the
// other rows dim and take no touch until the `action-result` (RF-4.9); then
// the sheet closes. The failure notice comes from the session's outcome
// events (`SessionOverlays`), not from here. The app stays on the tree: the
// restored tabs appear with the next `workspace`, and nothing opens in the
// terminal.
//
// The controller (`createSavedSessions`) lives as long as the sheet. Nothing
// is logged: the session names are content.
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { type SavedSessions, createSavedSessions } from "@/controllers/savedSessions";
import { type NamedSession, type RequestId, type SessionId, SessionsMode, type WindowId } from "@/protocol";
import type { SessionStore } from "@/session/sessionStore";
import { Button, Icon, IconButton, ListRow, Spinner } from "@ui/components";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { type OverlayApi, Sheet, useOverlay } from "@ui/overlay";
import { useServices } from "@ui/services/ServicesContext";
import { actionMessageText, actionToastOptions, sendRefusalMessage } from "@ui/session/actionMessages";
import { opacity, size, spacing, typeStyle, useTheme } from "@ui/theme";

import { allWindowChoices } from "./model";
import { type FormSheetOpenOptions, formSheetOptions, useSessionTree } from "./useSheetAction";

export type SavedSessionsSheetProps = {
  readonly session: SessionStore;
  /** Closes this sheet (from `openSheet`'s controls). */
  readonly close: () => void;
};

/** Step 1 lists the sessions; step 2 asks for the window of the session chosen. */
type Step = { readonly kind: "sessions" } | { readonly kind: "windows"; readonly saved: NamedSession };

/** The row awaiting the `action-result`. */
type Restoring = { readonly id: RequestId; readonly row: string };

const sessionRow = (session: SessionId) => `session:${session}`;
const windowRow = (window: WindowId) => `window:${window}`;

/** The saved sessions sheet's content; opened by {@link openSavedSessionsSheet}. */
export function SavedSessionsSheet({ session, close }: SavedSessionsSheetProps) {
  const tr = useT();
  const { t } = tr;
  const { colors } = useTheme();
  const overlay = useOverlay();
  const { scheduler } = useServices();
  const { workspace } = useSessionTree(session);
  const [controller, setController] = useState(() => createSavedSessions({ session, scheduler }));
  /** The last controller this sheet disposed: it can never load again. */
  const disposed = useRef<SavedSessions | null>(null);
  const [step, setStep] = useState<Step>({ kind: "sessions" });
  const [restoring, setRestoring] = useState<Restoring | null>(null);

  // One controller for the life of the sheet, loaded on mount and disposed on
  // unmount. Disposing is final: an effect run twice on mount (StrictMode)
  // finds its controller disposed and puts a new one in its place.
  useEffect(() => {
    if (disposed.current === controller) {
      setController(createSavedSessions({ session, scheduler }));
      return;
    }
    controller.load();
    return () => {
      controller.dispose();
      disposed.current = controller;
    };
  }, [controller, session, scheduler]);

  const state = useStoreState(controller.store, (current) => current);
  const finished = useStoreState(
    session.store,
    (current) => restoring !== null && !current.requests.pending.has(restoring.id),
  );
  useEffect(() => {
    if (finished) {
      close();
    }
  }, [close, finished]);

  const restore = (row: string, saved: SessionId, window?: WindowId) => {
    if (restoring !== null) {
      return;
    }
    const result = controller.restore(saved, window);
    if (result.ok) {
      setRestoring({ id: result.id, row });
      return;
    }
    const notice = sendRefusalMessage(result);
    if (notice !== null) {
      overlay.showToast(actionMessageText(notice, t), actionToastOptions(notice));
    }
  };

  const retry = () => {
    controller.load();
  };

  const footer = (
    <View style={styles.footer}>
      <Button label={t("common.cancel")} variant="secondary" onPress={close} testID="saved-sessions-cancel" />
    </View>
  );

  // The state of a row while a restore waits: its own spinner, the others dimmed.
  const rowState = (row: string) => ({
    pending: restoring?.row === row,
    dimmed: restoring !== null && restoring.row !== row,
  });

  if (step.kind === "windows") {
    const { saved } = step;
    const windows = workspace === null ? [] : allWindowChoices(workspace);
    return (
      <Sheet
        title={t("saved_sessions.choose_window_title")}
        subtitle={saved.name}
        footer={footer}
        testID="saved-sessions-sheet"
      >
        <View style={styles.back}>
          <IconButton
            icon="chevron-left"
            accessibilityLabel={t("saved_sessions.back")}
            onPress={() => {
              setStep({ kind: "sessions" });
            }}
            disabled={restoring !== null}
            testID="saved-sessions-back"
          />
        </View>
        <View>
          {windows.map((win) => {
            const count = tr.tn("workspace.tab_count", win.tabCount);
            const row = rowState(windowRow(win.window));
            return (
              <View key={win.window} style={row.dimmed ? styles.dimmed : undefined}>
                <ListRow
                  title={win.title}
                  subtitle={count}
                  accessibilityLabel={[win.title, count].join(t("a11y.separator"))}
                  onPress={() => {
                    restore(windowRow(win.window), saved.session, win.window);
                  }}
                  disabled={row.dimmed}
                  pending={row.pending}
                  {...(row.pending
                    ? { trailing: <Spinner testID={`saved-sessions-window-${win.window}-spinner`} /> }
                    : {})}
                  testID={`saved-sessions-window-${win.window}`}
                />
              </View>
            );
          })}
        </View>
      </Sheet>
    );
  }

  let subtitle: string | undefined;
  let body;
  if (state.status === "loading") {
    body = (
      <View style={styles.loading} testID="saved-sessions-loading">
        <Spinner accessibilityLabel={t("a11y.loading")} />
      </View>
    );
  } else if (state.status === "failed") {
    body = (
      <View style={styles.message} testID="saved-sessions-failed">
        <Text style={[typeStyle("body"), { color: colors.textSecondary }]}>{t("saved_sessions.failed")}</Text>
        <Button label={t("common.retry")} variant="text" onPress={retry} testID="saved-sessions-retry" />
      </View>
    );
  } else if (state.list.length === 0) {
    body = (
      <View style={styles.message} testID="saved-sessions-empty">
        <Text style={[typeStyle("body"), { color: colors.textSecondary }]}>{t("saved_sessions.empty")}</Text>
        <Text style={[typeStyle("secondary"), { color: colors.textTertiary }]}>
          {t("saved_sessions.empty_hint")}
        </Text>
      </View>
    );
  } else {
    const append = state.mode === SessionsMode.append;
    subtitle = append ? t("saved_sessions.context_append") : t("saved_sessions.context_new_window");
    body = (
      <View>
        {state.list.map((saved) => {
          if (!saved.readable) {
            return (
              <ListRow
                key={saved.session}
                title={saved.name}
                subtitle={t("saved_sessions.unreadable")}
                subtitleColor="textTertiary"
                accessibilityLabel={[saved.name, t("saved_sessions.a11y_unavailable")].join(t("a11y.separator"))}
                disabled
                testID={`saved-session-${saved.session}`}
              />
            );
          }
          const row = rowState(sessionRow(saved.session));
          const label = append
            ? [saved.name, t("saved_sessions.a11y_choose_window")].join(t("a11y.separator"))
            : saved.name;
          const trailing = row.pending ? (
            <Spinner testID={`saved-session-${saved.session}-spinner`} />
          ) : append ? (
            <Icon
              name="chevron-right"
              role="chevron"
              color="textSecondary"
              testID={`saved-session-${saved.session}-chevron`}
            />
          ) : undefined;
          return (
            <View key={saved.session} style={row.dimmed ? styles.dimmed : undefined}>
              <ListRow
                title={saved.name}
                accessibilityLabel={label}
                onPress={() => {
                  if (append) {
                    setStep({ kind: "windows", saved });
                  } else {
                    restore(sessionRow(saved.session), saved.session);
                  }
                }}
                disabled={row.dimmed}
                pending={row.pending}
                {...(trailing === undefined ? {} : { trailing })}
                testID={`saved-session-${saved.session}`}
              />
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <Sheet
      title={t("saved_sessions.title")}
      {...(subtitle === undefined ? {} : { subtitle })}
      footer={footer}
      testID="saved-sessions-sheet"
    >
      {body}
    </Sheet>
  );
}

/** Opens the saved sessions sheet, owned by its session (it closes when the desktop restarts). Returns the sheet id. */
export function openSavedSessionsSheet(
  overlay: OverlayApi,
  props: { readonly session: SessionStore } & FormSheetOpenOptions,
): string {
  const { session, ...options } = props;
  return overlay.openSheet(
    ({ close }) => <SavedSessionsSheet session={session} close={close} />,
    formSheetOptions(session, options),
  );
}

const styles = StyleSheet.create({
  loading: {
    minHeight: size.rowSingle,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.rowPaddingY,
  },
  message: {
    alignItems: "center",
    rowGap: spacing.rowInlineGap,
    paddingHorizontal: spacing.sheetPaddingX,
    paddingVertical: spacing.rowPaddingY,
  },
  back: {
    alignItems: "flex-start",
    paddingHorizontal: spacing.barPaddingX,
  },
  dimmed: {
    opacity: opacity.pending,
  },
  footer: {
    alignItems: "center",
    paddingTop: spacing.formGap,
  },
});
