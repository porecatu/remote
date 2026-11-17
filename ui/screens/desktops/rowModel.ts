// SPDX-License-Identifier: GPL-3.0-or-later
// What a row of the desktop list shows (anatomy §4.2, PRD-001 RF-1.12 and
// RF-1.16), as pure functions over the controller's `RowStatus`: the status
// label (dot, icon or spinner, and the text), line 2 (the relay host or the
// short reason, and the time of the last attempt) and the composed screen
// reader label. Codes come in, catalog keys go out: no prose is decided here.
import type { RowStatus } from "@/controllers/desktops";
import type { MessageKey, Translator } from "@/i18n/catalog";
import { formatRelativeTime } from "@/i18n/relativeTime";
import type { Desktop } from "@/storage/desktopList";
import type { IconName } from "@ui/components";
import type { ColorToken } from "@ui/theme";

/** The leading part of the status label. */
export type StatusIndicator =
  | { readonly kind: "dot"; readonly color: ColorToken }
  | { readonly kind: "icon"; readonly name: IconName; readonly color: ColorToken }
  | { readonly kind: "spinner" };

/** The status label of a row; `null` while the desktop has no state yet. */
export type StatusLook = {
  readonly key: MessageKey;
  readonly indicator: StatusIndicator;
};

/**
 * The label of each state (§4.2 table): Online with a `success` dot, Offline
 * with a neutral dot and no red (principle 5), Connecting with the spinner,
 * Error with `triangle-alert` and Not paired with `shield-off`, both in
 * `warning`.
 */
export function statusLook(status: RowStatus): StatusLook | null {
  switch (status.kind) {
    case "online":
      return { key: "presence.online", indicator: { kind: "dot", color: "success" } };
    case "offline":
      return { key: "presence.offline", indicator: { kind: "dot", color: "textTertiary" } };
    case "connecting":
      return { key: "desktop_status.connecting", indicator: { kind: "spinner" } };
    case "error":
      return {
        key: "desktop_status.error",
        indicator: { kind: "icon", name: "triangle-alert", color: "warning" },
      };
    case "not-paired":
      return {
        key: "desktop_status.not-paired",
        indicator: { kind: "icon", name: "shield-off", color: "warning" },
      };
    case "unknown":
      return null;
  }
}

/**
 * The host of the relay URL, without scheme, credentials, port or path
 * (RF-1.12: "only the host of the URL"). Parsed by hand: the URL class of
 * React Native does not implement its getters.
 */
export function relayHost(relayUrl: string): string {
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(relayUrl)?.[1];
  if (authority === undefined || authority === "") {
    return relayUrl;
  }
  const hostPort = authority.slice(authority.lastIndexOf("@") + 1);
  if (hostPort.startsWith("[")) {
    const end = hostPort.indexOf("]");
    return end < 0 ? hostPort : hostPort.slice(0, end + 1);
  }
  const colon = hostPort.indexOf(":");
  return colon < 0 ? hostPort : hostPort.slice(0, colon);
}

/**
 * The short reason of the Error state (§4.2: "Relay unreachable",
 * "Incompatible version"). The code is the one the registry records
 * (`statusFor`): the lower layer's code (`unreachable:1006`) or the end reason.
 */
export function errorReasonKey(errorCode: string | null): MessageKey {
  if (errorCode !== null) {
    if (errorCode === "unreachable" || errorCode.startsWith("unreachable:")) {
      return "desktops.error_unreachable";
    }
    if (errorCode === "incompatible") {
      return "desktops.error_incompatible";
    }
  }
  return "desktops.error_failed";
}

/** The time of the last attempt ("now", "3 min ago", "yesterday"). */
export function lastAttemptTime(desktop: Desktop, nowMs: number, tr: Translator): string {
  return formatRelativeTime(desktop.lastStatus.at, nowMs, tr);
}

/** Line 2 of the row and whether it carries a warning (the Error reason). */
export function rowDetail(
  desktop: Desktop,
  status: RowStatus,
  nowMs: number,
  tr: Translator,
): { readonly text: string; readonly warning: boolean } {
  if (status.kind === "not-paired") {
    return { text: tr.t("desktops.not_paired_hint"), warning: false };
  }
  const time = lastAttemptTime(desktop, nowMs, tr);
  if (status.kind === "error") {
    return {
      text: tr.t("desktops.row_detail", { detail: tr.t(errorReasonKey(status.errorCode)), time }),
      warning: true,
    };
  }
  return {
    text: tr.t("desktops.row_detail", { detail: relayHost(desktop.relayUrl), time }),
    warning: false,
  };
}

/**
 * The composed label of the row (§4.2 "Acessibilidade"): "Casa, Online,
 * relay relay.exemplo.com.br, last attempt now"; the Error state reads the
 * reason in place of the relay; Not paired asks to pair again or remove. A
 * desktop with no state yet reads "Unknown".
 */
export function rowAccessibilityLabel(
  desktop: Desktop,
  status: RowStatus,
  nowMs: number,
  tr: Translator,
): string {
  const look = statusLook(status);
  const statusText = tr.t(look === null ? "presence.unknown" : look.key);
  if (status.kind === "not-paired") {
    return tr.t("desktops.row_a11y_not_paired", { name: desktop.name, status: statusText });
  }
  const time = lastAttemptTime(desktop, nowMs, tr);
  if (status.kind === "error") {
    return tr.t("desktops.row_a11y_error", {
      name: desktop.name,
      status: statusText,
      reason: tr.t(errorReasonKey(status.errorCode)),
      time,
    });
  }
  return tr.t("desktops.row_a11y", {
    name: desktop.name,
    status: statusText,
    host: relayHost(desktop.relayUrl),
    time,
  });
}
