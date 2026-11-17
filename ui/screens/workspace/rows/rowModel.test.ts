// SPDX-License-Identifier: GPL-3.0-or-later
import { createTranslator, getLocale, t, tn } from "@/i18n/catalog";
import { PaneState } from "@/protocol";
import { tabView } from "@/workspace/selectors";
import { PROFILES, pane, tab, win } from "@/workspace/testing";
import { defaultGroupColors } from "@ui/theme";

import {
  groupAccessibilityLabel,
  matchSegments,
  resolveGroupColor,
  tabAccessibilityLabel,
  tabDetail,
  tabIndicator,
  windowAccessibilityLabel,
  windowSections,
} from "./rowModel";

const tr = createTranslator(getLocale());
const sep = t("a11y.separator");

describe("tabIndicator", () => {
  it("prefers the bell, then activity, and hides both on an exited tab", () => {
    expect(tabIndicator({ bell: true, activity: true, state: PaneState.running })).toBe("bell");
    expect(tabIndicator({ bell: false, activity: true, state: PaneState.running })).toBe("activity");
    expect(tabIndicator({ bell: false, activity: false, state: PaneState.running })).toBeNull();
    expect(tabIndicator({ bell: true, activity: true, state: PaneState.exited })).toBeNull();
  });
});

describe("tabDetail", () => {
  it("is user@host on an SSH tab, else the cwd", () => {
    expect(tabDetail({ remote: "deploy@srv", cwd: "/home" })).toBe("deploy@srv");
    expect(tabDetail({ remote: null, cwd: "/home" })).toBe("/home");
    expect(tabDetail({ remote: null, cwd: null })).toBeNull();
  });
});

describe("tabAccessibilityLabel", () => {
  it("composes title, tab, state, panes, bell and active on the desktop, in order", () => {
    const view = tabView(
      tab(1, {
        title: "build",
        bell: true,
        layout: { dir: 0, ratio: 32768, first: pane(100), second: pane(101) },
        focused: 100,
      }),
      win(1, [], { active: 1 }),
      "track",
      null,
    );
    expect(tabAccessibilityLabel(view, tr)).toBe(
      [
        "build",
        t("workspace.tab_word"),
        t("workspace.tab_state.running"),
        tn("workspace.pane_count", 2),
        t("workspace.bell"),
        t("workspace.active_on_desktop"),
      ].join(sep),
    );
  });

  it("says pinned, activity, the profile and line 2", () => {
    const view = tabView(
      tab(2, {
        title: "prod",
        activity: true,
        profile: "prod",
        remote: "deploy@srv",
        layout: pane(200, { state: PaneState.disconnected }),
        focused: 200,
      }),
      win(1, []),
      "pinned",
      null,
      PROFILES,
    );
    expect(tabAccessibilityLabel(view, tr)).toBe(
      [
        "prod",
        t("workspace.tab_word"),
        t("workspace.pinned_tab"),
        t("workspace.tab_state.disconnected"),
        t("workspace.activity"),
        "Production",
        "deploy@srv",
      ].join(sep),
    );
  });
});

describe("groupAccessibilityLabel", () => {
  it("is name, group and tab count for a group open on the desktop", () => {
    expect(
      groupAccessibilityLabel({ name: "Servers", tabCount: 3, desktopCollapsed: false, collapsed: false }, tr),
    ).toBe(["Servers", t("workspace.group_word"), tn("workspace.tab_count", 3)].join(sep));
  });

  it("adds the collapsed or locally expanded state for a group collapsed on the desktop", () => {
    const base = ["Front", t("workspace.group_word"), tn("workspace.tab_count", 2)];
    expect(groupAccessibilityLabel({ name: "Front", tabCount: 2, desktopCollapsed: true, collapsed: true }, tr)).toBe(
      [...base, t("workspace.collapsed_on_desktop")].join(sep),
    );
    expect(groupAccessibilityLabel({ name: "Front", tabCount: 2, desktopCollapsed: true, collapsed: false }, tr)).toBe(
      [...base, t("workspace.expanded_locally")].join(sep),
    );
  });
});

describe("windowAccessibilityLabel", () => {
  it("reads the window number, the active tab title and the count", () => {
    expect(windowAccessibilityLabel({ number: 2, title: "build", tabCount: 8 }, tr)).toBe(
      [t("workspace.window", { number: 2 }), "build", tn("workspace.tab_count", 8)].join(sep),
    );
  });
});

describe("windowSections", () => {
  it("labels the track only when there is a pinned block", () => {
    expect(windowSections({ pinned: 0, track: 3 })).toEqual({ pinned: false, trail: false });
    expect(windowSections({ pinned: 1, track: 3 })).toEqual({ pinned: true, trail: true });
    expect(windowSections({ pinned: 2, track: 0 })).toEqual({ pinned: true, trail: false });
  });
});

describe("resolveGroupColor", () => {
  it("takes the desktop theme color, else the default palette", () => {
    expect(resolveGroupColor({ groupColors: [0x112233, 0x445566] }, 1)).toBe(0x445566);
    expect(resolveGroupColor(null, 3)).toBe(defaultGroupColors[3]);
    expect(resolveGroupColor({ groupColors: [0x112233, 0x445566] }, 3)).toBe(0x445566);
  });
});

describe("matchSegments", () => {
  it("marks what the query matched, ignoring case and accents", () => {
    expect(matchSegments("~/Projetos/Ação", "acao")).toEqual([
      { text: "~/Projetos/", match: false },
      { text: "Ação", match: true },
    ]);
    expect(matchSegments("deploy@srv", "DEP srv")).toEqual([
      { text: "dep", match: true },
      { text: "loy@", match: false },
      { text: "srv", match: true },
    ]);
  });

  it("keeps the text whole without terms", () => {
    expect(matchSegments("/home", "  ")).toEqual([{ text: "/home", match: false }]);
    expect(matchSegments("", "x")).toEqual([]);
  });
});
