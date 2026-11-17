// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { t } from "@/i18n/catalog";
import { renderWithOverlays } from "@ui/overlay/testing";

import { openRenameGroupSheet } from "./RenameGroupSheet";
import { createFakeSheetSession, formsWorkspace } from "../testing";

async function openFor(groupId: number) {
  const session = createFakeSheetSession({ workspace: formsWorkspace() });
  const rendered = await renderWithOverlays(<View />);
  const onClose = jest.fn();
  await act(async () => {
    openRenameGroupSheet(rendered.overlay, { session, groupId, onClose });
  });
  return { ...rendered, session, onClose };
}

const field = () => screen.getByLabelText(t("common.group_name"));
const save = () => screen.getByRole("button", { name: t("common.save") });

describe("RenameGroupSheet", () => {
  it("opens with the group name, selected, and no restore", async () => {
    await openFor(10);

    expect(screen.getByTestId("rename-group-sheet-title")).toHaveTextContent(t("common.rename"));
    expect(field().props.value).toBe("Servers");
    expect(field().props.selectTextOnFocus).toBe(true);
    expect(screen.queryByRole("button", { name: t("rename.restore") })).toBeNull();
  });

  it("sends rename-group and closes", async () => {
    const { session, onClose } = await openFor(10);

    await fireEvent.changeText(field(), "Prod");
    await fireEvent.press(save());

    expect(session.sent).toEqual([{ type: "action", id: 1, do: { type: "rename-group", group: 10, name: "Prod" } }]);
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("disables Save on an empty name and sends nothing for the same name", async () => {
    const { session, onClose } = await openFor(10);

    await fireEvent.changeText(field(), "");
    expect(save()).toBeDisabled();

    await fireEvent.changeText(field(), "Servers ");
    await fireEvent.press(save());
    expect(session.sent).toEqual([]);
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("tells the user when the send failed", async () => {
    const { session, overlays, onClose } = await openFor(10);
    session.refuse("send-failed");

    await fireEvent.changeText(field(), "Prod");
    await fireEvent.press(save());

    expect(overlays.store.getState().toast).toMatchObject({ message: t("toast.send_failed"), severity: "error" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the group leaves the tree", async () => {
    const { session, onClose } = await openFor(12);

    await act(async () => {
      session.setWorkspace(null);
    });

    expect(onClose).toHaveBeenCalledWith("action");
  });
});
