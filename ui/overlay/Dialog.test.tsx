// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";
import { createStore } from "zustand/vanilla";

import { sessionOwner } from "@/controllers/overlay";
import { setLocale, t } from "@/i18n/catalog";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { size } from "@ui/theme";

import { initialFocusIndex, isDestructiveButton, type DialogButton } from "./Dialog";
import { renderWithOverlays } from "./testing";

const sendEvent = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
const announce = jest.mocked(AccessibilityInfo.announceForAccessibilityWithOptions);

beforeEach(() => {
  sendEvent.mockClear();
  announce.mockClear();
});

afterEach(() => {
  setLocale("en_US");
});

function closeButtons(cancel = jest.fn(), confirm = jest.fn()): DialogButton[] {
  return [
    { label: "Cancel", role: "cancel", onPress: cancel },
    { label: "Close tab", variant: "destructiveText", onPress: confirm },
  ];
}

describe("initialFocusIndex", () => {
  it("is the cancel button by default, else the first, unless one is chosen", () => {
    expect(initialFocusIndex(closeButtons())).toBe(0);
    expect(initialFocusIndex([{ label: "OK" }, { label: "Cancel", role: "cancel" }])).toBe(1);
    expect(initialFocusIndex([{ label: "OK" }, { label: "More" }])).toBe(0);
    expect(initialFocusIndex(closeButtons(), 1)).toBe(1);
    expect(initialFocusIndex(closeButtons(), 5)).toBe(0);
  });
});

describe("isDestructiveButton", () => {
  it("is the destructive variants only", () => {
    expect(isDestructiveButton({ label: "Remove", variant: "destructiveText" })).toBe(true);
    expect(isDestructiveButton({ label: "Remove", variant: "destructive" })).toBe(true);
    expect(isDestructiveButton({ label: "Paste", variant: "primary" })).toBe(false);
    expect(isDestructiveButton({ label: "Cancel" })).toBe(false);
  });
});

