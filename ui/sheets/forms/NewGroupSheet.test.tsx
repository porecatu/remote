// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { View } from "react-native";

import { t } from "@/i18n/catalog";
import { renderWithOverlays } from "@ui/overlay/testing";

import { openNewGroupSheet } from "./NewGroupSheet";
import { createFakeSheetSession, formsTheme, formsWorkspace } from "../testing";

async function openFor(tabId: number, theme = formsTheme()) {
  const session = createFakeSheetSession({ workspace: formsWorkspace(), theme });
  const rendered = await renderWithOverlays(<View />);
  const onClose = jest.fn();
  await act(async () => {
    openNewGroupSheet(rendered.overlay, { session, tabId, onClose });
  });
  return { ...rendered, session, onClose };
}

const field = () => screen.getByLabelText(t("common.group_name"));
const create = () => screen.getByRole("button", { name: t("new_group.create") });

describe("NewGroupSheet", () => {
  it("opens with an empty name, Create group disabled and Automatic chosen", async () => {
    await openFor(2);

    expect(screen.getByTestId("new-group-sheet-title")).toHaveTextContent(t("new_group.title"));
    expect(field().props.value).toBe("");
    expect(field().props.autoFocus).toBe(true);
    expect(create()).toBeDisabled();
    const colors = screen.getByTestId("new-group-color");
    expect(colors.props).toMatchObject({
      accessible: false,
      accessibilityRole: "radiogroup",
      accessibilityLabel: t("group_menu.color"),
    });
    const radios = within(colors).getAllByRole("radio");
    expect(radios.map((radio) => radio.props.accessibilityLabel)).toEqual([
      t("new_group.auto_color"),
      t("group_color.swatch", { index: 1, total: 3 }),
      t("group_color.swatch", { index: 2, total: 3 }),
      t("group_color.swatch", { index: 3, total: 3 }),
    ]);
    expect(radios[0]?.props.accessibilityState).toMatchObject({ checked: true });
  });

  it("creates the group with the tab and no color when Automatic", async () => {
    const { session, onClose } = await openFor(2);

    await fireEvent.changeText(field(), " Servers ");
    await fireEvent.press(create());

    expect(session.sent).toEqual([
      { type: "action", id: 1, do: { type: "new-group", tabs: [2], name: "Servers" } },
    ]);
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("sends the chosen color, marked without depending on the color", async () => {
    const { session } = await openFor(2);

    await fireEvent.press(screen.getByRole("radio", { name: t("group_color.swatch", { index: 3, total: 3 }) }));
    expect(screen.getByTestId("new-group-color-2-check", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("new-group-color-auto").props.accessibilityState).toMatchObject({ checked: false });

    await fireEvent.changeText(field(), "Logs");
    await fireEvent(field(), "submitEditing");

    expect(session.sent).toEqual([
      { type: "action", id: 1, do: { type: "new-group", tabs: [2], name: "Logs", color: 2 } },
    ]);
  });

  it("offers the six colors of the desktop when the theme has none", async () => {
    await openFor(2, { ...formsTheme(), groupColors: [] });

    expect(screen.getByRole("radio", { name: t("group_color.swatch", { index: 6, total: 6 }) })).toBeTruthy();
  });

  it("tells the user when another action on the tab is pending", async () => {
    const { session, overlays, onClose } = await openFor(2);
    session.refuse("busy");

    await fireEvent.changeText(field(), "Servers");
    await fireEvent.press(create());

    expect(overlays.store.getState().toast).toMatchObject({ message: t("toast.action_busy") });
    expect(onClose).not.toHaveBeenCalled();
    expect(field().props.value).toBe("Servers");
  });
});
