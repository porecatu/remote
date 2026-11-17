// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { t, tn } from "@/i18n/catalog";
import { group, tab, win, workspace } from "@/workspace/testing";
import { renderWithOverlays } from "@ui/overlay/testing";

import type { MoveTarget } from "./model";
import { openMoveToWindowSheet } from "./MoveToWindowSheet";
import { createFakeSheetSession, formsWorkspace } from "../testing";

async function openFor(target: MoveTarget) {
  const session = createFakeSheetSession({ workspace: formsWorkspace() });
  const rendered = await renderWithOverlays(<View />);
  const onClose = jest.fn();
  await act(async () => {
    openMoveToWindowSheet(rendered.overlay, { session, target, onClose });
  });
  return { ...rendered, session, onClose };
}

describe("MoveToWindowSheet", () => {
  it("lists the other windows by the title of their active tab, with the tab count", async () => {
    await openFor({ kind: "tab", id: 3 });

    expect(screen.getByTestId("move-to-window-sheet-title")).toHaveTextContent(t("move.to_window_title"));
    expect(screen.queryByTestId("move-to-window-1")).toBeNull();
    const htop = screen.getByTestId("move-to-window-2");
    expect(htop.props.accessibilityLabel).toBe(["htop", tn("workspace.tab_count", 1)].join(t("a11y.separator")));
    expect(screen.getByText(tn("workspace.tab_count", 2))).toBeTruthy();
  });

  it("moves a tab and closes", async () => {
    const { session, onClose } = await openFor({ kind: "tab", id: 3 });

    await fireEvent.press(screen.getByRole("button", { name: /^logs/ }));

    expect(session.sent).toEqual([
      { type: "action", id: 1, do: { type: "move-tab-to-window", tab: 3, window: 3 } },
    ]);
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("moves a group, leaving its own window out", async () => {
    const { session } = await openFor({ kind: "group", id: 12 });

    expect(screen.queryByTestId("move-to-window-3")).toBeNull();
    await fireEvent.press(screen.getByTestId("move-to-window-1"));

    expect(session.sent).toEqual([
      { type: "action", id: 1, do: { type: "move-group-to-window", group: 12, window: 1 } },
    ]);
  });

  it("says there is only one window when the others closed", async () => {
    const { session } = await openFor({ kind: "tab", id: 3 });

    await act(async () => {
      session.setWorkspace(workspace([win(1, [group(10, [tab(3)])])]));
    });

    expect(screen.getByText(t("tab_menu.single_window_note"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: /htop/ })).toBeNull();
  });

  it("tells the user when the desktop is not connected", async () => {
    const { session, overlays, onClose } = await openFor({ kind: "group", id: 12 });
    session.refuse("not-ready");

    await fireEvent.press(screen.getByTestId("move-to-window-2"));

    expect(overlays.store.getState().toast).toMatchObject({ message: t("toast.not_connected") });
    expect(onClose).not.toHaveBeenCalled();
  });
});
