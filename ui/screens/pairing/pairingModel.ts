// SPDX-License-Identifier: GPL-3.0-or-later
// What the pairing screens show, as data (anatomy §4.3; PRD-001 RF-1.6 to
// RF-1.10): the host of the relay, the time left of the confirmation wait,
// when to announce it, the fingerprint on screen, and the result screen of
// each failure. No React and no text: the screens turn the keys into text
// with `useT()`.
import type { MessageKey, MessageParams } from "@/i18n/catalog";
import { closeReasonKey, pairRejectedKey, pairingUriErrorKey } from "@/i18n/protocolMessages";
import type { PairingControllerState } from "@/controllers/pairing";
import type { PairingFailure } from "@/pairing/pairingFlow";
import { PAIRING_CONFIRM_WAIT_MS } from "@/pairing/pairingFlow";
import { MAX_DESKTOPS } from "@/storage/desktopList";
import type { IconName } from "@ui/components/Icon";
import type { ColorToken } from "@ui/theme";

/** A step of the flow (`PairingControllerState["step"]`). */
export type PairingStep = PairingControllerState["step"];

/** The confirmation wait of the desktop, in whole seconds (120, RF-1.9). */
export const CONFIRM_WAIT_SECONDS = PAIRING_CONFIRM_WAIT_MS / 1000;

/** From this many seconds left, every second is announced (§4.3.4). */
const FINAL_ANNOUNCE_SECONDS = 10;
/** Before the final seconds, the time left is announced every this many seconds. */
const ANNOUNCE_EVERY_SECONDS = 30;

/**
 * The host of a relay URL as the screens show it ("relay.example.com"): the
 * normalized URL without the scheme and the path. The URL itself, when it
 * does not look like one.
 */
export function relayHostOf(relayUrl: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(relayUrl);
  return match?.[1] ?? relayUrl;
}

/** The parts of the visible time left ("1:42"): minutes, and seconds with two digits. */
export function timeLeftParams(secondsLeft: number): { minutes: string; seconds: string } {
  const whole = Math.max(0, Math.floor(secondsLeft));
  return {
    minutes: String(Math.floor(whole / 60)),
    seconds: String(whole % 60).padStart(2, "0"),
  };
}

/**
 * Whether the time left is announced at this second (§4.3.4): every 30 s and
 * each of the last 10 s. Not at the start: the screen already says it.
 */
export function shouldAnnounceTimeLeft(secondsLeft: number): boolean {
  if (secondsLeft <= 0 || secondsLeft >= CONFIRM_WAIT_SECONDS) {
    return false;
  }
  return secondsLeft <= FINAL_ANNOUNCE_SECONDS || secondsLeft % ANNOUNCE_EVERY_SECONDS === 0;
}

/** How much of the wait is left, from 1 (just sent) to 0 (time is up). */
export function waitProgress(secondsLeft: number): number {
  return Math.min(1, Math.max(0, secondsLeft / CONFIRM_WAIT_SECONDS));
}

/**
 * The fingerprint on screen: one line, and when the system font is large two
 * lines of two groups (§4.3.4). The spaces inside each half do not break.
 */
export function fingerprintDisplay(fingerprint: string): string {
  const groups = fingerprint.split(/\s+/).filter((group) => group !== "");
  const half = Math.ceil(groups.length / 2);
  const join = (part: readonly string[]): string => part.join(" ");
  return groups.length <= 2 ? join(groups) : `${join(groups.slice(0, half))} ${join(groups.slice(half))}`;
}

// ----------------------------------------------------------------- results

/** A button of a result screen. */
export type ResultAction = "scan-another" | "retry" | "close";

/** A text from the catalog with its parameters. */
export type CatalogText = {
  readonly key: MessageKey;
  readonly params?: MessageParams;
};

/** The state screen of a failed pairing (§4.3.4, §4.14). */
export type FailureView = {
  readonly icon: IconName;
  readonly iconColor: ColorToken;
  readonly title: CatalogText;
  readonly body: CatalogText;
  /** Primary first. Never empty: there is always a way out. */
  readonly actions: readonly ResultAction[];
  /** The security error of RF-1.8: no way to go on with this code. */
  readonly security: boolean;
};

/** What the screens remember of the attempt, to word its failure. */
export type FailureContext = {
  /** The step the flow left when it failed (`connecting` means the relay was never reached). */
  readonly failedFrom: PairingStep | null;
  /** The host of the relay of the last code read, for "could not reach the relay …". */
  readonly relayHost: string | null;
  /** The same code can be tried again (the screens still hold it). */
  readonly canRetry: boolean;
};

const FAILED_TITLE: CatalogText = { key: "pairing.failed_title" };

function failed(
  icon: IconName,
  body: CatalogText,
  actions: readonly ResultAction[],
): FailureView {
  return { icon, iconColor: "textTertiary", title: FAILED_TITLE, body, actions, security: false };
}

/** Try the same code again when the screens hold it, else read another one. */
function againOrAnother(context: FailureContext): readonly ResultAction[] {
  return context.canRetry ? ["retry", "close"] : ["scan-another", "close"];
}

function relayUnreachable(context: FailureContext): FailureView {
  return failed(
    "wifi-off",
    { key: "connection.relay_unreachable", params: { host: context.relayHost ?? "" } },
    againOrAnother(context),
  );
}

/**
 * The result screen of a failure. The single-use code is spent once the
 * desktop got the pair request (the confirmation wait): from there only
 * "Scan another code" makes sense; before it, the same code can be tried again.
 */
export function describeFailure(failure: PairingFailure, context: FailureContext): FailureView {
  const beforeRequest = context.failedFrom === "connecting" || context.failedFrom === "handshaking";
  switch (failure.kind) {
    case "uri":
      return {
        icon: "triangle-alert",
        iconColor: "textTertiary",
        title: { key: "pairing.invalid_code_title" },
        body: { key: pairingUriErrorKey(failure.error, failure.field) },
        actions: ["scan-another", "close"],
        security: false,
      };
    case "host-key-mismatch":
      return {
        icon: "shield-alert",
        iconColor: "error",
        title: { key: "pairing.identity_mismatch_title" },
        body: { key: "pairing.identity_mismatch" },
        actions: ["close"],
        security: true,
      };
    case "rejected":
      return failed("triangle-alert", { key: pairRejectedKey(failure.reason) }, ["scan-another", "close"]);
    case "timeout":
      if (failure.phase === "connect") {
        return relayUnreachable(context);
      }
      return failed(
        "triangle-alert",
        { key: "pair_rejected.timeout" },
        failure.phase === "handshake" ? againOrAnother(context) : ["scan-another", "close"],
      );
    case "connection-lost":
      if (context.failedFrom === "connecting") {
        return relayUnreachable(context);
      }
      return failed(
        "unplug",
        { key: "pairing.connection_lost" },
        beforeRequest ? againOrAnother(context) : ["scan-another", "close"],
      );
    case "host-unavailable":
      return failed("monitor-off", { key: "pairing.host_unavailable" }, againOrAnother(context));
    case "relay-closed":
      return failed(
        "unplug",
        { key: closeReasonKey(failure.reason) },
        beforeRequest ? againOrAnother(context) : ["scan-another", "close"],
      );
    case "protocol":
      return failed("triangle-alert", { key: "error.protocol" }, ["close"]);
    case "list-full":
      return failed("triangle-alert", { key: "pairing.list_full", params: { max: MAX_DESKTOPS } }, ["close"]);
    case "storage":
      return failed("triangle-alert", { key: "pairing.storage_failed" }, ["scan-another", "close"]);
  }
}
