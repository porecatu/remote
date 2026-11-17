// SPDX-License-Identifier: GPL-3.0-or-later
import { createTranslator, getLocale, t } from "@/i18n/catalog";
import { PaneState } from "@/protocol";

import { tabStateChip, tabStateText } from "./tabState";

const tr = createTranslator(getLocale());

describe("tabStateText", () => {
  it("reads running, which has no chip", () => {
    expect(tabStateText(PaneState.running, null, tr)).toBe(t("workspace.tab_state.running"));
  });

  it("says only that an exited pane ended when the code is missing", () => {
    expect(tabStateText(PaneState.exited, null, tr)).toBe(t("pane_state.exited"));
    expect(tabStateText(PaneState.exited, 2, tr)).toBe(t("workspace.tab_state.exited", { code: 2 }));
  });
});

describe("tabStateChip", () => {
  it("shows nothing for running", () => {
    expect(tabStateChip(PaneState.running, null, tr)).toBeNull();
  });

  it("maps every other state to its icon and text", () => {
    expect(tabStateChip(PaneState.exited, 0, tr)).toEqual({
      label: t("workspace.tab_state.exited", { code: 0 }),
      leading: { kind: "icon", name: "circle-check", color: "textSecondary" },
      color: "textSecondary",
    });
    expect(tabStateChip(PaneState.exited, 1, tr)).toEqual({
      label: t("workspace.tab_state.exited", { code: 1 }),
      leading: { kind: "icon", name: "circle-x", color: "error" },
      color: "errorText",
    });
    expect(tabStateChip(PaneState.notStarted, null, tr)).toEqual({
      label: t("workspace.tab_state.not_started"),
      leading: { kind: "icon", name: "circle-dashed", color: "textSecondary" },
      color: "textSecondary",
    });
    for (const state of [PaneState.connecting, PaneState.reconnecting]) {
      expect(tabStateChip(state, null, tr)).toEqual({
        label: t("workspace.tab_state.connecting"),
        leading: { kind: "spinner" },
        color: "textSecondary",
      });
    }
    expect(tabStateChip(PaneState.disconnected, null, tr)).toEqual({
      label: t("workspace.tab_state.disconnected"),
      leading: { kind: "icon", name: "unplug", color: "textSecondary" },
      color: "textSecondary",
    });
    expect(tabStateChip(PaneState.awaitingDesktop, null, tr)).toEqual({
      label: t("workspace.tab_state.awaiting_desktop"),
      leading: { kind: "icon", name: "monitor", color: "warning" },
      color: "warningText",
    });
  });
});
