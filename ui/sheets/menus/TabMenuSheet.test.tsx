// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { t } from "@/i18n/catalog";
import type { WorkspaceMessage } from "@/protocol";
import { closeTab, renameTab } from "@/session/actions";
import { group, pane, PROFILES, split, tab, win, workspace } from "@/workspace/testing";
import { renderWithOverlays } from "@ui/overlay/testing";
import { duration } from "@ui/theme";

import { createFakeSheetSession, type FakeSheetSession } from "../testing";
import { openTabMenu, tabMenuContext, type TabMenuProps } from "./TabMenuSheet";

const hidden = { includeHiddenElements: true } as const;
const sep = t("a11y.separator");

// Window 1: pinned tab 4; loose tab 1; group 10 "Servers" with tabs 2 and 3
// (tab 3 has the panes 300 and 301). Window 2: tab 5.
const TWO_PANES = tab(3, { layout: split(0, 32768, pane(300), pane(301)), focused: 300 });

function twoWindows(): WorkspaceMessage {
  return workspace([
    win(1, [tab(1), group(10, [tab(2), TWO_PANES], { name: "Servers" })], { pinned: [tab(4)] }),
    win(2, [tab(5)]),
  ]);
}

function oneWindow(): WorkspaceMessage {
  return workspace([win(1, [tab(1), group(10, [tab(2), TWO_PANES], { name: "Servers" })])]);
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

type Callbacks = Pick<TabMenuProps, "onRename" | "onMoveToGroup" | "onMoveToWindow" | "onNewGroup">;

async function openMenu(
  session: FakeSheetSession,
  props: Omit<TabMenuProps, "session" | keyof Callbacks>,
): Promise<Callbacks & { readonly sheetId: string }> {
  const { overlay } = await renderWithOverlays(<View />);
  const callbacks = {
    onRename: jest.fn(),
    onMoveToGroup: jest.fn(),
    onMoveToWindow: jest.fn(),
    onNewGroup: jest.fn(),
  };
  let sheetId = "";
  await act(async () => {
    sheetId = openTabMenu(overlay, { session, ...callbacks, ...props });
  });
  return { ...callbacks, sheetId };
}

/** Lets a sheet's exit animation end. */
async function finishTransition() {
  await act(async () => {
    jest.advanceTimersByTime(duration.sheet + 50);
  });
}

/** The items and the divider of the menu, in order. */
function menuOrder(): string[] {
  return screen
    .getAllByTestId(/^tab-menu-(rename|move-to-group|move-to-window|new-group|divider|close-pane|close-tab)$/, hidden)
    .map((element) => String(element.props.testID).replace("tab-menu-", ""));
}

function session(ws: WorkspaceMessage = twoWindows()): FakeSheetSession {
  return createFakeSheetSession({ workspace: ws, profiles: PROFILES });
}

describe("TabMenuSheet", () => {
  it("lists the items of a loose tab in the anatomy's order, titled with the tab", async () => {
    await openMenu(session(), { tabId: 1 });

    expect(screen.getByTestId("tab-menu-title")).toHaveTextContent("tab 1");
    expect(screen.getByTestId("tab-menu-title").props.accessibilityRole).toBe("header");
    expect(screen.getByText(t("workspace.window", { number: 1 }))).toBeTruthy();
    expect(menuOrder()).toEqual(["rename", "move-to-group", "move-to-window", "new-group", "divider", "close-tab"]);
    expect(screen.getAllByRole("button").map((button) => button.props.accessibilityLabel)).toEqual([
      t("common.rename"),
      t("tab_menu.move_to_group"),
      t("common.move_to_window"),
      t("tab_menu.new_group"),
      t("common.close_tab"),
    ]);
  });

  it("says the group and the window of a grouped tab", async () => {
    await openMenu(session(), { tabId: 2 });

    expect(screen.getByText(t("tab_menu.subtitle_group_window", { group: "Servers", number: 1 }))).toBeTruthy();
  });

  it("dims Move to window with a note when the desktop has a single window", async () => {
    await openMenu(session(oneWindow()), { tabId: 2 });

    const move = screen.getByTestId("tab-menu-move-to-window");
    expect(move.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(t("tab_menu.single_window_note"))).toBeTruthy();
    expect(screen.getByText(t("tab_menu.subtitle_group", { group: "Servers" }))).toBeTruthy();
    expect(menuOrder()).toContain("move-to-window");
  });

  it("has no line under the title for a loose tab of the only window", () => {
    const context = tabMenuContext({ workspace: oneWindow(), profiles: PROFILES }, 1);
    expect(context).toMatchObject({ windowCount: 1, groupName: null });
  });

  it("offers only Rename and Close tab on a pinned tab", async () => {
    await openMenu(session(), { tabId: 4, fromTerminal: { paneId: 400 } });

    expect(menuOrder()).toEqual(["rename", "divider", "close-tab"]);
  });

  it("closes a pinned tab right away: the only confirmation is the desktop's", async () => {
    const fake = session();
    await openMenu(fake, { tabId: 4 });

    await fireEvent.press(screen.getByTestId("tab-menu-close-tab"));
    await finishTransition();

    expect(fake.sent).toEqual([closeTab(1, 4)]);
    expect(screen.queryByTestId("tab-menu")).toBeNull();
    // No dialog of the app opens before the action.
    expect(screen.queryByRole("header")).toBeNull();
  });

  it("closes a loose tab right away and closes the menu", async () => {
    const fake = session();
    await openMenu(fake, { tabId: 1 });

    await fireEvent.press(screen.getByTestId("tab-menu-close-tab"));
    await finishTransition();

    expect(fake.sent).toEqual([closeTab(1, 1)]);
    expect(screen.queryByTestId("tab-menu")).toBeNull();
  });

  it("offers Close pane from the terminal on a tab with two panes, for the pane seen", async () => {
    const fake = session();
    await openMenu(fake, { tabId: 3, fromTerminal: { paneId: 301 } });

    expect(menuOrder()).toEqual([
      "rename",
      "move-to-group",
      "move-to-window",
      "new-group",
      "divider",
      "close-pane",
      "close-tab",
    ]);
    await fireEvent.press(screen.getByTestId("tab-menu-close-pane"));
    await finishTransition();

    expect(fake.sent).toEqual([{ type: "action", id: 1, do: { type: "close-pane", pane: 301 } }]);
    expect(screen.queryByTestId("tab-menu")).toBeNull();
  });

  it("has no Close pane from the tree", async () => {
    await openMenu(session(), { tabId: 3 });
    expect(menuOrder()).not.toContain("close-pane");
  });

  it("has no Close pane from the terminal on a tab with one pane", async () => {
    await openMenu(session(), { tabId: 1, fromTerminal: { paneId: 100 } });
    expect(menuOrder()).not.toContain("close-pane");
  });

  it("hands Rename, the moves and New group to the callbacks after closing", async () => {
    const callbacks = await openMenu(session(), { tabId: 2 });

    await fireEvent.press(screen.getByTestId("tab-menu-rename"));
    await finishTransition();

    expect(callbacks.onRename).toHaveBeenCalledWith(2);
    expect(screen.queryByTestId("tab-menu")).toBeNull();
  });

  it.each([
    ["move-to-group", "onMoveToGroup"],
    ["move-to-window", "onMoveToWindow"],
    ["new-group", "onNewGroup"],
  ] as const)("hands %s to %s", async (item, callback) => {
    const callbacks = await openMenu(session(), { tabId: 1 });

    await fireEvent.press(screen.getByTestId(`tab-menu-${item}`));

    expect(callbacks[callback]).toHaveBeenCalledWith(1);
  });

  it("shows a pending action on its item and takes no other action on the tab", async () => {
    const fake = session();
    expect(fake.sendAction((id) => renameTab(id, 1, "x")).ok).toBe(true);
    await openMenu(fake, { tabId: 1 });

    const rename = screen.getByTestId("tab-menu-rename");
    expect(rename.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    expect(rename.props.accessibilityLabel).toBe([t("common.rename"), t("a11y.pending")].join(sep));
    expect(screen.getByTestId("tab-menu-rename-spinner", hidden)).toBeTruthy();
    for (const other of ["move-to-group", "move-to-window", "new-group", "close-tab"]) {
      expect(screen.getByTestId(`tab-menu-${other}`).props.accessibilityState).toMatchObject({ disabled: true });
    }

    await act(async () => {
      fake.answer(1);
    });
    expect(screen.getByTestId("tab-menu-close-tab").props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.queryByTestId("tab-menu-rename-spinner", hidden)).toBeNull();
  });

  it("warns when the session refuses the action", async () => {
    const fake = session();
    fake.refuse("not-ready");
    await openMenu(fake, { tabId: 1 });

    await fireEvent.press(screen.getByTestId("tab-menu-close-tab"));
    await finishTransition();

    expect(fake.sent).toEqual([]);
    expect(screen.getByText(t("toast.not_connected"))).toBeTruthy();
  });

  it("closes when the tab leaves the tree", async () => {
    const fake = session();
    await openMenu(fake, { tabId: 5 });
    expect(screen.getByTestId("tab-menu-title")).toHaveTextContent("tab 5");

    await act(async () => {
      fake.store.setState({ workspace: oneWindow() });
    });
    await finishTransition();

    expect(screen.queryByTestId("tab-menu")).toBeNull();
  });

  it("marks Close tab as destructive for the screen reader", async () => {
    await openMenu(session(), { tabId: 1 });

    expect(screen.getByTestId("tab-menu-close-tab").props.accessibilityHint).toBe(t("a11y.destructive"));
    expect(screen.getByTestId("tab-menu-rename").props.accessibilityHint).toBeUndefined();
  });
});
