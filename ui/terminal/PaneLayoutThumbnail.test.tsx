// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useColorScheme } from "react-native";

import { createTranslator, getLocale, t } from "@/i18n/catalog";
import { PaneState, SplitDir } from "@/protocol";
import { pane, split } from "@/workspace/testing";
import { palettes, size, thumbnailAspectRatio, ThemeProvider } from "@ui/theme";

import { PaneLayoutThumbnail, paneStateDotColor, paneTitle } from "./PaneLayoutThumbnail";

const hidden = { includeHiddenElements: true } as const;
const tr = createTranslator(getLocale());

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

/** Pane 10 on the left (3/4), 11 over 12 on the right. */
const LAYOUT = split(
  SplitDir.sideBySide,
  49152,
  pane(10, { title: "deploy@srv" }),
  split(SplitDir.stacked, 32768, pane(11, { title: "" }), pane(12, { title: "logs", state: PaneState.exited, exit: 1 })),
);

async function renderThumbnail(props: { viewed?: number | null; focused?: number | null; background?: string } = {}) {
  const onSelect = jest.fn();
  await render(
    <ThemeProvider>
      <PaneLayoutThumbnail
        layout={LAYOUT}
        viewedPaneId={props.viewed ?? 10}
        focusedPaneId={props.focused ?? 11}
        onSelect={onSelect}
        {...(props.background === undefined ? {} : { terminalBackground: props.background })}
      />
    </ThemeProvider>,
  );
  return { onSelect };
}

describe("paneTitle", () => {
  it("uses the pane title, or 'Pane N' when it has none", () => {
    expect(paneTitle({ title: "vim" }, 1, tr)).toBe("vim");
    expect(paneTitle({ title: "  " }, 2, tr)).toBe(t("panes.untitled", { index: 2 }));
  });
});

describe("paneStateDotColor", () => {
  it("is success while running and follows the tree chips otherwise", () => {
    expect(paneStateDotColor(PaneState.running, null)).toBe("success");
    expect(paneStateDotColor(PaneState.exited, 0)).toBe("textTertiary");
    expect(paneStateDotColor(PaneState.exited, 1)).toBe("error");
    expect(paneStateDotColor(PaneState.connecting, null)).toBe("accent");
    expect(paneStateDotColor(PaneState.awaitingDesktop, null)).toBe("warning");
    expect(paneStateDotColor(PaneState.notStarted, null)).toBe("textTertiary");
  });
});

describe("PaneLayoutThumbnail", () => {
  it("is hidden from the screen reader, in a 16:10 box", async () => {
    await renderThumbnail();
    expect(screen.queryByTestId("pane-thumbnail")).toBeNull();
    const box = screen.getByTestId("pane-thumbnail", hidden);
    expect(box).toHaveStyle({ aspectRatio: thumbnailAspectRatio });
    expect(box.props.accessibilityElementsHidden).toBe(true);
    expect(box.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("draws each pane where the layout puts it", async () => {
    await renderThumbnail();
    expect(screen.getByTestId("pane-thumbnail-10", hidden)).toHaveStyle({ left: "0%", top: "0%", width: "75%", height: "100%" });
    expect(screen.getByTestId("pane-thumbnail-11", hidden)).toHaveStyle({ left: "75%", top: "0%", width: "25%", height: "50%" });
    expect(screen.getByTestId("pane-thumbnail-12", hidden)).toHaveStyle({ left: "75%", top: "50%", width: "25%", height: "50%" });
  });

  it("marks the pane on screen and the pane focused on the desktop", async () => {
    await renderThumbnail({ background: "#101010" });
    expect(screen.getByTestId("pane-thumbnail-10", hidden)).toHaveStyle({
      backgroundColor: palettes.dark.bgSelected,
      borderWidth: size.borderWidth,
      borderColor: palettes.dark.borderRow,
    });
    expect(screen.getByTestId("pane-thumbnail-11", hidden)).toHaveStyle({
      backgroundColor: "#101010",
      borderWidth: size.borderEmphasis,
      borderColor: palettes.dark.accent,
    });
    expect(screen.getByTestId("pane-thumbnail-11-focused", hidden)).toBeOnTheScreen();
    expect(screen.queryByTestId("pane-thumbnail-10-focused", hidden)).toBeNull();
  });

  it("titles each pane, 'Pane N' for an untitled one", async () => {
    await renderThumbnail();
    expect(screen.getByText("deploy@srv", hidden)).toBeOnTheScreen();
    expect(screen.getByText(t("panes.untitled", { index: 2 }), hidden)).toBeOnTheScreen();
    expect(screen.getByText("logs", hidden)).toBeOnTheScreen();
  });

  it("picks a pane on touch", async () => {
    const { onSelect } = await renderThumbnail();
    await fireEvent.press(screen.getByTestId("pane-thumbnail-12", hidden));
    expect(onSelect).toHaveBeenCalledWith(12);
  });
});
