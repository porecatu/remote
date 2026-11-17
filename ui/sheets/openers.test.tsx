// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { t } from "@/i18n/catalog";
import { split, pane, tab, win, workspace } from "@/workspace/testing";
import type { OverlayApi } from "@ui/overlay";
import { renderWithOverlays, type RenderWithOverlaysResult } from "@ui/overlay/testing";
import { duration } from "@ui/theme";

import { createFakeSheetSession, formsTheme, formsWorkspace, type FakeSheetSession } from "./testing";
import { openGroupMenuFor, openNewTabFor, openTabMenuFor } from "./openers";

const hidden = { includeHiddenElements: true } as const;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

async function rig(session: FakeSheetSession = createFakeSheetSession({ workspace: formsWorkspace(), theme: formsTheme() })) {
  const result = await renderWithOverlays(<View />);
  return { ...result, session };
}

async function open(overlay: OverlayApi, opener: (api: OverlayApi) => string): Promise<string> {
  let id = "";
  await act(async () => {
    id = opener(overlay);
  });
  return id;
}

/** Lets the menu's exit animation end. */
async function finishTransition() {
  await act(async () => {
    jest.advanceTimersByTime(duration.sheet + 50);
  });
}

/** The sheets on screen, top last. */
function sheets(r: RenderWithOverlaysResult): number {
  return r.overlays.store.getState().entries.filter((entry) => entry.kind === "sheet").length;
}

describe("openTabMenuFor", () => {
  it.each([
    ["tab-menu-rename", "rename-tab-sheet"],
    ["tab-menu-move-to-group", "move-to-group-sheet"],
    ["tab-menu-move-to-window", "move-to-window-sheet"],
    ["tab-menu-new-group", "new-group-sheet"],
  ])("binds %s to its form sheet", async (item, form) => {
    const r = await rig();
    await open(r.overlay, (overlay) => openTabMenuFor(overlay, { session: r.session, tabId: 3 }));
    expect(screen.getByTestId("tab-menu-title")).toHaveTextContent("deploy");

    await fireEvent.press(screen.getByTestId(item, hidden));
    await finishTransition();

    expect(screen.queryByTestId("tab-menu", hidden)).toBeNull();
    expect(screen.getByTestId(form, hidden)).toBeTruthy();
    expect(sheets(r)).toBe(1);
  });

  it("offers Close pane for the pane the terminal shows", async () => {
    const tree = workspace([
      win(1, [tab(1, { layout: split(0, 32768, pane(100), pane(101)), focused: 100 }), tab(2)], { active: 1 }),
    ]);
    const r = await rig(createFakeSheetSession({ workspace: tree }));
    await open(r.overlay, (overlay) =>
      openTabMenuFor(overlay, { session: r.session, tabId: 1, fromTerminal: { paneId: 101 } }),
    );
    expect(screen.getByTestId("tab-menu-close-pane", hidden)).toBeTruthy();
  });

  it("belongs to the session: closing the session's overlays closes it", async () => {
    const r = await rig();
    await open(r.overlay, (overlay) => openTabMenuFor(overlay, { session: r.session, tabId: 2 }));
    expect(r.overlays.store.getState().entries[0]?.owner).toBe(`session:${r.session.desktopId}`);
  });
});

describe("openGroupMenuFor", () => {
  it.each([
    ["group-menu-rename", "rename-group-sheet"],
    ["group-menu-color", "group-color-sheet"],
    ["group-menu-move-to-window", "move-to-window-sheet"],
  ])("binds %s to its form sheet", async (item, form) => {
    const r = await rig();
    await open(r.overlay, (overlay) => openGroupMenuFor(overlay, { session: r.session, groupId: 10 }));
    expect(screen.getByTestId("group-menu-title")).toHaveTextContent("Servers");

    await fireEvent.press(screen.getByTestId(item, hidden));
    await finishTransition();

    expect(screen.queryByTestId("group-menu", hidden)).toBeNull();
    expect(screen.getByTestId(form, hidden)).toBeTruthy();
  });
});

describe("openNewTabFor", () => {
  it("opens the new tab sheet for a window", async () => {
    const r = await rig();
    await open(r.overlay, (overlay) => openNewTabFor(overlay, { session: r.session, windowId: 2 }));
    expect(screen.getByTestId("new-tab-sheet", hidden)).toBeTruthy();
    expect(screen.getByText(t("new_tab.context_window", { number: 2 }))).toBeTruthy();
  });

  it("opens the new tab sheet for a group", async () => {
    const r = await rig();
    await open(r.overlay, (overlay) => openNewTabFor(overlay, { session: r.session, windowId: 1, groupId: 10 }));
    expect(screen.getByText(t("new_tab.context_group", { group: "Servers" }))).toBeTruthy();
  });
});
