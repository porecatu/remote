// SPDX-License-Identifier: GPL-3.0-or-later
import { act, screen, within } from "@testing-library/react-native";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { BackHandler, Text } from "react-native";

import { Sheet } from "./Sheet";
import { renderWithOverlays } from "./testing";

type BackListener = () => boolean | undefined;

/** Records the back button listeners, latest first, as Android calls them. */
function spyBackHandler() {
  const listeners: BackListener[] = [];
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, listener) => {
    const entry = listener as BackListener;
    listeners.unshift(entry);
    return {
      remove: () => {
        const index = listeners.indexOf(entry);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      },
    };
  });
  return {
    listeners,
    /** Presses back: true when a listener took it (otherwise the navigator would). */
    press(): boolean {
      return listeners.some((listener) => listener() === true);
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("OverlayHost", () => {
  it("listens to the back button only while an overlay is open", async () => {
    const back = spyBackHandler();
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);
    expect(back.listeners).toHaveLength(0);

    let id = "";
    await act(async () => {
      id = overlay.openSheet(() => <Sheet title="menu" />);
    });
    expect(back.listeners).toHaveLength(1);

    await act(async () => {
      overlay.close(id);
    });
    expect(back.listeners).toHaveLength(0);
    expect(back.press()).toBe(false);
  });

  it("closes the top overlay on back, one per press", async () => {
    const back = spyBackHandler();
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);
    const cancel = jest.fn();
    const sheetClosed = jest.fn();

    await act(async () => {
      overlay.openSheet(() => <Sheet title="menu" />, { onClose: sheetClosed });
      overlay.openDialog({
        title: "Close?",
        buttons: [{ label: "Cancel", role: "cancel", onPress: cancel }, { label: "Close tab" }],
      });
    });

    let handled = false;
    await act(async () => {
      handled = back.press();
    });
    expect(handled).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(sheetClosed).not.toHaveBeenCalled();
    expect(screen.queryByTestId("dialog")).toBeNull();
    expect(screen.getByTestId("sheet-title")).toHaveTextContent("menu");

    await act(async () => {
      handled = back.press();
    });
    expect(handled).toBe(true);
    expect(sheetClosed).toHaveBeenCalledWith("dismiss");
    expect(overlays.hasOpen()).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(back.press()).toBe(false);
  });

  it("keeps the overlays under the top one out of the screen reader tree", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    let sheet = "";
    let dialog = "";
    await act(async () => {
      sheet = overlay.openSheet(() => <Sheet title="menu" />);
      dialog = overlay.openDialog({ title: "Close?", buttons: [{ label: "Cancel", role: "cancel" }] });
    });

    const lower = screen.getByTestId(`overlay-${sheet}`, { includeHiddenElements: true });
    const upper = screen.getByTestId(`overlay-${dialog}`);
    expect(lower.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(lower.props.accessibilityViewIsModal).toBe(false);
    expect(upper.props.importantForAccessibility).toBe("auto");
    expect(upper.props.accessibilityViewIsModal).toBe(true);
    expect(screen.queryByText("menu")).toBeNull();
    expect(screen.getByText("Close?")).toBeTruthy();
  });

  it("closes the top overlay on the screen reader escape gesture", async () => {
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);
    const onClose = jest.fn();

    let id = "";
    await act(async () => {
      id = overlay.openSheet(() => <Sheet title="menu" />, { onClose });
    });
    await act(async () => {
      screen.getByTestId(`overlay-${id}`).props.onAccessibilityEscape();
    });

    expect(onClose).toHaveBeenCalledWith("dismiss");
    expect(overlays.hasOpen()).toBe(false);
  });

  it("draws the snackbar over the sheets", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.openSheet(() => <Sheet title="menu" />);
      overlay.showToast("The tab was closed on the desktop.");
    });

    const layers = screen.getByTestId("overlay-host").children.filter((child) => typeof child !== "string");
    const last = layers.at(-1);
    if (last === undefined) {
      throw new Error("no layer");
    }
    // For VoiceOver the snackbar is outside the modal sheet; it is announced instead (Toast.test).
    expect(within(last).getByTestId("toast", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("The tab was closed on the desktop.", { includeHiddenElements: true })).toBeTruthy();
  });

  it("never uses the React Native Modal", () => {
    const files = readdirSync(__dirname).filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const source = readFileSync(join(__dirname, name), "utf8");
      expect(source).not.toMatch(/import\s*\{[^}]*\bModal\b[^}]*\}\s*from\s*"react-native"/);
      expect(source).not.toMatch(/<Modal\b/);
    }
  });
});
