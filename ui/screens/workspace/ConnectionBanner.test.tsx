// SPDX-License-Identifier: GPL-3.0-or-later
import { createTranslator } from "@/i18n/catalog";
import { type EndReason, IDLE_SNAPSHOT, type LifecycleSnapshot, type LifecycleState } from "@/session/lifecycle";

import { connectionBannerState, connectionStatus, connectionSubtitle, isSessionLive } from "./ConnectionBanner";

const en = createTranslator("en_US");

function snapshot(state: LifecycleState, over: Partial<LifecycleSnapshot> = {}, reason?: EndReason): LifecycleSnapshot {
  return {
    ...IDLE_SNAPSHOT,
    state,
    ...(reason === undefined ? {} : { end: { reason, code: null, hostVersion: null } }),
    ...over,
  };
}

describe("connectionBannerState (§4.5.4)", () => {
  it("is hidden while connected", () => {
    expect(connectionBannerState(snapshot("ready"))).toBeNull();
  });

  it("counts the automatic attempts while reconnecting", () => {
    expect(connectionBannerState(snapshot("reconnecting", { attempt: 2 }))).toEqual({
      kind: "reconnecting",
      attempt: 2,
      total: 5,
    });
    expect(connectionBannerState(snapshot("handshaking", { attempt: 3 }))).toMatchObject({ attempt: 3 });
  });

  it("offers to try again once the retries ran out", () => {
    expect(connectionBannerState(snapshot("failed", {}, "retries-exhausted"))).toEqual({ kind: "gave-up" });
  });

  it("says it is refreshing back from the background", () => {
    expect(connectionBannerState(snapshot("closed", {}, "background"))).toEqual({ kind: "refreshing" });
    expect(connectionBannerState(snapshot("connecting", { attempt: 0 }))).toEqual({ kind: "refreshing" });
  });

  it("leaves the other ends to the screen", () => {
    expect(connectionBannerState(snapshot("closed", {}, "remote-disabled"))).toBeNull();
    expect(connectionBannerState(snapshot("failed", {}, "protocol"))).toBeNull();
  });
});

describe("the bar's support line", () => {
  it("says Connected with the success dot, Reconnecting… or No connection", () => {
    expect(connectionSubtitle(snapshot("ready"), en)).toEqual({ text: en.t("connection.connected"), dot: "success" });
    expect(connectionSubtitle(snapshot("reconnecting", { attempt: 1 }), en)).toEqual({
      text: en.t("connection.reconnecting"),
    });
    expect(connectionSubtitle(snapshot("closed", {}, "background"), en).text).toBe(en.t("connection.reconnecting"));
    expect(connectionSubtitle(snapshot("failed", {}, "retries-exhausted"), en)).toEqual({
      text: en.t("connection.offline"),
    });
    expect(connectionStatus(snapshot("closed", {}, "goodbye"))).toBe("offline");
  });

  it("allows actions only while ready", () => {
    expect(isSessionLive(snapshot("ready"))).toBe(true);
    expect(isSessionLive(snapshot("reconnecting"))).toBe(false);
    expect(isSessionLive(snapshot("greeting"))).toBe(false);
  });
});
