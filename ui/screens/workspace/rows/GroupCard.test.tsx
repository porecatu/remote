// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, useColorScheme } from "react-native";

import { t, tn } from "@/i18n/catalog";
import { tabView } from "@/workspace/selectors";
import { tab, win } from "@/workspace/testing";
import { opacity, palettes, rgbToCss, ThemeProvider } from "@ui/theme";

import { GroupCard, type GroupCardProps } from "./GroupCard";
import { TabRow } from "./TabRow";

const hidden = { includeHiddenElements: true } as const;
const RED = 0xef8a8a;
const sep = t("a11y.separator");

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

/** The testID of the element a callback handed as the focus origin (argument `index` of call `call`). */
function originId(mock: jest.Mock, call: number, index: number): string | undefined {
  const origin = mock.mock.calls[call]?.[index] as { current: { props?: { testID?: string } } | null } | undefined;
  return origin?.current?.props?.testID;
}

type Row = GroupCardProps["row"];

const openRow: Row = { group: 7, name: "Servers", tabCount: 2, desktopCollapsed: false, collapsed: false };

async function renderCard(row: Row, props: Partial<GroupCardProps> = {}) {
  const onToggle = jest.fn();
  const onMenu = jest.fn();
  const onNewTab = jest.fn();
  const w = win(1, []);
  await render(
    <ThemeProvider>
      <GroupCard
        row={row}
        color={RED}
        onToggle={onToggle}
        onMenu={onMenu}
        onNewTab={onNewTab}
        testID="group"
        {...props}
      >
        <TabRow tab={tabView(tab(1, { title: "build" }), w, "track", 7)} inGroup onOpen={jest.fn()} onMenu={jest.fn()} />
        <TabRow tab={tabView(tab(2, { title: "api" }), w, "track", 7)} inGroup onOpen={jest.fn()} onMenu={jest.fn()} />
      </GroupCard>
    </ThemeProvider>,
  );
  return { onToggle, onMenu, onNewTab };
}

