// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Platform, Text, useColorScheme } from "react-native";

import { palettes } from "@ui/theme/colors";
import { duration, size, spacing, typeStyle } from "@ui/theme";
import { TEST_SAFE_AREA } from "@ui/services/testing";

import { useToastOffset } from "./OverlayProvider";
import { renderWithOverlays } from "./testing";
import { toastMessageParts } from "./Toast";
import { toastDuration } from "./useOverlay";

const announce = jest.mocked(AccessibilityInfo.announceForAccessibilityWithOptions);

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(useColorScheme).mockReturnValue("dark");
  announce.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe("toastDuration", () => {
  it("is 8 s for errors and 6 s otherwise", () => {
    expect(toastDuration("error")).toBe(duration.snackbarError);
    expect(toastDuration("warning")).toBe(duration.snackbarInfo);
    expect(toastDuration("info")).toBe(duration.snackbarInfo);
  });
});

describe("toastMessageParts", () => {
  it("splits the message at the first occurrence of the code", () => {
    expect(toastMessageParts("Could not do that (code invalid-argument).", "invalid-argument")).toEqual({
      before: "Could not do that (code ",
      code: "invalid-argument",
      after: ").",
    });
  });

  it("is null without a code, or when the message does not carry it", () => {
    expect(toastMessageParts("Done.", undefined)).toBeNull();
    expect(toastMessageParts("Done.", "")).toBeNull();
    expect(toastMessageParts("Done.", "unsupported")).toBeNull();
  });
});

describe("Toast", () => {
  it("shows an information notice for 6 s, as a polite live region", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.showToast("The tab was closed on the desktop.");
    });

    const toast = screen.getByTestId("toast");
    expect(toast.props.accessibilityLiveRegion).toBe("polite");
    expect(screen.getByText("The tab was closed on the desktop.")).toBeTruthy();
    expect(screen.getByTestId("toast-bar")).toHaveStyle({
      width: size.severityWidth,
      backgroundColor: palettes.dark.accent,
    });
    expect(screen.queryByRole("button", { name: "Dismiss notice" })).toBeNull();
    // The screen under it stays reachable: a notice never takes the focus.
    expect(screen.getByText("screen")).toBeTruthy();

    await advance(duration.snackbarInfo - 1);
    expect(screen.getByTestId("toast")).toBeTruthy();
    await advance(1);
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  it("queues the message for the screen reader on iOS", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.showToast("The desktop is not connected.");
    });

    if (Platform.OS === "ios") {
      expect(announce).toHaveBeenCalledWith("The desktop is not connected.", { queue: true });
    } else {
      expect(announce).not.toHaveBeenCalled();
    }
  });

  it("keeps an error for 8 s, with a button to dismiss it", async () => {
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.showToast("Could not send to the desktop.", { severity: "error" });
    });
    expect(screen.getByTestId("toast-bar")).toHaveStyle({ backgroundColor: palettes.dark.error });

    await advance(duration.snackbarInfo);
    expect(screen.getByTestId("toast")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Dismiss notice" }));
    expect(screen.queryByTestId("toast")).toBeNull();
    expect(overlays.store.getState().toast).toBeNull();
  });

  it("removes an error after 8 s", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.showToast("Could not send to the desktop.", { severity: "error" });
    });
    await advance(duration.snackbarError);

    expect(screen.queryByTestId("toast")).toBeNull();
  });

  it("pauses its time while touched", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.showToast("The tab was closed on the desktop.");
    });
    await advance(duration.snackbarInfo / 2);
    await fireEvent(screen.getByTestId("toast"), "touchStart");
    await advance(duration.snackbarInfo * 2);
    expect(screen.getByTestId("toast")).toBeTruthy();

    await fireEvent(screen.getByTestId("toast"), "touchEnd");
    await advance(duration.snackbarInfo / 2 - 1);
    expect(screen.getByTestId("toast")).toBeTruthy();
    await advance(1);
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  it("replaces the notice on screen with the next one, which gets its own time", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.showToast("First.");
    });
    await advance(duration.snackbarInfo - 1000);
    await act(async () => {
      overlay.showToast("Second.");
    });

    expect(screen.queryByText("First.")).toBeNull();
    await advance(1000);
    expect(screen.getByText("Second.")).toBeTruthy();
    await advance(duration.snackbarInfo);
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  it("shows a waiting notice once the error before it leaves", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.showToast("Could not send to the desktop.", { severity: "error" });
      overlay.showToast("The tab was closed on the desktop.");
    });
    expect(screen.queryByText("The tab was closed on the desktop.")).toBeNull();

    await advance(duration.snackbarError);
    expect(screen.getByText("The tab was closed on the desktop.")).toBeTruthy();
  });

  it("sits above the bottom safe area, and above the bar a screen registers", async () => {
    function KeyBarScreen() {
      useToastOffset(size.keybarHeight);
      return <Text>{"terminal"}</Text>;
    }
    const { overlay } = await renderWithOverlays(<KeyBarScreen />);

    await act(async () => {
      overlay.showToast("The desktop is not connected.");
    });

    expect(screen.getByTestId("toast")).toHaveStyle({
      marginBottom: TEST_SAFE_AREA.insets.bottom + spacing.snackbarMargin + size.keybarHeight,
      marginHorizontal: spacing.snackbarMargin,
    });
  });

  it("draws the code of a failed action in mono inside the message", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.showToast("Could not do that (code invalid-argument).", { severity: "error", code: "invalid-argument" });
    });

    expect(screen.getByText("Could not do that (code invalid-argument).")).toBeTruthy();
    const code = screen.getByTestId("toast-code");
    expect(code).toHaveTextContent("invalid-argument");
    expect(code).toHaveStyle({
      fontFamily: typeStyle("monoBody").fontFamily,
      fontSize: typeStyle("monoBody").fontSize,
    });
  });

  it("puts a code the message does not carry under it, and says both", async () => {
    const { overlay } = await renderWithOverlays(<Text>{"screen"}</Text>);

    await act(async () => {
      overlay.showToast("Could not do that.", { severity: "error", code: "unsupported" });
    });

    expect(screen.getByText("Could not do that.")).toBeTruthy();
    expect(screen.getByTestId("toast-code")).toHaveTextContent("unsupported");
    expect(screen.getByTestId("toast-code")).toHaveStyle(typeStyle("monoBody"));
    if (Platform.OS === "ios") {
      expect(announce).toHaveBeenCalledWith("Could not do that., unsupported", { queue: true });
    }
  });

  it("has no mono part without a code, and forgets the code of a replaced notice", async () => {
    const { overlay, overlays } = await renderWithOverlays(<Text>{"screen"}</Text>);

    let first = "";
    await act(async () => {
      first = overlay.showToast("Failed (code unsupported).", { code: "unsupported" });
    });
    expect(overlays.toastCode(first)).toBe("unsupported");
    await act(async () => {
      overlay.showToast("Second.");
    });
    expect(screen.queryByTestId("toast-code")).toBeNull();
    expect(overlays.toastCode(first)).toBeUndefined();
  });
});
