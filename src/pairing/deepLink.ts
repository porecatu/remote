// SPDX-License-Identifier: GPL-3.0-or-later

// Routing of the `porecatu://pair?...` deep link (PRD-001 RF-1.5; architecture
// §7). Pure: the caller reads the URL from the system (`Linking`), says whether
// the app is locked, and gets back what to hand to the pairing flow. A link
// that arrives while the app is locked is held, in memory only, and delivered
// once the app unlocks; nothing about a held link reaches the screen, so a
// locked app shows no desktop name and no pairing step.
//
// This module does not parse the URI: `parsePairingUri` (through the pairing
// flow's `uri-read`) judges it and reports why it was refused. All this does is
// tell a pairing link from any other URL the system may hand to the app. The
// URL carries the single-use token, so it is never logged.

const PAIR_LINK_PREFIX = "porecatu://pair";
/** Longer than any valid pairing URI (spec 02 §3.1): never held in memory. */
export const MAX_LINK_LENGTH = 4096;

/**
 * True for `porecatu://pair` followed by nothing, `?`, `/` or `#`. The scheme
 * is case-insensitive. A link that passes may still be refused by the parser
 * (a missing field, a wrong version): that is the flow's `uri` failure.
 */
export function isPairingLink(url: string): boolean {
  if (url.length > MAX_LINK_LENGTH || url.length < PAIR_LINK_PREFIX.length) {
    return false;
  }
  if (url.slice(0, PAIR_LINK_PREFIX.length).toLowerCase() !== PAIR_LINK_PREFIX) {
    return false;
  }
  const next = url.charAt(PAIR_LINK_PREFIX.length);
  return next === "" || next === "?" || next === "/" || next === "#";
}

export interface DeepLinkState {
  /** The pairing link received while locked; the newest one wins. */
  readonly pending: string | null;
}

export type DeepLinkEvent =
  /** A URL arrived; `locked` is `!isContentVisible(lockState)`. */
  | { readonly type: "link"; readonly url: string; readonly locked: boolean }
  /** The app went from locked to unlocked. */
  | { readonly type: "unlocked" }
  /** Forget a held link (the user left the lock screen for good, the app is closing). */
  | { readonly type: "discard" };

export interface DeepLinkStep {
  readonly state: DeepLinkState;
  /** A URI for the pairing flow's `uri-read`, or null. */
  readonly deliver: string | null;
}

export function createDeepLinkState(): DeepLinkState {
  return { pending: null };
}

export function reduceDeepLink(state: DeepLinkState, event: DeepLinkEvent): DeepLinkStep {
  switch (event.type) {
    case "link":
      if (!isPairingLink(event.url)) {
        return { state, deliver: null };
      }
      // A newer link replaces a held one: the older token is the stale one.
      return event.locked
        ? { state: { pending: event.url }, deliver: null }
        : { state: { pending: null }, deliver: event.url };
    case "unlocked":
      return state.pending === null
        ? { state, deliver: null }
        : { state: { pending: null }, deliver: state.pending };
    case "discard":
      return state.pending === null ? { state, deliver: null } : { state: { pending: null }, deliver: null };
  }
}
