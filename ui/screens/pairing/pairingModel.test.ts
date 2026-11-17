// SPDX-License-Identifier: GPL-3.0-or-later
import { CloseReason, PairRejectReason, parsePairingUri } from "@/protocol";

import {
  describeFailure,
  fingerprintDisplay,
  relayHostOf,
  shouldAnnounceTimeLeft,
  timeLeftParams,
  waitProgress,
  type FailureContext,
} from "./pairingModel";
import { TEST_INVITE, testUri } from "./testing";

const AWAITING: FailureContext = { failedFrom: "awaiting-confirmation", relayHost: "relay.example.com", canRetry: true };

describe("relayHostOf", () => {
  it("drops the scheme and the path, keeps the port", () => {
    expect(relayHostOf("wss://relay.example.com")).toBe("relay.example.com");
    expect(relayHostOf("ws://localhost:8787/prefix")).toBe("localhost:8787");
    expect(relayHostOf("nonsense")).toBe("nonsense");
  });
});

describe("time left", () => {
  it("shows minutes and two-digit seconds", () => {
    expect(timeLeftParams(102)).toEqual({ minutes: "1", seconds: "42" });
    expect(timeLeftParams(120)).toEqual({ minutes: "2", seconds: "00" });
    expect(timeLeftParams(5)).toEqual({ minutes: "0", seconds: "05" });
    expect(timeLeftParams(-1)).toEqual({ minutes: "0", seconds: "00" });
  });

  it("is announced every 30 s and in the last 10 s, not at the start", () => {
    const announced = Array.from({ length: 121 }, (_, i) => 120 - i).filter(shouldAnnounceTimeLeft);
    expect(announced).toEqual([90, 60, 30, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("empties the ring over the wait", () => {
    expect(waitProgress(120)).toBe(1);
    expect(waitProgress(60)).toBe(0.5);
    expect(waitProgress(0)).toBe(0);
  });
});

describe("fingerprintDisplay", () => {
  it("only breaks between the two halves", () => {
    expect(fingerprintDisplay("ABCD EFGH IJKL MNOP")).toBe("ABCD EFGH IJKL MNOP");
  });
});

describe("describeFailure", () => {
  it("parses the test URI", () => {
    const parsed = parsePairingUri(testUri());
    expect(parsed.ok && parsed.invite.hostName).toBe(TEST_INVITE.hostName);
  });

  it("makes the identity error a security screen with only Close (RF-1.8)", () => {
    const view = describeFailure({ kind: "host-key-mismatch" }, AWAITING);
    expect(view).toMatchObject({
      icon: "shield-alert",
      iconColor: "error",
      security: true,
      title: { key: "pairing.identity_mismatch_title" },
      body: { key: "pairing.identity_mismatch" },
      actions: ["close"],
    });
  });

  it("words each rejection and offers another code", () => {
    for (const reason of [PairRejectReason.tokenInvalid, PairRejectReason.userDeclined, PairRejectReason.timeout]) {
      const view = describeFailure({ kind: "rejected", reason }, AWAITING);
      expect(view.actions).toEqual(["scan-another", "close"]);
    }
    expect(describeFailure({ kind: "rejected", reason: PairRejectReason.tokenInvalid }, AWAITING).body.key).toBe(
      "pair_rejected.token-invalid",
    );
    expect(describeFailure({ kind: "timeout", phase: "confirmation" }, AWAITING).body.key).toBe(
      "pair_rejected.timeout",
    );
  });

  it("tells an unreachable relay, with its host, and tries the same code again", () => {
    const connecting: FailureContext = { ...AWAITING, failedFrom: "connecting" };
    for (const failure of [{ kind: "connection-lost" } as const, { kind: "timeout", phase: "connect" } as const]) {
      const view = describeFailure(failure, connecting);
      expect(view.body).toEqual({ key: "connection.relay_unreachable", params: { host: "relay.example.com" } });
      expect(view.actions).toEqual(["retry", "close"]);
    }
    expect(describeFailure({ kind: "connection-lost" }, { ...connecting, canRetry: false }).actions).toEqual([
      "scan-another",
      "close",
    ]);
  });

  it("does not retry a code already sent to the desktop", () => {
    expect(describeFailure({ kind: "connection-lost" }, AWAITING)).toMatchObject({
      body: { key: "pairing.connection_lost" },
      actions: ["scan-another", "close"],
    });
    expect(describeFailure({ kind: "relay-closed", reason: CloseReason.hostGone }, AWAITING)).toMatchObject({
      body: { key: "close_reason.host-gone" },
      actions: ["scan-another", "close"],
    });
    expect(
      describeFailure({ kind: "relay-closed", reason: CloseReason.hostGone }, { ...AWAITING, failedFrom: "handshaking" })
        .actions,
    ).toEqual(["retry", "close"]);
  });

  it("covers the other failures with catalog texts", () => {
    expect(describeFailure({ kind: "host-unavailable" }, AWAITING).body.key).toBe("pairing.host_unavailable");
    expect(describeFailure({ kind: "list-full" }, AWAITING).body).toEqual({
      key: "pairing.list_full",
      params: { max: 20 },
    });
    expect(describeFailure({ kind: "storage" }, AWAITING).body.key).toBe("pairing.storage_failed");
    expect(describeFailure({ kind: "protocol", detail: "x" }, AWAITING).actions).toEqual(["close"]);
    expect(describeFailure({ kind: "uri", error: "insecure-relay" }, AWAITING)).toMatchObject({
      title: { key: "pairing.invalid_code_title" },
      body: { key: "pairing_uri.insecure-relay" },
    });
    expect(describeFailure({ kind: "uri", error: "missing-field" }, AWAITING).body.key).toBe(
      "pairing_uri.missing-param",
    );
  });
});
