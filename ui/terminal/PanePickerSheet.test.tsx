// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { useColorScheme, View } from "react-native";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { TerminalState } from "@/controllers/terminalSession";
import { createTranslator, getLocale, t, tn } from "@/i18n/catalog";
import { type PaneId, type PaneNode, PaneState, SplitDir } from "@/protocol";
import { leafPanes } from "@/workspace/layout";
import { pane, split } from "@/workspace/testing";
import { renderWithOverlays, type RenderWithOverlaysResult } from "@ui/overlay/testing";
import { palettes } from "@ui/theme";

import { PanePickerSheet, openPanePicker, paneRowAccessibilityLabel } from "./PanePickerSheet";

const hidden = { includeHiddenElements: true } as const;
const tr = createTranslator(getLocale());

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

/** Pane 100 (`~/api`), focused on the desktop; pane 101 (`~/api/logs`), on screen. */
const LAYOUT = split(
  SplitDir.sideBySide,
  32768,
  pane(100, { title: "deploy@srv", cwd: "~/api" }),
  pane(101, { title: "tail -f app.log", cwd: "~/api/logs", state: PaneState.connecting }),
);

function terminalState(layout: PaneNode | null, over: Partial<TerminalState> = {}): TerminalState {
  return {
    tabId: 1,
    paneId: 101,
    focusedPaneId: 100,
    panes: layout === null ? [] : leafPanes(layout),
    layout,
    paneState: PaneState.running,
    exitCode: null,
    status: "live",
    unavailable: null,
    stale: false,
    version: 1,
    cursor: null,
    alt: false,
    cols: 80,
    rows: 24,
    history: { lines: 0, dropped: 0, total: 0, generation: 0, alt: false, loadingPages: 0, reachedOldest: true },
    modifiers: { ctrl: "off", alt: "off", shift: "off" },
    paste: null,
    tabGone: null,
    canType: true,
    ...over,
  };
}

async function openSheet(
  props: { viewed?: PaneId | null; focused?: PaneId | null } = {},
): Promise<RenderWithOverlaysResult & { onSelect: jest.Mock }> {
  const onSelect = jest.fn();
  const result = await renderWithOverlays(<View />);
  await act(async () => {
    result.overlay.openSheet(({ close }) => (
      <PanePickerSheet
        tabTitle="api"
        layout={LAYOUT}
        viewedPaneId={props.viewed === undefined ? 101 : props.viewed}
        focusedPaneId={props.focused === undefined ? 100 : props.focused}
        onSelect={onSelect}
        close={close}
      />
    ));
  });
  return { ...result, onSelect };
}

const openEntries = (result: RenderWithOverlaysResult) =>
  result.overlays.store.getState().entries.filter((entry) => !entry.closing);