describe("Dialog", () => {
  it("shows the title, the body and the buttons, with the focus ring on Cancel", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openDialog({
        title: "Close the tab “build”?",
        body: "The SSH connection of this tab is open.",
        buttons: closeButtons(),
      });
    });

    expect(screen.getByRole("header", { name: "Close the tab “build”?" })).toBeTruthy();
    expect(screen.getByText("The SSH connection of this tab is open.")).toBeTruthy();
    const ring = screen.getByTestId("dialog-focus");
    expect(within(ring).getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(within(ring).queryByRole("button", { name: "Close tab" })).toBeNull();
    expect(ring).toHaveStyle({ outlineWidth: size.focusWidth, outlineOffset: size.focusOffset });
    expect(screen.getByTestId("dialog-card")).toHaveStyle({ maxWidth: size.dialogMaxWidth });
  });

  it("puts the focus ring on the chosen button", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openDialog({ title: "Remove?", buttons: closeButtons(), initialFocus: 1 });
    });

    expect(within(screen.getByTestId("dialog-focus")).getByRole("button", { name: "Close tab" })).toBeTruthy();
  });

  it("moves the screen reader focus to the title and queues the announcement", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openDialog({ title: "Close?", buttons: closeButtons(), announcement: "60 seconds to answer" });
    });

    const focused = sendEvent.mock.calls
      .filter(([, kind]) => kind === "focus")
      .map(([target]) => (target as unknown as { props: { testID?: string } }).props.testID);
    expect(focused).toEqual(["dialog-title"]);
    expect(announce).toHaveBeenCalledWith("60 seconds to answer", { queue: true });
  });

  it("runs the button and closes", async () => {
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);
    const confirm = jest.fn();
    const onClose = jest.fn();

    await act(async () => {
      overlay.openDialog({ title: "Close?", buttons: closeButtons(jest.fn(), confirm), onClose });
    });
    await fireEvent.press(screen.getByRole("button", { name: "Close tab" }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("action");
    expect(overlays.store.getState().entries).toEqual([]);
    expect(screen.queryByTestId("dialog")).toBeNull();
    expect(screen.getByText("screen")).toBeTruthy();
  });

  it("stays open after a button that does not close it", async () => {
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);
    const confirm = jest.fn();

    await act(async () => {
      overlay.openDialog({
        title: "Close?",
        buttons: [{ label: "Cancel", role: "cancel" }, { label: "Close tab", onPress: confirm, closes: false }],
      });
    });
    await fireEvent.press(screen.getByRole("button", { name: "Close tab" }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(overlays.hasOpen()).toBe(true);
  });

  it("does not close on a touch outside", async () => {
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openDialog({ title: "Close?", buttons: closeButtons() });
    });
    await fireEvent.press(screen.getByTestId("dialog-scrim", { includeHiddenElements: true }));

    expect(overlays.hasOpen()).toBe(true);
  });

  it("answers a dismissal (back, escape) as Cancel", async () => {
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);
    const cancel = jest.fn();
    const confirm = jest.fn();

    await act(async () => {
      overlay.openDialog({ title: "Close?", buttons: closeButtons(cancel, confirm) });
    });
    await act(async () => {
      overlays.closeTop("dismiss");
    });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("does not answer Cancel when its session ends", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);
    const cancel = jest.fn();
    const onClose = jest.fn();

    await act(async () => {
      overlay.openDialog({
        title: "Close?",
        buttons: closeButtons(cancel),
        owner: sessionOwner("d1"),
        onClose,
      });
    });
    await act(async () => {
      overlay.closeOwnedBy(sessionOwner("d1"));
    });

    expect(cancel).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith("owner");
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("draws a body and a footer of any content", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openDialog({
        title: "Close?",
        body: <Text testID="processes">{"make"}</Text>,
        footer: <Text testID="deadline">{"38 s left to answer"}</Text>,
        buttons: closeButtons(),
      });
    });

    expect(screen.getByTestId("processes")).toHaveTextContent("make");
    expect(screen.getByTestId("deadline")).toHaveTextContent("38 s left to answer");
  });

  it("says the destructive button is a destructive action, before its own hint", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openDialog({
        title: "Remove?",
        buttons: [
          { label: "Cancel", role: "cancel", testID: "cancel" },
          { label: "Remove", variant: "destructiveText", testID: "remove" },
          { label: "Recreate", variant: "destructive", accessibilityHint: "Asks to unlock first", testID: "recreate" },
          { label: "More", accessibilityHint: "Opens the list", testID: "more" },
        ],
      });
    });

    expect(screen.getByTestId("cancel").props.accessibilityHint).toBeUndefined();
    expect(screen.getByTestId("remove").props.accessibilityHint).toBe(t("a11y.destructive"));
    expect(screen.getByTestId("recreate").props.accessibilityHint).toBe(
      [t("a11y.destructive"), "Asks to unlock first"].join(t("a11y.separator")),
    );
    expect(screen.getByTestId("more").props.accessibilityHint).toBe("Opens the list");
  });

  it("speaks the language of the moment in the destructive hint", async () => {
    const { overlay, services } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openDialog({
        title: "Remove?",
        buttons: [{ label: "Remove", variant: "destructiveText", testID: "remove" }],
      });
    });
    await act(async () => {
      await services.settings.update({ language: "pt_BR" });
    });

    expect(screen.getByTestId("remove").props.accessibilityHint).toBe("ação destrutiva");
  });
});

describe("live dialog", () => {
  const counter = createStore<{ readonly count: number }>()(() => ({ count: 1 }));

  beforeEach(() => {
    counter.setState({ count: 1 });
  });

  function useCountProps(cancel: () => void) {
    const tr = useT();
    const count = useStoreState(counter, (state) => state.count);
    return {
      title: tr.t("common.close"),
      body: `${count}`,
      buttons: [
        { label: tr.t("common.cancel"), role: "cancel" as const, onPress: cancel },
        { label: tr.t("common.ok"), disabled: count > 2 },
      ],
    };
  }

  it("reads its props at every render: the language and the stores", async () => {
    const { overlay, services } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openDialog({ useProps: () => useCountProps(jest.fn()) });
    });
    expect(screen.getByRole("header", { name: "Close" })).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "OK" })).toBeEnabled();

    await act(async () => {
      counter.setState({ count: 3 });
    });
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "OK" })).toBeDisabled();

    await act(async () => {
      await services.settings.update({ language: "pt_BR" });
    });
    expect(screen.getByRole("header", { name: "Fechar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
  });

  it("answers a dismissal with the Cancel of its latest render, and can close itself", async () => {
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);
    const cancel = jest.fn();
    const onClose = jest.fn();
    const controls: { close?: () => void } = {};

    await act(async () => {
      overlay.openDialog({
        useProps: (given) => {
          controls.close = given.close;
          return useCountProps(cancel);
        },
        onClose,
      });
    });
    await act(async () => {
      overlays.closeTop("dismiss");
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("dismiss");

    await act(async () => {
      overlay.openDialog({
        useProps: (given) => {
          controls.close = given.close;
          return useCountProps(cancel);
        },
      });
    });
    await act(async () => {
      controls.close?.();
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("dialog")).toBeNull();
  });
});
