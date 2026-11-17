// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { t } from "@/i18n/catalog";
import { renderWithOverlays } from "@ui/overlay/testing";

import { openRenameTabSheet } from "./RenameTabSheet";
import { TEST_DESKTOP_ID, createFakeSheetSession, formsWorkspace } from "../testing";

async function openFor(tabId: number) {
  const session = createFakeSheetSession({ workspace: formsWorkspace() });
  const rendered = await renderWithOverlays(<View />);
  const onClose = jest.fn();
  await act(async () => {
    openRenameTabSheet(rendered.overlay, { session, tabId, onClose });
  });
  return { ...rendered, session, onClose };
}

const field = () => screen.getByLabelText(t("rename.tab_field"));
const save = () => screen.getByRole("button", { name: t("common.save") });

describe("RenameTabSheet", () => {
  it("opens with the current title in the field, owned by the session", async () => {
    const { overlays } = await openFor(2);

    expect(screen.getByTestId("rename-tab-sheet-title")).toHaveTextContent(t("common.rename"));
    expect(field().props.value).toBe("zsh");
    expect(field().props.autoFocus).toBe(true);
    expect(field().props.selectTextOnFocus).toBe(true);
    expect(overlays.store.getState().entries[0]?.owner).toBe(`session:${TEST_DESKTOP_ID}`);
  });

  it("sends rename-tab with the new title and closes", async () => {
    const { session, onClose } = await openFor(2);

    await fireEvent.changeText(field(), "  server  ");
    await fireEvent.press(save());

    expect(session.sent).toEqual([{ type: "action", id: 1, do: { type: "rename-tab", tab: 2, title: "server" } }]);
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("disables Save on an empty title", async () => {
    const { session } = await openFor(2);

    await fireEvent.changeText(field(), "   ");

    expect(save()).toBeDisabled();
    await fireEvent(field(), "submitEditing");
    expect(session.sent).toEqual([]);
  });

  it("hides Restore automatic title for an automatic title", async () => {
    await openFor(2);
    expect(screen.queryByRole("button", { name: t("rename.restore") })).toBeNull();
  });

  it("restores the automatic title of a custom one", async () => {
    const { session, onClose } = await openFor(3);

    await fireEvent.press(screen.getByRole("button", { name: t("rename.restore") }));

    expect(session.sent).toEqual([{ type: "action", id: 1, do: { type: "rename-tab", tab: 3, title: null } }]);
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("sends nothing when a custom title is saved unchanged", async () => {
    const { session, onClose } = await openFor(3);

    await fireEvent.press(save());

    expect(session.sent).toEqual([]);
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("keeps the sheet open and tells the user when the action is refused", async () => {
    const { session, onClose, overlays } = await openFor(2);
    session.refuse("busy");

    await fireEvent.changeText(field(), "server");
    await fireEvent.press(save());

    expect(overlays.store.getState().toast).toMatchObject({ message: t("toast.action_busy"), severity: "info" });
    expect(onClose).not.toHaveBeenCalled();

    session.refuse("not-ready");
    await fireEvent.press(save());
    expect(overlays.store.getState().toast).toMatchObject({ message: t("toast.not_connected"), severity: "warning" });
  });

  it("closes when the tab leaves the tree", async () => {
    const { session, onClose } = await openFor(2);

    await act(async () => {
      session.setWorkspace({ ...formsWorkspace(), windows: [] });
    });

    expect(onClose).toHaveBeenCalledWith("action");
  });
});