describe("GroupCard", () => {
  it("open on the desktop: no chevron, no toggle, its tabs and New tab", async () => {
    const { onToggle, onNewTab } = await renderCard(openRow);
    expect(screen.queryByTestId("group-chevron", hidden)).toBeNull();
    expect(screen.queryByText(t("workspace.collapsed_on_desktop"))).toBeNull();
    const header = screen.getByTestId("group-header");
    expect(header.props.accessibilityRole).toBeUndefined();
    expect(header.props.onClick).toBeUndefined();
    await fireEvent.press(header);
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText("build")).toBeTruthy();
    expect(screen.getByText("api")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("group-new-tab"));
    expect(onNewTab).toHaveBeenCalledWith(7, expect.anything());
    // The "New tab" row is where the sheet gives the focus back (§5).
    expect(originId(onNewTab, 0, 1)).toBe("group-new-tab");
  });

  it("has the composed label and the group menu as a custom action and a button", async () => {
    const { onMenu } = await renderCard(openRow);
    const header = screen.getByTestId("group-header");
    expect(header.props.accessibilityLabel).toBe(
      ["Servers", t("workspace.group_word"), tn("workspace.tab_count", 2)].join(sep),
    );
    expect(header.props.accessibilityActions).toEqual([{ name: "menu", label: t("workspace.group_menu") }]);
    await fireEvent(header, "accessibilityAction", { nativeEvent: { actionName: "menu" } });
    expect(onMenu).toHaveBeenCalledWith(7, expect.anything());
    expect(originId(onMenu, 0, 1)).toBe("group-header");
    const menu = screen.getByTestId("group-menu", hidden);
    expect(menu.props.accessibilityLabel).toBe(t("workspace.group_menu_for", { name: "Servers" }));
    await fireEvent.press(menu);
    expect(onMenu).toHaveBeenCalledTimes(2);
    expect(originId(onMenu, 1, 1)).toBe("group-menu");
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("collapsed on the desktop: chevron, support line, no tabs, toggles only in the app", async () => {
    const row: Row = { ...openRow, desktopCollapsed: true, collapsed: true };
    const { onToggle } = await renderCard(row);
    expect(screen.getByText(t("workspace.collapsed_on_desktop"))).toBeTruthy();
    expect(screen.getByTestId("group-chevron", hidden)).toBeTruthy();
    expect(screen.queryByText("build")).toBeNull();
    expect(screen.queryByTestId("group-new-tab")).toBeNull();
    const header = screen.getByRole("button", {
      name: ["Servers", t("workspace.group_word"), tn("workspace.tab_count", 2), t("workspace.collapsed_on_desktop")].join(
        sep,
      ),
    });
    expect(header.props.accessibilityState).toMatchObject({ expanded: false });
    expect(header.props.accessibilityHint).toBe(t("workspace.expand"));
    await fireEvent.press(header);
    expect(onToggle).toHaveBeenCalledWith(7);
  });

  it("expanded only in the app: says so, shows its tabs and collapses back", async () => {
    const row: Row = { ...openRow, desktopCollapsed: true, collapsed: false };
    const { onToggle } = await renderCard(row);
    const header = screen.getByTestId("group-header");
    expect(header.props.accessibilityLabel).toBe(
      ["Servers", t("workspace.group_word"), tn("workspace.tab_count", 2), t("workspace.expanded_locally")].join(sep),
    );
    expect(header.props.accessibilityState).toMatchObject({ expanded: true });
    expect(header.props.accessibilityHint).toBe(t("workspace.collapse"));
    expect(screen.getByText(t("workspace.collapsed_on_desktop"))).toBeTruthy();
    expect(screen.getByText("build")).toBeTruthy();
    await fireEvent.press(header);
    expect(onToggle).toHaveBeenCalledWith(7);
  });

  it("uses the group color only as stripe and tint, never on text", async () => {
    await renderCard({ ...openRow, desktopCollapsed: true, collapsed: false });
    expect(screen.getByTestId("group-stripe", hidden)).toHaveStyle({ backgroundColor: rgbToCss(RED) });
    expect(screen.getByTestId("group-header")).toHaveStyle({
      backgroundColor: rgbToCss(RED, opacity.groupTint),
    });
    const groupColors = [rgbToCss(RED), rgbToCss(RED, opacity.groupTint)].map((c) => c.toLowerCase());
    // Every text of the card: name, count, support line, tab titles, New tab.
    const texts = screen.getAllByText(/^/, hidden);
    expect(texts.length).toBeGreaterThanOrEqual(6);
    for (const text of texts) {
      const color = StyleSheet.flatten(text.props.style)?.color;
      expect(groupColors).not.toContain(String(color).toLowerCase());
    }
    expect(screen.getByText("Servers")).toHaveStyle({ color: palettes.dark.textTitle });
  });

  it("while pending: dimmed header, spinner instead of the menu, no toggle nor menu", async () => {
    const row: Row = { ...openRow, desktopCollapsed: true, collapsed: true };
    const { onToggle, onMenu } = await renderCard(row, { pending: true });
    const header = screen.getByTestId("group-header");
    expect(header.props.accessibilityLabel).toContain(t("a11y.pending"));
    expect(header.props.accessibilityActions).toBeUndefined();
    expect(screen.queryByTestId("group-menu", hidden)).toBeNull();
    expect(screen.getByTestId("group-pending", hidden)).toBeTruthy();
    await fireEvent.press(header);
    expect(onToggle).not.toHaveBeenCalled();
    expect(onMenu).not.toHaveBeenCalled();
  });

  it("read-only: no menu and New tab disabled", async () => {
    const { onMenu, onNewTab } = await renderCard(openRow, { readOnly: true });
    expect(screen.getByTestId("group-header").props.accessibilityActions).toBeUndefined();
    await fireEvent.press(screen.getByTestId("group-menu", hidden));
    await fireEvent.press(screen.getByTestId("group-new-tab"));
    expect(onMenu).not.toHaveBeenCalled();
    expect(onNewTab).not.toHaveBeenCalled();
  });
});
