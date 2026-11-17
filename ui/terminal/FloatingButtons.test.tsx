// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useColorScheme } from "react-native";

import { t } from "@/i18n/catalog";
import { palettes, size, spacing, ThemeProvider } from "@ui/theme";

import { FloatingButtons, type FloatingButtonsProps } from "./FloatingButtons";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

type State = Pick<FloatingButtonsProps, "atBottom" | "isFit" | "wide" | "followingCursor">;

const HOME: State = { atBottom: true, isFit: true, wide: false, followingCursor: false };

async function renderButtons(state: Partial<State> = {}) {
  const onFitWidth = jest.fn();
  const onFollowCursor = jest.fn();
  const onScrollToBottom = jest.fn();
  await render(
    <ThemeProvider>
      <FloatingButtons
        {...HOME}
        {...state}
        onFitWidth={onFitWidth}
        onFollowCursor={onFollowCursor}
        onScrollToBottom={onScrollToBottom}
      />
    </ThemeProvider>,
  );
  return { onFitWidth, onFollowCursor, onScrollToBottom };
}

describe("FloatingButtons", () => {
  it("shows nothing at the bottom, at the fit zoom, on a grid that fits", async () => {
    await renderButtons();
    expect(screen.queryByTestId("fab")).toBeNull();
  });

  it("stacks fit, follow and back to the end, top to bottom, in the corner", async () => {
    await renderButtons({ atBottom: false, isFit: false, wide: true });
    const stack = screen.getByTestId("fab");
    expect(stack).toHaveStyle({ position: "absolute", right: spacing.fabInset, bottom: spacing.fabInset, rowGap: spacing.fabGap });
    const labels = screen.getAllByRole(/^(button|togglebutton)$/).map((element) => element.props.accessibilityLabel);
    expect(labels).toEqual([t("terminal.fit_width"), t("terminal.follow_cursor"), t("terminal.scroll_to_bottom")]);
  });

  it("'Back to the end' appears off the bottom and scrolls to the end", async () => {
    const { onScrollToBottom } = await renderButtons({ atBottom: false });
    expect(screen.queryByTestId("fab-fit")).toBeNull();
    expect(screen.queryByTestId("fab-follow")).toBeNull();
    const button = screen.getByRole("button", { name: t("terminal.scroll_to_bottom") });
    expect(button).toHaveStyle({ width: size.fab, height: size.fab });
    await fireEvent.press(button);
    expect(onScrollToBottom).toHaveBeenCalledTimes(1);
  });

  it("'Fit the width' appears off the fit zoom and applies it", async () => {
    const { onFitWidth } = await renderButtons({ isFit: false });
    await fireEvent.press(screen.getByRole("button", { name: t("terminal.fit_width") }));
    expect(onFitWidth).toHaveBeenCalledTimes(1);
  });

  it("'Follow the cursor' is a toggle on a wide grid, drawn on with the accent border", async () => {
    const off = await renderButtons({ wide: true });
    const toggle = screen.getByRole("togglebutton", { name: t("terminal.follow_cursor") });
    expect(toggle.props.accessibilityState).toEqual({ checked: false });
    await fireEvent.press(toggle);
    expect(off.onFollowCursor).toHaveBeenCalledWith(true);

    const on = await renderButtons({ wide: true, followingCursor: true });
    const lit = screen.getByRole("togglebutton", { name: t("terminal.follow_cursor") });
    expect(lit.props.accessibilityState).toEqual({ checked: true });
    expect(lit).toHaveStyle({
      backgroundColor: palettes.dark.bgSelected,
      borderColor: palettes.dark.accent,
      borderWidth: size.borderEmphasis,
    });
    await fireEvent.press(lit);
    expect(on.onFollowCursor).toHaveBeenCalledWith(false);
  });

  it("widens the 44 button to the 48 target", async () => {
    await renderButtons({ atBottom: false });
    expect(screen.getByTestId("fab-bottom").props.hitSlop).toBe((size.targetMin - size.fab) / 2);
  });
});
