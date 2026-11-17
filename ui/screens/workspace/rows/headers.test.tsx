// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useColorScheme } from "react-native";

import { t, tn } from "@/i18n/catalog";
import { palettes, size, ThemeProvider } from "@ui/theme";

import { NewTabRow } from "./NewTabRow";
import { SectionHeader } from "./SectionHeader";
import { WindowHeader } from "./WindowHeader";

const hidden = { includeHiddenElements: true } as const;
const sep = t("a11y.separator");

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

describe("WindowHeader", () => {
  it("is a header with Window N, the active tab title and the tab count", async () => {
    const onToggle = jest.fn();
    await render(
      <ThemeProvider>
        <WindowHeader
          row={{ window: 4, title: "build", tabCount: 8 }}
          number={1}
          collapsed={false}
          onToggle={onToggle}
          first
          testID="window"
        />
      </ThemeProvider>,
    );
    const header = screen.getByRole("header");
    expect(header.props.accessibilityLabel).toBe(
      [t("workspace.window", { number: 1 }), "build", tn("workspace.tab_count", 8)].join(sep),
    );
    expect(header.props.accessibilityState).toMatchObject({ expanded: true });
    expect(screen.getByText(t("workspace.window", { number: 1 }))).toBeTruthy();
    expect(screen.getByText("build")).toBeTruthy();
    expect(screen.getByText(tn("workspace.tab_count", 8))).toHaveStyle({ color: palettes.dark.textTertiary });
    expect(screen.queryByTestId("window-divider", hidden)).toBeNull();
    await fireEvent.press(header);
    expect(onToggle).toHaveBeenCalledWith(4);
  });

  it("from the second window on has a divider above, and says when collapsed", async () => {
    await render(
      <WindowHeader
        row={{ window: 5, title: "logs", tabCount: 1 }}
        number={2}
        collapsed
        onToggle={jest.fn()}
        first={false}
        testID="window"
      />,
    );
    expect(screen.getByTestId("window-divider", hidden)).toBeTruthy();
    const header = screen.getByRole("header");
    expect(header.props.accessibilityState).toMatchObject({ expanded: false });
    expect(header.props.accessibilityHint).toBe(t("workspace.expand"));
  });
});

describe("SectionHeader", () => {
  it("labels the pinned and track sections as headers", async () => {
    await render(
      <>
        <SectionHeader section="pinned" />
        <SectionHeader section="trail" />
      </>,
    );
    const headers = screen.getAllByRole("header");
    expect(headers.map((h) => h.props.children)).toEqual([t("workspace.pinned"), t("workspace.trail")]);
  });
});

describe("NewTabRow", () => {
  it("is a 48 button in accent.text that calls back", async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider>
        <NewTabRow variant="window" onPress={onPress} testID="new" />
      </ThemeProvider>,
    );
    const row = screen.getByRole("button", { name: t("common.new_tab") });
    expect(row).toHaveStyle({ minHeight: size.targetMin });
    expect(screen.getByText(t("common.new_tab"))).toHaveStyle({ color: palettes.dark.accentText });
    expect(screen.getByTestId("new-icon", hidden)).toBeTruthy();
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
    // It hands itself as the focus origin of the sheet it opens (§5).
    const origin = onPress.mock.calls[0]?.[0] as { current: { props?: { testID?: string } } | null } | undefined;
    expect(origin?.current?.props?.testID).toBe("new");
  });

  it("takes no touch when disabled", async () => {
    const onPress = jest.fn();
    await render(<NewTabRow variant="group" onPress={onPress} disabled />);
    const row = screen.getByRole("button", { name: t("common.new_tab") });
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
  });
});
