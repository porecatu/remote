// SPDX-License-Identifier: GPL-3.0-or-later
import { screen } from "@testing-library/react-native";

import { t } from "@/i18n/catalog";
import { PROTOCOL_VERSION } from "@/protocol";
import { type EndReason, IDLE_SNAPSHOT, type LifecycleSnapshot, type LifecycleState } from "@/session/lifecycle";
import { renderWithServices } from "@ui/services/testing";

import { ConnectingView, connectingStep, entryFailure, formatVersion } from "./ConnectingView";

function snapshot(state: LifecycleState, reason?: EndReason, over: Partial<LifecycleSnapshot> = {}): LifecycleSnapshot {
  return {
    ...IDLE_SNAPSHOT,
    state,
    end: reason === undefined ? null : { reason, code: null, hostVersion: null },
    ...over,
  };
}

describe("connectingStep", () => {
  it.each([
    ["idle", "connecting"],
    ["connecting", "connecting"],
    ["handshaking", "authenticating"],
    ["greeting", "loading"],
  ] as const)("%s is the step %s", (state, step) => {
    expect(connectingStep(snapshot(state))).toBe(step);
  });

  it("names each step in words", async () => {
    await renderWithServices(<ConnectingView step="authenticating" />);
    expect(screen.getByTestId("workspace-connecting-step")).toHaveTextContent(t("connection.authenticating"));
  });
});

describe("entryFailure", () => {
  it("is null while the session is not over", () => {
    expect(entryFailure(snapshot("connecting"), false, false)).toBeNull();
    expect(entryFailure(snapshot("ready"), true, true)).toBeNull();
  });

  it("tells which side to update on incompatible (RF-2.2)", () => {
    const newer = snapshot("closed", undefined, {
      end: { reason: "incompatible", code: null, hostVersion: [PROTOCOL_VERSION[0] + 1, 0] },
    });
    expect(entryFailure(newer, false, false)).toMatchObject({ kind: "incompatible", update: "app" });
    const older = snapshot("closed", undefined, { end: { reason: "incompatible", code: null, hostVersion: [0, 0] } });
    expect(entryFailure(older, false, false)).toMatchObject({ kind: "incompatible", update: "desktop" });
    expect(formatVersion([3, 7])).toBe("3.7");
  });

  it("shows not-paired only before the tree; after it the scope leaves", () => {
    expect(entryFailure(snapshot("closed", "not-paired"), false, false)).toEqual({ kind: "not-paired" });
    expect(entryFailure(snapshot("closed", "not-paired"), true, true)).toBeNull();
  });

  it("keeps the tree when the retries run out after it was shown", () => {
    expect(entryFailure(snapshot("failed", "retries-exhausted"), true, true)).toBeNull();
    expect(entryFailure(snapshot("failed", "retries-exhausted"), true, false)).toEqual({ kind: "gave-up" });
  });

  it.each([
    ["offline", "offline"],
    ["unreachable", "unreachable"],
    ["protocol", "protocol"],
    ["invalid-desktop", "invalid-desktop"],
  ] as const)("%s is a state screen", (reason, kind) => {
    expect(entryFailure(snapshot("failed", reason), false, false)).toEqual({ kind });
  });

  it.each(["user", "background", "goodbye", "remote-disabled", "host-quitting", "revoked"] as const)(
    "%s is not a state screen",
    (reason) => {
      expect(entryFailure(snapshot("closed", reason), false, false)).toBeNull();
    },
  );
});
