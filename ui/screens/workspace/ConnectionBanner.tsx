// SPDX-License-Identifier: GPL-3.0-or-later
// The connection band (anatomy §4.5.4; PRD-002 RF-2.4, RF-2.5), 36 high under
// the bar of the workspace and of the terminal, only while the session is
// not connected after the tree was shown:
// - reconnecting: spinner and "Reconnecting… attempt N of 5" (the automatic
//   retries at 1, 2, 4, 8 and 16 s);
// - given up: `wifi-off` in `warning`, "No connection to the desktop." and the
//   text button "Try again";
// - back from the background (or a retry by hand): spinner and "Refreshing…".
// The band is a polite live region (the `Banner` primitive), so the
// connection state is announced without moving the focus (§4.5.2,
// accessibility). Also here: the support line of the bar ("Connected",
// "Reconnecting…", "No connection") and the retry by hand.
import { useCallback } from "react";

import type { Translator } from "@/i18n/catalog";
import {
  type LifecycleSnapshot,
  MAX_AUTOMATIC_ATTEMPTS,
  isReconnecting,
} from "@/session/lifecycle";
import type { SessionStore } from "@/session/sessionStore";
import { Banner, type ScreenBarSubtitle } from "@ui/components";
import { shallowEqual, useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { useServices } from "@ui/services/ServicesContext";

/** What the band shows; null when it is hidden. */
export type ConnectionBannerState =
  | { readonly kind: "reconnecting"; readonly attempt: number; readonly total: number }
  | { readonly kind: "gave-up" }
  | { readonly kind: "refreshing" };

/** The connection as the bar's support line says it (§4.5.4). */
export type ConnectionStatus = "connected" | "reconnecting" | "offline";

/**
 * The band for a connection snapshot (§4.5.4). Meant for a session whose tree
 * was already shown: before the first `ready` the workspace shows the
 * "Connecting" view instead. Hidden when `ready`, and for the ends that leave
 * the desktop or replace the tree with a state screen.
 */
export function connectionBannerState(connection: LifecycleSnapshot): ConnectionBannerState | null {
  switch (connection.state) {
    case "ready":
    case "idle":
      return null;
    case "closed":
      return connection.end?.reason === "background" ? { kind: "refreshing" } : null;
    case "failed":
      return connection.end?.reason === "retries-exhausted" ? { kind: "gave-up" } : null;
    case "reconnecting":
    case "connecting":
    case "handshaking":
    case "greeting":
      return isReconnecting(connection)
        ? { kind: "reconnecting", attempt: Math.max(1, connection.attempt), total: MAX_AUTOMATIC_ATTEMPTS }
        : { kind: "refreshing" };
  }
}

/** The support line of the bar: connected only when `ready`; "no connection" once it ended. */
export function connectionStatus(connection: LifecycleSnapshot): ConnectionStatus {
  if (connection.state === "ready") {
    return "connected";
  }
  const band = connectionBannerState(connection);
  return band === null || band.kind === "gave-up" ? "offline" : "reconnecting";
}

/** The bar's support line (`ScreenBar` `subtitle`): "Connected" carries the `success` dot. */
export function connectionSubtitle(connection: LifecycleSnapshot, tr: Pick<Translator, "t">): ScreenBarSubtitle {
  switch (connectionStatus(connection)) {
    case "connected":
      return { text: tr.t("connection.connected"), dot: "success" };
    case "reconnecting":
      return { text: tr.t("connection.reconnecting") };
    case "offline":
      return { text: tr.t("connection.offline") };
  }
}

/** Actions on the tree and the terminal are allowed only while `ready` (§4.5.4: read-only otherwise). */
export function isSessionLive(connection: LifecycleSnapshot): boolean {
  return connection.state === "ready";
}

/**
 * "Try again": opens the desktop again through the list's controller (so the
 * list follows the attempt), or restarts the session when the list does not
 * know it. Works for a session that ended (`closed`, `failed`).
 */
export function useRetryConnection(session: SessionStore): () => void {
  const { desktops } = useServices();
  return useCallback(() => {
    if (desktops.open(session.desktopId) === undefined) {
      session.start();
    }
  }, [desktops, session]);
}

export type ConnectionBannerProps = {
  readonly session: SessionStore;
  /** Default `connection-banner`; the retry button is `<testID>-retry`. */
  readonly testID?: string;
};

/** The connection band of the session; renders nothing while connected. */
export function ConnectionBanner({ session, testID = "connection-banner" }: ConnectionBannerProps) {
  const { t } = useT();
  const state = useStoreState(session.store, (s) => connectionBannerState(s.connection), shallowEqual);
  const retry = useRetryConnection(session);
  if (state === null) {
    return null;
  }
  switch (state.kind) {
    case "reconnecting":
      return (
        <Banner
          tone="neutral"
          busy
          message={t("connection.reconnecting_attempt", { attempt: state.attempt, total: state.total })}
          testID={testID}
        />
      );
    case "refreshing":
      return <Banner tone="neutral" busy message={t("connection.refreshing")} testID={testID} />;
    case "gave-up":
      return (
        <Banner
          tone="warning"
          icon="wifi-off"
          message={t("connection.gave_up")}
          action={{ label: t("common.retry"), onPress: retry, testID: `${testID}-retry` }}
          testID={testID}
        />
      );
  }
}