describe("PanePickerSheet", () => {
  it("is titled by the tab and says the focused pane on the desktop does not change", async () => {
    await openSheet();
    expect(screen.getByRole("header", { name: t("panes.title", { title: "api" }) })).toBeOnTheScreen();
    expect(screen.getByText(tn("panes.subtitle", 2))).toBeOnTheScreen();
  });

  it("lists the panes in reading order, each one element with a composed label", async () => {
    await openSheet();
    const first = screen.getByTestId("pane-picker-row-100");
    const second = screen.getByTestId("pane-picker-row-101");
    expect(first.props.accessibilityLabel).toBe(
      paneRowAccessibilityLabel(pane(100, { title: "deploy@srv", cwd: "~/api" }), 1, { viewed: false, focused: true }, tr),
    );
    expect(first.props.accessibilityLabel).toBe(
      ["deploy@srv", t("workspace.tab_state.running"), "~/api", t("panes.focused_on_desktop")].join(t("a11y.separator")),
    );
    expect(second.props.accessibilityLabel).toBe(
      ["tail -f app.log", t("workspace.tab_state.connecting"), "~/api/logs", t("panes.viewed_here")].join(
        t("a11y.separator"),
      ),
    );
    const rows = screen.getAllByRole("button").filter((element) => /^pane-picker-row-\d+$/.test(String(element.props.testID)));
    expect(rows.map((row) => row.props.testID)).toEqual(["pane-picker-row-100", "pane-picker-row-101"]);
  });

  it("shows the position, the cwd, the state chip and the marks in words", async () => {
    await openSheet();
    const first = within(screen.getByTestId("pane-picker-row-100"));
    expect(first.getByText("1", hidden)).toBeOnTheScreen();
    expect(first.getByText("~/api", hidden)).toBeOnTheScreen();
    expect(first.getByText(t("panes.focused_on_desktop"), hidden)).toBeOnTheScreen();
    expect(first.queryByText(t("panes.viewed_here"), hidden)).toBeNull();
    expect(screen.queryByTestId("pane-picker-row-100-state", hidden)).toBeNull();
    const second = within(screen.getByTestId("pane-picker-row-101"));
    expect(second.getByText("2", hidden)).toBeOnTheScreen();
    expect(second.getByText(t("panes.viewed_here"), hidden)).toBeOnTheScreen();
    expect(screen.getByTestId("pane-picker-row-101-state", hidden)).toHaveTextContent(t("workspace.tab_state.connecting"));
  });

  it("selects the row of the pane on screen", async () => {
    await openSheet();
    expect(screen.getByTestId("pane-picker-row-101")).toHaveStyle({ backgroundColor: palettes.dark.bgSelected });
    expect(screen.getByTestId("pane-picker-row-100")).toHaveStyle({ backgroundColor: "transparent" });
  });

  it("keeps the miniature away from the screen reader", async () => {
    await openSheet();
    expect(screen.queryByTestId("pane-picker-thumbnail")).toBeNull();
    expect(screen.getByTestId("pane-picker-thumbnail", hidden)).toBeOnTheScreen();
  });

  it("a touch on a row picks the pane and closes the sheet", async () => {
    const result = await openSheet();
    await fireEvent.press(screen.getByTestId("pane-picker-row-100"));
    expect(result.onSelect).toHaveBeenCalledWith(100);
    expect(openEntries(result)).toHaveLength(0);
  });

  it("a touch on the miniature picks the pane and closes the sheet", async () => {
    const result = await openSheet();
    await fireEvent.press(screen.getByTestId("pane-picker-thumbnail-100", hidden));
    expect(result.onSelect).toHaveBeenCalledWith(100);
    expect(openEntries(result)).toHaveLength(0);
  });
});

describe("openPanePicker", () => {
  async function openLive(store: StoreApi<TerminalState>) {
    const selectPane = jest.fn<boolean, [PaneId]>(() => true);
    const result = await renderWithOverlays(<View />);
    await act(async () => {
      openPanePicker(result.overlay, { terminal: { store, selectPane }, tabTitle: "api", owner: "session:d1" });
    });
    return { ...result, selectPane };
  }

  it("follows the controller's panes while open and selects through it", async () => {
    const store = createStore<TerminalState>(() => terminalState(LAYOUT));
    const result = await openLive(store);
    expect(screen.getByTestId("pane-picker-row-101-state", hidden)).toHaveTextContent(t("workspace.tab_state.connecting"));
    const running = split(SplitDir.sideBySide, 32768, pane(100, { cwd: "~/api" }), pane(101, { cwd: "~/api/logs" }));
    await act(async () => {
      store.setState({ layout: running, panes: leafPanes(running) });
    });
    expect(screen.queryByTestId("pane-picker-row-101-state", hidden)).toBeNull();
    expect(result.overlays.store.getState().entries[0]?.owner).toBe("session:d1");
    await fireEvent.press(screen.getByTestId("pane-picker-row-100"));
    expect(result.selectPane).toHaveBeenCalledWith(100);
    expect(openEntries(result)).toHaveLength(0);
  });

  it("closes when the tab goes away under it", async () => {
    const store = createStore<TerminalState>(() => terminalState(LAYOUT));
    const result = await openLive(store);
    expect(openEntries(result)).toHaveLength(1);
    await act(async () => {
      store.setState({ tabGone: "closed" });
    });
    expect(openEntries(result)).toHaveLength(0);
    expect(result.selectPane).not.toHaveBeenCalled();
  });
});
