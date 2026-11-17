// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { createRef, type ComponentRef } from "react";
import { AccessibilityInfo, Text } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

import { sessionOwner } from "@/controllers/overlay";
import { duration, size } from "@ui/theme";

import { Sheet, SheetDivider, SheetItem } from "./Sheet";
import { renderWithOverlays } from "./testing";

const sendEvent = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);

beforeEach(() => {
  jest.useFakeTimers();
  sendEvent.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

/** The test ids of the elements that got the screen reader focus, in order (the mocked `Text` is a class). */
function focusedTestIds(): unknown[] {
  return sendEvent.mock.calls
    .filter(([, kind]) => kind === "focus")
    .map(([target]) => (target as unknown as { props: { testID?: string } }).props.testID);
}

/** Lets the exit animation of a sheet run to its end. */
async function finishTransition() {
  await act(async () => {
    jest.advanceTimersByTime(duration.sheet + 50);
  });
}

describe("Sheet", () => {
  it("opens over the screen with the handle, the title and the items", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);
    const rename = jest.fn();

    await act(async () => {
      overlay.openSheet(() => (
        <Sheet title="build" subtitle="In Window 1">
          <SheetItem label="Rename" icon="pencil" onPress={rename} testID="rename" />
        </Sheet>
      ));
    });

    expect(screen.getByTestId("sheet-title")).toHaveTextContent("build");
    expect(screen.getByText("In Window 1")).toBeTruthy();
    expect(screen.getByTestId("sheet-handle", { includeHiddenElements: true })).toHaveStyle({
      width: size.sheetHandleWidth,
      height: size.sheetHandleHeight,
    });
    await fireEvent.press(screen.getByRole("button", { name: "Rename" }));
    expect(rename).toHaveBeenCalledTimes(1);
  });

  it("moves the screen reader focus to the title", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openSheet(() => <Sheet title="build" />);
    });

    expect(focusedTestIds()).toEqual(["sheet-title"]);
  });

  it("hides the screen under it from the screen reader while open", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);
    const underlay = () => screen.getByTestId("underlay", { includeHiddenElements: true });
    expect(underlay().props.importantForAccessibility).toBe("auto");
    expect(screen.getByText("screen")).toBeTruthy();

    let id = "";
    await act(async () => {
      id = overlay.openSheet(() => <Sheet title="build" />);
    });

    expect(underlay().props.importantForAccessibility).toBe("no-hide-descendants");
    expect(underlay().props.accessibilityElementsHidden).toBe(true);
    expect(screen.queryByText("screen")).toBeNull();

    await act(async () => {
      overlay.close(id);
    });
    await finishTransition();

    expect(underlay().props.importantForAccessibility).toBe("auto");
    expect(screen.getByText("screen")).toBeTruthy();
  });

  it("closes on a touch outside, after the exit transition", async () => {
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);
    const onClose = jest.fn();

    await act(async () => {
      overlay.openSheet(() => <Sheet title="build" />, { onClose });
    });
    await fireEvent.press(screen.getByTestId("sheet-scrim", { includeHiddenElements: true }));

    expect(onClose).toHaveBeenCalledWith("dismiss");
    expect(overlays.hasOpen()).toBe(false);
    // Still drawn while it goes down.
    expect(screen.getByTestId("sheet-title", { includeHiddenElements: true })).toBeTruthy();

    await finishTransition();

    expect(screen.queryByTestId("sheet-title", { includeHiddenElements: true })).toBeNull();
    expect(overlays.store.getState().entries).toEqual([]);
  });

  it("has no transition when the system asks to reduce motion", async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValueOnce(true);
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);

    let id = "";
    await act(async () => {
      id = overlay.openSheet(() => <Sheet title="build" />);
    });
    expect(screen.getByTestId("sheet-panel")).toHaveAnimatedStyle({
      transform: [{ translateY: "0%" }, { translateY: 0 }],
    });
    await act(async () => {
      overlay.close(id);
    });

    // Gone at once, with no time passing.
    expect(overlays.store.getState().entries).toEqual([]);
    expect(screen.queryByTestId("sheet-title", { includeHiddenElements: true })).toBeNull();
  });

  it("rises in duration.sheet", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openSheet(() => <Sheet title="build" />);
    });
    expect(screen.getByTestId("sheet-panel")).toHaveAnimatedStyle({
      transform: [{ translateY: "100%" }, { translateY: 0 }],
    });
    await act(async () => {
      jest.advanceTimersByTime(duration.sheet + 50);
    });
    expect(screen.getByTestId("sheet-panel")).toHaveAnimatedStyle({
      transform: [{ translateY: "0%" }, { translateY: 0 }],
    });
  });

  it("closes from its content (Cancel)", async () => {
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openSheet(({ close }) => (
        <Sheet title="build">
          <SheetItem label="Cancel" icon="x" onPress={close} />
        </Sheet>
      ));
    });
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    await finishTransition();

    expect(overlays.store.getState().entries).toEqual([]);
  });

  it("closes on a drag down of the handle, and springs back on a short one", async () => {
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);
    const onClose = jest.fn();

    await act(async () => {
      overlay.openSheet(() => <Sheet title="build" />, { onClose });
    });

    await act(async () => {
      fireGestureHandler(getByGestureTestId("sheet-drag"), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: size.targetMin / 2 },
        { state: State.END, translationY: size.targetMin / 2 },
      ]);
      // The gesture answers through `scheduleOnRN`, a microtask under the fake timers.
      jest.runAllTicks();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(overlays.hasOpen()).toBe(true);

    await act(async () => {
      fireGestureHandler(getByGestureTestId("sheet-drag"), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: size.targetMin * 2 },
        { state: State.END, translationY: size.targetMin * 2 },
      ]);
      // The gesture answers through `scheduleOnRN`, a microtask under the fake timers.
      jest.runAllTicks();
    });
    expect(onClose).toHaveBeenCalledWith("dismiss");
    await finishTransition();
    expect(overlays.store.getState().entries).toEqual([]);
  });

  it("closes the sheets of a session that ended, keeping the app's", async () => {
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openSheet(() => <Sheet title="app" testID="app-sheet" />);
      overlay.openSheet(() => <Sheet title="session" testID="session-sheet" />, {
        owner: sessionOwner("d1"),
      });
    });
    await act(async () => {
      overlay.closeOwnedBy(sessionOwner("d1"));
    });
    await finishTransition();

    expect(screen.queryByTestId("session-sheet-title")).toBeNull();
    expect(screen.getByTestId("app-sheet-title")).toHaveTextContent("app");
    expect(overlays.store.getState().entries).toHaveLength(1);
  });

  it("returns the screen reader focus to the element that opened it", async () => {
    const origin = createRef<ComponentRef<typeof Text>>();
    const { overlay } = await renderWithOverlays(
      <Text ref={origin} testID="menu-button">
        {"screen"}
      </Text>,
    );

    let id = "";
    await act(async () => {
      id = overlay.openSheet(() => <Sheet title="build" />, { origin });
    });
    sendEvent.mockClear();
    await act(async () => {
      overlay.close(id);
    });
    await finishTransition();

    expect(focusedTestIds()).toEqual(["menu-button"]);
  });

  it("leaves the focus with the sheet it opened on its way out (menu → form)", async () => {
    const origin = createRef<ComponentRef<typeof Text>>();
    const { overlay } = await renderWithOverlays(
      <Text ref={origin} testID="menu-button">
        {"screen"}
      </Text>,
    );

    let menu = "";
    await act(async () => {
      menu = overlay.openSheet(() => <Sheet title="menu" />, { origin });
    });
    let form = "";
    await act(async () => {
      overlay.close(menu);
      form = overlay.openSheet(() => <Sheet title="form" />, { origin });
    });
    sendEvent.mockClear();
    await finishTransition();
    expect(focusedTestIds()).not.toContain("menu-button");

    await act(async () => {
      overlay.close(form);
    });
    await finishTransition();
    expect(focusedTestIds()).toContain("menu-button");
  });
});

