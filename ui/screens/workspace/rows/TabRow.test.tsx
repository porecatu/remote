// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useColorScheme } from "react-native";

import { createTranslator, getLocale, t } from "@/i18n/catalog";
import { PaneState, SplitDir } from "@/protocol";
import { tabView, type TabView } from "@/workspace/selectors";
import { PROFILES, pane, split, tab, win } from "@/workspace/testing";
import { opacity, palettes, ThemeProvider } from "@ui/theme";

import { tabAccessibilityLabel } from "./rowModel";
import { TabRow } from "./TabRow";

const hidden = { includeHiddenElements: true } as const;
const tr = createTranslator(getLocale());

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

/** The testID of the element a callback handed as the focus origin (argument `index` of call `call`). */
function originId(mock: jest.Mock, call: number, index: number): string | undefined {
  const origin = mock.mock.calls[call]?.[index] as { current: { props?: { testID?: string } } | null } | undefined;
  return origin?.current?.props?.testID;
}

function view(over: Parameters<typeof tab>[1] = {}, options: { pinned?: boolean; active?: boolean } = {}): TabView {
  const raw = tab(1, { title: "build", ...over });
  return tabView(
    raw,
    win(1, [], { active: options.active === true ? raw.tab : null }),
    options.pinned === true ? "pinned" : "track",
    null,
    PROFILES,
  );
}

async function renderRow(tabData: TabView, props: Partial<Parameters<typeof TabRow>[0]> = {}) {
  const onOpen = jest.fn();
  const onMenu = jest.fn();
  await render(
    <ThemeProvider>
      <TabRow tab={tabData} inGroup={false} onOpen={onOpen} onMenu={onMenu} testID="row" {...props} />
    </ThemeProvider>,
  );
  return { onOpen, onMenu };
}

