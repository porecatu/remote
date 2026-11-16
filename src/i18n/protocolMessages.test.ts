// SPDX-License-Identifier: GPL-3.0-or-later
import {
  CLOSE_CODE,
  CLOSE_REASONS,
  ERROR_CODES,
  GOODBYE_REASONS,
  PAIR_REJECT_REASONS,
  PANE_STATES,
  parsePairingUri,
  type PairingUriError,
} from "../protocol";
import { MESSAGES, type MessageKey } from "./catalog";
import {
  closeReasonKey,
  errorMessageKey,
  goodbyeKey,
  pairRejectedKey,
  pairingUriErrorKey,
  paneStateKey,
  socketCloseKey,
} from "./protocolMessages";

// The package's own arrays drive these tests: a code added by a package
// upgrade without text in both languages fails here.

function expectTextInBothLanguages(key: MessageKey): void {
  for (const locale of ["en_US", "pt_BR"] as const) {
    const text = MESSAGES[locale][key];
    expect({ key, locale, empty: text.trim() === "" }).toEqual({ key, locale, empty: false });
  }
}

// Exhaustive on purpose: a `PairingUriError` the package adds is a compile error.
const PAIRING_URI_ERRORS: Record<PairingUriError, true> = {
  "not-porecatu": true,
  "missing-field": true,
  "duplicate-field": true,
  "malformed-field": true,
  "version-mismatch": true,
  "insecure-relay": true,
};

describe("protocol code texts", () => {
  it("has a text for every error code", () => {
    expect(ERROR_CODES.length).toBeGreaterThan(0);
    for (const code of ERROR_CODES) {
      expectTextInBothLanguages(errorMessageKey(code));
    }
  });

  it("gives every error code a distinct text", () => {
    const keys = ERROR_CODES.map((code) => errorMessageKey(code));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("falls back to a generic text for an error code it does not know", () => {
    expect(errorMessageKey(999)).toBe("error.unknown");
    expectTextInBothLanguages("error.unknown");
  });

  it("has a text for every goodbye reason", () => {
    expect(GOODBYE_REASONS.length).toBeGreaterThan(0);
    for (const reason of GOODBYE_REASONS) {
      expectTextInBothLanguages(goodbyeKey(reason));
    }
  });

  it("has a text for every pair-rejected reason", () => {
    expect(PAIR_REJECT_REASONS.length).toBeGreaterThan(0);
    for (const reason of PAIR_REJECT_REASONS) {
      expectTextInBothLanguages(pairRejectedKey(reason));
    }
  });

  it("has a text for every pane state", () => {
    expect(PANE_STATES.length).toBeGreaterThan(0);
    for (const state of PANE_STATES) {
      expectTextInBothLanguages(paneStateKey(state));
    }
    expect(MESSAGES.en_US["pane_state.awaiting-desktop"]).toBe("Waiting for the desktop");
    expect(MESSAGES.pt_BR["pane_state.awaiting-desktop"]).toBe("Aguardando o desktop");
  });

  it("has a text for every relay close reason", () => {
    expect(CLOSE_REASONS.length).toBeGreaterThan(0);
    for (const reason of CLOSE_REASONS) {
      expectTextInBothLanguages(closeReasonKey(reason));
    }
  });

  it("has a text for every pairing URI error", () => {
    for (const error of Object.keys(PAIRING_URI_ERRORS) as PairingUriError[]) {
      expectTextInBothLanguages(pairingUriErrorKey(error));
    }
  });

  it("refines a malformed relay or name into the specific text", () => {
    expect(pairingUriErrorKey("malformed-field", "relay")).toBe("pairing_uri.invalid-relay");
    expect(pairingUriErrorKey("malformed-field", "name")).toBe("pairing_uri.bad-name");
    expect(pairingUriErrorKey("malformed-field", "token")).toBe("pairing_uri.malformed-param");
    expect(pairingUriErrorKey("missing-field", "relay")).toBe("pairing_uri.missing-param");
    expectTextInBothLanguages("pairing_uri.invalid-relay");
    expectTextInBothLanguages("pairing_uri.bad-name");
  });

  it("maps what parsePairingUri really returns", () => {
    const notPorecatu = parsePairingUri("https://example.com/");
    expect(notPorecatu.ok).toBe(false);
    if (!notPorecatu.ok) {
      expect(pairingUriErrorKey(notPorecatu.error, notPorecatu.field)).toBe(
        "pairing_uri.not-porecatu",
      );
    }
  });

  it("has a text for every relay WebSocket close code", () => {
    for (const code of Object.values(CLOSE_CODE)) {
      const key = socketCloseKey(code);
      expect({ code, generic: key === "socket_close.unknown" }).toEqual({ code, generic: false });
      expectTextInBothLanguages(key);
    }
  });

  it("gives a code dropped without a close frame the generic text", () => {
    expect(socketCloseKey(1005)).toBe("socket_close.unknown");
    expect(socketCloseKey(1006)).toBe("socket_close.unknown");
    expectTextInBothLanguages("socket_close.unknown");
  });
});