describe("SheetItem", () => {
  it("announces a destructive item as such", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openSheet(() => (
        <Sheet title="build">
          <SheetItem label="Rename" icon="pencil" onPress={jest.fn()} />
          <SheetDivider testID="divider" />
          <SheetItem label="Close tab" icon="x" destructive onPress={jest.fn()} />
        </Sheet>
      ));
    });

    expect(screen.getByRole("button", { name: "Close tab" }).props.accessibilityHint).toBe(
      "destructive action",
    );
    expect(screen.getByRole("button", { name: "Rename" }).props.accessibilityHint).toBeUndefined();
    expect(screen.getByTestId("divider", { includeHiddenElements: true })).toBeTruthy();
  });

  it("is dimmed with its note when disabled, and takes no touch", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);
    const onPress = jest.fn();

    await act(async () => {
      overlay.openSheet(() => (
        <Sheet title="build">
          <SheetItem
            label="Move to window…"
            icon="app-window"
            disabled
            note="There is only one window on the desktop."
            onPress={onPress}
          />
        </Sheet>
      ));
    });

    const item = screen.getByRole("button", { name: "Move to window…" });
    expect(item).toBeDisabled();
    expect(screen.getByText("There is only one window on the desktop.")).toBeTruthy();
    await fireEvent.press(item);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("shows a spinner and says pending while its action waits", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);
    const onPress = jest.fn();

    await act(async () => {
      overlay.openSheet(() => (
        <Sheet title="build">
          <SheetItem label="Rename" icon="pencil" pending onPress={onPress} testID="rename" />
        </Sheet>
      ));
    });

    const item = screen.getByRole("button", { name: "Rename, pending" });
    expect(item.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    expect(screen.getByTestId("rename-spinner", { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(item);
    expect(onPress).not.toHaveBeenCalled();
  });
});