describe("TabRow", () => {
  it("is one element with the composed label and the Open and Tab menu actions", async () => {
    const data = view({ bell: true }, { active: true });
    const { onOpen, onMenu } = await renderRow(data);
    const row = screen.getByRole("button", { name: tabAccessibilityLabel(data, tr) });
    expect(row.props.accessibilityActions).toEqual([
      { name: "open", label: t("common.open") },
      { name: "menu", label: t("workspace.tab_menu") },
    ]);
    await fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "open" } });
    expect(onOpen).toHaveBeenCalledWith(data);
    await fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "menu" } });
    expect(onMenu).toHaveBeenCalledWith(data, expect.anything());
    expect(originId(onMenu, 0, 1)).toBe("row");
  });

  it("opens on touch and opens the menu on long press and on the menu button", async () => {
    const data = view();
    const { onOpen, onMenu } = await renderRow(data);
    await fireEvent.press(screen.getByTestId("row"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByTestId("row"), "longPress");
    expect(onMenu).toHaveBeenCalledTimes(1);
    // The focus goes back to what opened the menu: the row, or the button (§5).
    expect(originId(onMenu, 0, 1)).toBe("row");
    const menu = screen.getByTestId("row-menu", hidden);
    expect(menu.props.accessibilityLabel).toBe(t("workspace.tab_menu_for", { title: "build" }));
    await fireEvent.press(menu);
    expect(onMenu).toHaveBeenCalledTimes(2);
    expect(originId(onMenu, 1, 1)).toBe("row-menu");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it.each([
    [PaneState.exited, 0, t("workspace.tab_state.exited", { code: 0 }), "circle-check"],
    [PaneState.exited, 2, t("workspace.tab_state.exited", { code: 2 }), "circle-x"],
    [PaneState.notStarted, null, t("workspace.tab_state.not_started"), "circle-dashed"],
    [PaneState.disconnected, null, t("workspace.tab_state.disconnected"), "unplug"],
    [PaneState.awaitingDesktop, null, t("workspace.tab_state.awaiting_desktop"), "monitor"],
  ])("shows state %s (exit %s) as the chip %s", async (state, exit, label, iconName) => {
    await renderRow(view({ layout: pane(100, { state, exit }) }));
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByTestId("row-state-leading", hidden)).toBeTruthy();
    // The icon is the Lucide component of that name.
    const leading = screen.getByTestId("row-state-leading", hidden);
    expect(String(leading.props.className ?? "")).toContain(iconName);
  });

  it.each([PaneState.connecting, PaneState.reconnecting])("shows %s as connecting… with the spinner", async (state) => {
    await renderRow(view({ layout: pane(100, { state }) }));
    expect(screen.getByText(t("workspace.tab_state.connecting"))).toBeTruthy();
    expect(screen.getByTestId("row-state-spinner", hidden)).toBeTruthy();
  });

  it("shows no chip while running", async () => {
    await renderRow(view());
    expect(screen.queryByTestId("row-state", hidden)).toBeNull();
    expect(screen.queryByText(t("workspace.tab_state.running"))).toBeNull();
  });

  it("colors the non-zero exit in error.text and the awaiting state in warning.text", async () => {
    await renderRow(view({ layout: pane(100, { state: PaneState.exited, exit: 1 }) }));
    expect(screen.getByText(t("workspace.tab_state.exited", { code: 1 }))).toHaveStyle({
      color: palettes.dark.errorText,
    });
    await screen.rerender(
      <TabRow
        tab={view({ layout: pane(100, { state: PaneState.awaitingDesktop }) })}
        inGroup={false}
        onOpen={jest.fn()}
        onMenu={jest.fn()}
        testID="row"
      />,
    );
    expect(screen.getByText(t("workspace.tab_state.awaiting_desktop"))).toHaveStyle({
      color: palettes.dark.warningText,
    });
  });

  it("shows the bell over activity, and neither on an exited tab", async () => {
    await renderRow(view({ bell: true, activity: true }));
    expect(screen.getByTestId("row-bell", hidden)).toBeTruthy();
    expect(screen.queryByTestId("row-activity", hidden)).toBeNull();
    await screen.rerender(
      <TabRow tab={view({ activity: true })} inGroup={false} onOpen={jest.fn()} onMenu={jest.fn()} testID="row" />,
    );
    expect(screen.getByTestId("row-activity", hidden)).toBeTruthy();
    await screen.rerender(
      <TabRow
        tab={view({ bell: true, layout: pane(100, { state: PaneState.exited, exit: 0 }) })}
        inGroup={false}
        onOpen={jest.fn()}
        onMenu={jest.fn()}
        testID="row"
      />,
    );
    expect(screen.queryByTestId("row-bell", hidden)).toBeNull();
    expect(screen.queryByTestId("row-activity", hidden)).toBeNull();
  });

  it("shows user@host on an SSH tab, the profile badge, the panes count and the pin", async () => {
    await renderRow(
      view(
        {
          remote: "deploy@srv",
          profile: "prod",
          layout: split(SplitDir.sideBySide, 32768, pane(100, { cwd: "/srv" }), pane(101)),
          focused: 100,
        },
        { pinned: true },
      ),
    );
    expect(screen.getByText("deploy@srv")).toBeTruthy();
    expect(screen.queryByText("/srv")).toBeNull();
    expect(screen.getByText("Production")).toBeTruthy();
    expect(screen.getByTestId("row-panes")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByTestId("row-pin", hidden)).toBeTruthy();
  });

  it("shows the cwd on a local tab and no badge for the default profile", async () => {
    await renderRow(view({ profile: "default", layout: pane(100, { cwd: "~/projects" }) }));
    expect(screen.getByText("~/projects")).toBeTruthy();
    expect(screen.queryByTestId("row-profile")).toBeNull();
    expect(screen.queryByTestId("row-panes")).toBeNull();
    expect(screen.queryByTestId("row-pin", hidden)).toBeNull();
  });

  it("marks the tab active on the desktop with the monitor and bg.selected", async () => {
    await renderRow(view({}, { active: true }));
    expect(screen.getByTestId("row-active", hidden)).toBeTruthy();
    expect(screen.getByTestId("row")).toHaveStyle({ backgroundColor: palettes.dark.bgSelected });
  });

  it("is its own card when loose and a plain row inside a group", async () => {
    await renderRow(view());
    expect(screen.getByTestId("row-card")).toBeTruthy();
    await screen.rerender(
      <TabRow tab={view()} inGroup onOpen={jest.fn()} onMenu={jest.fn()} testID="row" />,
    );
    expect(screen.queryByTestId("row-card")).toBeNull();
  });

  it("while pending: dimmed, spinner instead of the menu, no touch nor actions", async () => {
    const data = view();
    const { onOpen, onMenu } = await renderRow(data, { pending: true });
    const row = screen.getByTestId("row");
    expect(row).toHaveStyle({ opacity: opacity.pending });
    expect(row.props.accessibilityLabel).toBe(
      `${tabAccessibilityLabel(data, tr)}${t("a11y.separator")}${t("a11y.pending")}`,
    );
    expect(row.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    expect(row.props.accessibilityActions).toBeUndefined();
    expect(screen.queryByTestId("row-menu", hidden)).toBeNull();
    expect(screen.getByTestId("row-pending", hidden)).toBeTruthy();
    await fireEvent.press(row);
    await fireEvent(row, "longPress");
    expect(onOpen).not.toHaveBeenCalled();
    expect(onMenu).not.toHaveBeenCalled();
  });

  it("read-only: opens but offers no menu", async () => {
    const { onOpen, onMenu } = await renderRow(view(), { readOnly: true });
    const row = screen.getByTestId("row");
    expect(row.props.accessibilityActions).toEqual([{ name: "open", label: t("common.open") }]);
    await fireEvent(row, "longPress");
    const menu = screen.getByTestId("row-menu", hidden);
    expect(menu.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(menu);
    expect(onMenu).not.toHaveBeenCalled();
    onOpen.mockClear();
    await fireEvent.press(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("shows the search match on line 2 with the matched part in bold", async () => {
    await renderRow(view({ remote: "deploy@srv", layout: pane(100, { cwd: "~/projects/api" }) }), {
      match: { text: "~/projects/api", query: "API" },
    });
    const bold = screen.getByText("api");
    expect(bold).toBeTruthy();
    expect(screen.queryByText("deploy@srv")).toBeNull();
  });
});
