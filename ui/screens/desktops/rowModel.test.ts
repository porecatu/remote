// SPDX-License-Identifier: GPL-3.0-or-later
import { createTranslator } from "@/i18n/catalog";
import type { Desktop } from "@/storage/desktopList";

import { errorReasonKey, relayHost, rowAccessibilityLabel, rowDetail, statusLook } from "./rowModel";

const AT = "2026-11-16T12:00:00.000Z";
const NOW = Date.parse(AT) + 3 * 60_000;

const casa: Desktop = {
  id: "a".repeat(32),
  name: "Casa",
  relayUrl: "wss://user@relay.exemplo.com.br:8443/v0",
  hostId: "a".repeat(32),
  hostKeyB64: "A".repeat(43),
  pairedAt: AT,
  lastStatus: { kind: "offline", at: AT },
};

describe("relayHost", () => {
  it("keeps only the host of the URL", () => {
    expect(relayHost("wss://relay.exemplo.com.br")).toBe("relay.exemplo.com.br");
    expect(relayHost("wss://user@relay.exemplo.com.br:8443/v0?x=1")).toBe("relay.exemplo.com.br");
    expect(relayHost("ws://localhost:8787")).toBe("localhost");
    expect(relayHost("wss://[::1]:8443/")).toBe("[::1]");
  });

  it("gives back what it cannot parse", () => {
    expect(relayHost("relay")).toBe("relay");
  });
});

describe("errorReasonKey", () => {
  it("names the reasons of the anatomy and falls back to a failed connection", () => {
    expect(errorReasonKey("unreachable:1006")).toBe("desktops.error_unreachable");
    expect(errorReasonKey("unreachable")).toBe("desktops.error_unreachable");
    expect(errorReasonKey("incompatible")).toBe("desktops.error_incompatible");
    expect(errorReasonKey("handshake:decrypt")).toBe("desktops.error_failed");
    expect(errorReasonKey(null)).toBe("desktops.error_failed");
  });
});

describe("statusLook", () => {
  it("never uses red for offline and has no label without a state", () => {
    expect(statusLook({ kind: "offline", errorCode: null })?.indicator).toEqual({ kind: "dot", color: "textTertiary" });
    expect(statusLook({ kind: "online" })?.indicator).toEqual({ kind: "dot", color: "success" });
    expect(statusLook({ kind: "unknown" })).toBeNull();
  });
});

describe("row texts", () => {
  const en = createTranslator("en_US");
  const pt = createTranslator("pt_BR");

  it("shows the host and the time, or the reason in error", () => {
    expect(rowDetail(casa, { kind: "offline", errorCode: null }, NOW, pt)).toEqual({
      text: "relay.exemplo.com.br · há 3 min",
      warning: false,
    });
    expect(rowDetail(casa, { kind: "error", errorCode: "incompatible" }, NOW, pt)).toEqual({
      text: "Versão incompatível · há 3 min",
      warning: true,
    });
    expect(rowDetail(casa, { kind: "not-paired" }, NOW, pt).text).toBe("Pareie de novo ou remova");
  });

  it("composes the screen reader label", () => {
    expect(rowAccessibilityLabel(casa, { kind: "online" }, NOW, pt)).toBe(
      "Casa, Online, relay relay.exemplo.com.br, última tentativa há 3 min",
    );
    expect(rowAccessibilityLabel(casa, { kind: "unknown" }, NOW, en)).toBe(
      "Casa, Unknown, relay relay.exemplo.com.br, last attempt 3 min ago",
    );
  });
});
