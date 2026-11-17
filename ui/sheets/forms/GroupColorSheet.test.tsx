// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { t } from "@/i18n/catalog";
import { renderWithOverlays } from "@ui/overlay/testing";
import { size } from "@ui/theme";

import { openGroupColorSheet } from "./GroupColorSheet";
import { createFakeSheetSession, formsTheme, formsWorkspace } from "../testing";

async function openFor(groupId: number) {
  const session = createFakeSheetSession({ workspace: formsWorkspace(), theme: formsTheme() });
  const rendered = await renderWithOverlays(<View />);
  const onClose = jest.fn();
  await act(async () => {
    openGroupColorSheet(rendered.overlay, { session, groupId, onClose });
  });
  return { ...rendered, session, onClose };
}

const swatch = (index: number) => screen.getByRole("radio", { name: t("group_color.swatch", { index, total: 3 }) });

describe("GroupColorSheet", () => {
  it("shows the palette with the current color marked and no Automatic", async () => {
    await openFor(10);

    expect(screen.getByTestId("group-color-sheet-title")).toHaveTextContent(t("group_color.title"));
    expect(screen.getByTestId("group-color").props).toMatchObject({
      accessible: false,
      accessibilityRole: "radiogroup",
      accessibilityLabel: t("group_color.title"),
    });
    expect(screen.queryByRole("radio", { name: t("new_group.auto_color") })).toBeNull();
    expect(swatch(2).props.accessibilityState).toMatchObject({ checked: true });
    expect(swatch(1).props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByTestId("group-color-1-check", { includeHiddenElements: true })).toBeTruthy();
  });

  it("gives every swatch a full touch target", async () => {
    await openFor(10);

    expect(screen.getByTestId("group-color-0")).toHaveStyle({ width: size.targetMin, height: size.targetMin });
  });

  it("applies a color at once and closes", async () => {
    const { session, onClose } = await openFor(10);

    await fireEvent.press(swatch(3));

    expect(session.sent).toEqual([
      { type: "action", id: 1, do: { type: "set-group-color", group: 10, color: 2 } },
    ]);
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("only closes on the current color", async () => {
    const { session, onClose } = await openFor(10);

    await fireEvent.press(swatch(2));

    expect(session.sent).toEqual([]);
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("tells the user when the group has a pending action", async () => {
    const { session, overlays, onClose } = await openFor(10);
    session.refuse("busy");

    await fireEvent.press(swatch(1));

    expect(overlays.store.getState().toast).toMatchObject({ message: t("toast.action_busy") });
    expect(onClose).not.toHaveBeenCalled();
  });
});
