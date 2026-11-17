// SPDX-License-Identifier: GPL-3.0-or-later
// The desktop list, the first screen (anatomy §4.2; PRD-001 RF-1.12 to
// RF-1.16 and RF-1.20; PRD-002 RF-2.2 to RF-2.4 for what comes back to it).
//
// - Bar: "Desktops", with `plus` (pair a desktop) and `settings`.
// - Bands at the top: the permanent "this device cannot be locked" warning
//   (RF-1.20) with "Open system settings", and the read error of the list with
//   "Try again" (nothing is deleted on its own).
// - Body: three skeleton rows until the first read ends; the empty state with
//   "Pair desktop"; or the list of cards, with pull-to-refresh.
// - Presence (RF-1.13) runs only while the screen has the focus and the app is
//   in the foreground: `setVisible` follows both. Gaining the focus reads the
//   list again, so stores opened elsewhere (the pairing) are followed.
// - Touch (RF-1.14): a desktop online, connecting, in error or with no state
//   yet opens the workspace (its "Connecting" screen tells what happens,
//   including which side to update, RF-2.2). An offline one is tried in place:
//   the label turns "Connecting…" and goes back to "Offline" with the new
//   time, unless the desktop answers, and then the workspace opens.
// - Nothing is logged: names and hosts are content.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { FlatList, Linking, RefreshControl, StyleSheet, View, type ListRenderItem } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { rowStatus, type DesktopsState } from "@/controllers/desktops";
import { selectPersistentWarning, type AppShellState } from "@/controllers/appShell";
import type { LifecycleState } from "@/session/lifecycle";
import type { SessionStore } from "@/session/sessionStore";
import type { Desktop } from "@/storage/desktopList";
import { Banner, Button, ScreenBar, Skeleton, StateView } from "@ui/components";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { type FocusOrigin, useOverlay } from "@ui/overlay";
import { useServices } from "@ui/services/ServicesContext";
import { spacing, useTheme } from "@ui/theme";

import { DesktopRow } from "./DesktopRow";
import { DesktopRowSheet } from "./DesktopRowSheet";
import { openRemoveDesktopDialog } from "./RemoveDesktopDialog";
import { RenameDesktopSheet } from "./RenameDesktopSheet";

/** Rows shown while the list is read (§4.2 "Estado carregando"). */
const SKELETON_ROWS = 3;

/** The desktop answered the attempt: the session is past the relay. */
const ANSWERED: ReadonlySet<LifecycleState> = new Set<LifecycleState>(["greeting", "ready"]);

/** The attempt ended without an answer. */
const ENDED: ReadonlySet<LifecycleState> = new Set<LifecycleState>(["closed", "failed"]);

/** Route of an open desktop (the workspace). */
export function desktopRoute(id: string): string {
  return `/desktop/${id}`;
}

const selectAll = (state: DesktopsState): DesktopsState => state;

const isForeground = (shell: AppShellState): boolean => shell.appState === "active";

const keyOf = (desktop: Desktop): string => desktop.id;

