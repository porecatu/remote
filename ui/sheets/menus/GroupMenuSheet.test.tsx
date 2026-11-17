// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { t, tn } from "@/i18n/catalog";
import type { WorkspaceMessage } from "@/protocol";
import { collapseGroup, setGroupColor, ungroup } from "@/session/actions";
import { group, tab, win, workspace } from "@/workspace/testing";
import { renderWithOverlays } from "@ui/overlay/testing";
import { duration } from "@ui/theme";

import { openGroupMenu, type GroupMenuProps } from "./GroupMenuSheet";
import { createFakeSheetSession, type FakeSheetSession } from "../testing";

const hidden = { includeHiddenElements: true } as const;
const sep = t("a11y.separator");

// Window 1: group 10 "Servers" (3 tabs), group 11 "Solo" (1 tab, collapsed on
// the desktop). Window 2: tab 9.
function tree(windows = 2): WorkspaceMessage {
  const first = win(1, [
    group(10, [tab(1), tab(2), tab(3)], { name: "Servers" }),
    group(11, [tab(4)], { name: "Solo", collapsed: true }),
  ]);
  return workspace(windows === 1 ? [first] : [first, win(2, [tab(9)])]);
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

type Callbacks = Pick<GroupMenuProps, "onRename" | "onColor" | "onMoveToWindow">;

async function openMenu(session: FakeSheetSession, groupId: number): Promise<Callbacks> {
  const { overlay } = await renderWithOverlays(<View />);
  const callbacks = { onRename: jest.fn(), onColor: jest.fn(), onMoveToWindow: jest.fn() };
  await act(async () => {
    openGroupMenu(overlay, { session, groupId, ...callbacks });
  });
  return callbacks;
}

async function finishTransition() {
  await act(async () => {
    jest.advanceTimersByTime(duration.sheet + 50);
  });
}

function menuOrder(): string[] {
  return screen
    .getAllByTestId(/^group-menu-(rename|color|collapse|move-to-window|divider|ungroup)$/, hidden)
    .map((element) => String(element.props.testID).replace("group-menu-", ""));
}

function session(ws: WorkspaceMessage = tree()): FakeSheetSession {
  return createFakeSheetSession({ workspace: ws });
}

describe("GroupMenuSheet", () => {
  it("lists the items in the anatomy's order, titled with the group's name", async () => {
    await openMenu(session(), 10);

    expect(screen.getByTestId("group-menu-title")).toHaveTextContent("Servers");
    expect(menuOrder()).toEqual(["rename", "color", "collapse", "move-to-window", "divider", "ungroup"]);
    expect(screen.getAllByRole("button").map((button) => button.props.accessibilityLabel)).toEqual([
      t("common.rename"),
      t("group_menu.color"),
      t("group_menu.collapse_on_desktop"),
      t("common.move_to_window"),
      t("group_menu.ungroup"),
    ]);
    expect(screen.getByTestId("group-menu-ungroup").props.accessibilityHint).toBe(t("a11y.destructive"));
  });

  it("collapses an expanded group on the desktop", async () => {
    const fake = session();
    await openMenu(fake, 10);

    await fireEvent.press(screen.getByTestId("group-menu-collapse"));
    await finishTransition();

    expect(fake.sent).toEqual([collapseGroup(1, 10, true)]);
    expect(screen.queryByTestId("group-menu")).toBeNull();
  });

  it("expands a group collapsed on the desktop", async () => {
    const fake = session();
    await openMenu(fake, 11);

    expect(screen.getByTestId("group-menu-collapse").props.accessibilityLabel).toBe(
      t("group_menu.expand_on_desktop"),
    );
    await fireEvent.press(screen.getByTestId("group-menu-collapse"));

    expect(fake.sent).toEqual([collapseGroup(1, 11, false)]);
  });

  it("dims Move to window with a note when the desktop has a single window", async () => {
    await openMenu(session(tree(1)), 10);

    expect(screen.getByTestId("group-menu-move-to-window").props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByText(t("tab_menu.single_window_note"))).toBeTruthy();
  });

  it("asks before ungrouping and sends nothing on Cancel", async () => {
    const fake = session();
    await openMenu(fake, 10);

    await fireEvent.press(screen.getByTestId("group-menu-ungroup"));
    await finishTransition();

    expect(screen.queryByTestId("group-menu")).toBeNull();
    expect(screen.getByText(t("group_menu.ungroup_title", { name: "Servers" }))).toBeTruthy();
    expect(screen.getByText(tn("group_menu.ungroup_body", 3))).toBeTruthy();
    expect(fake.sent).toEqual([]);

    await fireEvent.press(screen.getByTestId("ungroup-cancel"));
    await finishTransition();
    expect(fake.sent).toEqual([]);
    expect(screen.queryByTestId("ungroup-dialog")).toBeNull();
  });

  it("ungroups once confirmed", async () => {
    const fake = session();
    await openMenu(fake, 11);

    await fireEvent.press(screen.getByTestId("group-menu-ungroup"));
    await finishTransition();
    expect(screen.getByText(tn("group_menu.ungroup_body", 1))).toBeTruthy();
    await fireEvent.press(screen.getByTestId("ungroup-confirm"));
    await finishTransition();

    expect(fake.sent).toEqual([ungroup(1, 11)]);
  });

  it.each([
    ["rename", "onRename"],
    ["color", "onColor"],
    ["move-to-window", "onMoveToWindow"],
  ] as const)("hands %s to %s after closing", async (item, callback) => {
    const callbacks = await openMenu(session(), 10);

    await fireEvent.press(screen.getByTestId(`group-menu-${item}`));
    await finishTransition();

    expect(callbacks[callback]).toHaveBeenCalledWith(10);
    expect(screen.queryByTestId("group-menu")).toBeNull();
  });

  it("shows a pending action on its item and takes no other action on the group", async () => {
    const fake = session();
    expect(fake.sendAction((id) => setGroupColor(id, 10, 2)).ok).toBe(true);
    await openMenu(fake, 10);

    const color = screen.getByTestId("group-menu-color");
    expect(color.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    expect(color.props.accessibilityLabel).toBe([t("group_menu.color"), t("a11y.pending")].join(sep));
    for (const other of ["rename", "collapse", "move-to-window", "ungroup"]) {
      expect(screen.getByTestId(`group-menu-${other}`).props.accessibilityState).toMatchObject({ disabled: true });
    }
  });

  it("warns when the session refuses the action", async () => {
    const fake = session();
    fake.refuse("busy");
    await openMenu(fake, 10);

    await fireEvent.press(screen.getByTestId("group-menu-collapse"));
    await finishTransition();

    expect(screen.getByText(t("toast.action_busy"))).toBeTruthy();
  });

  it("closes when the group leaves the tree", async () => {
    const fake = session();
    await openMenu(fake, 11);

    await act(async () => {
      fake.store.setState({ workspace: workspace([win(1, [tab(4)])]) });
    });
    await finishTransition();

    expect(screen.queryByTestId("group-menu")).toBeNull();
  });
});
