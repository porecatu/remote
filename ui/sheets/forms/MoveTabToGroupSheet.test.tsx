// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { View } from "react-native";

import { t, tn } from "@/i18n/catalog";
import { renderWithOverlays } from "@ui/overlay/testing";

import { openMoveTabToGroupSheet } from "./MoveTabToGroupSheet";
import { createFakeSheetSession, formsTheme, formsWorkspace } from "../testing";

async function openFor(tabId: number) {
  const session = createFakeSheetSession({ workspace: formsWorkspace(), theme: formsTheme() });
  const rendered = await renderWithOverlays(<View />);
  const onClose = jest.fn();
  await act(async () => {
    openMoveTabToGroupSheet(rendered.overlay, { session, tabId, onClose });
  });
  return { ...rendered, session, onClose };
}

const sep = () => t("a11y.separator");

describe("MoveTabToGroupSheet", () => {
  it("lists No group on top and the groups of the tab's window, the current one checked and disabled", async () => {
    await openFor(3);

    expect(screen.getByTestId("move-to-group-sheet-title")).toHaveTextContent(t("move.to_group_title"));
    const group = screen.getByTestId("move-to-group-choices");
    expect(group.props).toMatchObject({
      accessible: false,
      accessibilityRole: "radiogroup",
      accessibilityLabel: t("move.to_group_title"),
    });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => radio.props.accessibilityLabel)).toEqual([
      t("move.no_group"),
      ["Servers", tn("workspace.tab_count", 2), t("move.current")].join(sep()),
      ["Build", tn("workspace.tab_count", 1)].join(sep()),
    ]);
    const current = screen.getByTestId("move-to-group-10");
    expect(current).toBeDisabled();
    expect(current.props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByTestId("move-to-group-10-check", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText("Logs")).toBeNull();
    expect(screen.queryByText(t("move.no_groups_note"))).toBeNull();
  });

  it("moves the tab to another group and closes", async () => {
    const { session, onClose } = await openFor(3);

    await fireEvent.press(screen.getByTestId("move-to-group-11"));

    expect(session.sent).toEqual([
      { type: "action", id: 1, do: { type: "move-tab-to-group", tab: 3, group: 11 } },
    ]);
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("sends null for No group", async () => {
    const { session } = await openFor(3);

    await fireEvent.press(screen.getByTestId("move-to-group-none"));

    expect(session.sent).toEqual([
      { type: "action", id: 1, do: { type: "move-tab-to-group", tab: 3, group: null } },
    ]);
  });

  it("marks No group as current for a loose tab", async () => {
    await openFor(2);

    const none = screen.getByTestId("move-to-group-none");
    expect(none).toBeDisabled();
    expect(none.props.accessibilityLabel).toBe([t("move.no_group"), t("move.current")].join(sep()));
  });

  it("shows only No group and the note in a window with no groups", async () => {
    await openFor(6);

    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByText(t("move.no_groups_note"))).toBeTruthy();
  });

  it("tells the user when another action on the tab is pending", async () => {
    const { session, overlays, onClose } = await openFor(3);
    session.refuse("busy");

    await fireEvent.press(screen.getByTestId("move-to-group-11"));

    expect(overlays.store.getState().toast).toMatchObject({ message: t("toast.action_busy") });
    expect(onClose).not.toHaveBeenCalled();
  });
});