/** The list of paired desktops. */
export function DesktopsScreen() {
  const services = useServices();
  const { desktops: controller, appShell } = services;
  const tr = useT();
  const { t } = tr;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const overlay = useOverlay();

  const state = useStoreState(controller.store, selectAll);
  const warning = useStoreState(appShell.store, selectPersistentWarning);
  const foreground = useStoreState(appShell.store, isForeground);

  // ------------------------------------------------------------ visibility

  // Presence only with the list on screen and the app in the foreground (RF-1.13).
  const focused = useRef(false);
  /** The offline desktop tried in place, and how to stop following it. */
  const attempt = useRef<{ readonly id: string; readonly stop: () => void } | null>(null);

  const stopAttempt = useCallback(() => {
    attempt.current?.stop();
    attempt.current = null;
  }, []);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      controller.setVisible(isForeground(appShell.store.getState()));
      void controller.reload();
      return () => {
        focused.current = false;
        controller.setVisible(false);
        stopAttempt();
      };
    }, [appShell, controller, stopAttempt]),
  );

  useEffect(() => {
    if (focused.current) {
      controller.setVisible(foreground);
    }
  }, [controller, foreground]);

  useEffect(() => stopAttempt, [stopAttempt]);

  // ------------------------------------------------------------ actions

  const openWorkspace = useCallback(
    (id: string) => {
      router.push(desktopRoute(id));
    },
    [router],
  );

  /** Follows an in-place attempt: opens the workspace once the desktop answers. */
  const follow = useCallback(
    (id: string, session: SessionStore) => {
      stopAttempt();
      const check = (): boolean => {
        const phase = session.getState().connection.state;
        if (ANSWERED.has(phase)) {
          stopAttempt();
          openWorkspace(id);
          return true;
        }
        if (ENDED.has(phase)) {
          stopAttempt();
          return true;
        }
        return false;
      };
      const unsubscribe = session.store.subscribe((next, previous) => {
        if (next.connection !== previous.connection) {
          check();
        }
      });
      attempt.current = { id, stop: unsubscribe };
      check();
    },
    [openWorkspace, stopAttempt],
  );

  const onOpen = useCallback(
    (desktop: Desktop) => {
      const status = rowStatus(controller.store.getState(), desktop.id);
      if (status.kind === "not-paired") {
        return;
      }
      const session = controller.open(desktop.id);
      if (session === undefined) {
        return;
      }
      if (status.kind === "offline") {
        follow(desktop.id, session);
      } else {
        stopAttempt();
        openWorkspace(desktop.id);
      }
    },
    [controller, follow, openWorkspace, stopAttempt],
  );

  const onRename = useCallback(
    (desktop: Desktop, origin: FocusOrigin) => {
      overlay.openSheet(
        ({ close }) => (
          <RenameDesktopSheet
            desktop={desktop}
            close={close}
            onSave={(id, name) => controller.rename(id, name)}
            onFailed={() => {
              overlay.showToast(tr.t("desktops.rename_failed"), { severity: "error" });
            }}
          />
        ),
        { origin },
      );
    },
    [controller, overlay, tr],
  );

  const onRemove = useCallback(
    (desktop: Desktop, origin: FocusOrigin) => {
      openRemoveDesktopDialog(overlay, tr, {
        desktop,
        origin,
        onConfirm: (target) => {
          if (attempt.current?.id === target.id) {
            stopAttempt();
          }
          void controller.remove(target.id).then((removed) => {
            if (!removed) {
              overlay.showToast(tr.t("desktops.remove_failed"), { severity: "error" });
            }
          });
        },
      });
    },
    [controller, overlay, stopAttempt, tr],
  );

  const onMenu = useCallback(
    (desktop: Desktop, origin: FocusOrigin) => {
      // The sheet closes before its item opens the next step, which gives the
      // focus back to the same element the sheet came from.
      overlay.openSheet(
        ({ close }) => (
          <DesktopRowSheet
            desktop={desktop}
            close={close}
            onRename={(target) => onRename(target, origin)}
            onRemove={(target) => onRemove(target, origin)}
          />
        ),
        { origin },
      );
    },
    [onRemove, onRename, overlay],
  );

  const onPair = useCallback(() => {
    router.push("/pair");
  }, [router]);

  const onPairAgain = useCallback(() => {
    router.push("/pair");
  }, [router]);

  const onRefresh = useCallback(() => {
    void controller.refresh();
  }, [controller]);

  // ------------------------------------------------------------ render

  // Wall clock of this render. The list re-renders at least on every presence
  // round (every 30 s on screen), which keeps "3 min ago" current.
  const nowMs = Date.parse(services.nowIso());

  const renderItem: ListRenderItem<Desktop> = ({ item }) => (
    <DesktopRow
      desktop={item}
      status={rowStatus(state, item.id)}
      nowMs={nowMs}
      onOpen={onOpen}
      onMenu={onMenu}
      onRename={onRename}
      onRemove={onRemove}
      onPairAgain={onPairAgain}
      onRefresh={onRefresh}
      testID={`desktop-${item.id}`}
    />
  );

  let body;
  if (!state.loaded) {
    body = (
      <View style={styles.list}>
        <Skeleton rows={SKELETON_ROWS} testID="desktops-skeleton" />
      </View>
    );
  } else if (state.desktops.length === 0) {
    // After a failed read the list is not known to be empty: only the band shows.
    body = state.loadError ? null : (
      <StateView
        icon="monitor-smartphone"
        title={t("desktops.empty_title")}
        body={t("desktops.empty_body")}
        actions={<Button label={t("common.pair_desktop")} width="wide" onPress={onPair} testID="desktops-empty-pair" />}
        testID="desktops-empty"
      />
    );
  } else {
    body = (
      <FlatList
        data={state.desktops}
        keyExtractor={keyOf}
        renderItem={renderItem}
        extraData={state}
        contentContainerStyle={[styles.list, { paddingBottom: spacing.listPadding + insets.bottom }]}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.bgSheet}
            accessibilityLabel={t("desktops.refresh")}
            testID="desktops-refresh"
          />
        }
        testID="desktops-list"
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgBase }]} testID="desktops-screen">
      <View style={{ paddingTop: insets.top, backgroundColor: colors.bgBar }}>
        <ScreenBar
          title={t("desktops.title")}
          actions={[
            { icon: "plus", accessibilityLabel: t("common.pair_desktop"), onPress: onPair, testID: "desktops-pair" },
            {
              icon: "settings",
              accessibilityLabel: t("common.settings"),
              onPress: () => router.push("/settings"),
              testID: "desktops-settings",
            },
          ]}
          testID="desktops-bar"
        />
      </View>
      {warning ? (
        <Banner
          tone="warning"
          icon="shield-alert"
          message={t("app_lock.unavailable_warning")}
          action={{
            label: t("common.open_system_settings"),
            onPress: () => {
              void Linking.openSettings();
            },
            testID: "desktops-lock-warning-action",
          }}
          testID="desktops-lock-warning"
        />
      ) : null}
      {state.loadError ? (
        <Banner
          tone="warning"
          icon="triangle-alert"
          message={t("desktops.load_error")}
          action={{
            label: t("common.retry"),
            onPress: () => {
              void controller.reload();
            },
            testID: "desktops-load-error-retry",
          }}
          testID="desktops-load-error"
        />
      ) : null}
      <View style={styles.body}>{body}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  list: {
    padding: spacing.listPadding,
    rowGap: spacing.listGap,
  },
});
