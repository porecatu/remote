// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useColorScheme } from "react-native";

import { t } from "@/i18n/catalog";
import { PANE_STATES, PaneState } from "@/protocol";
import { size, ThemeProvider } from "@ui/theme";

import { PaneStateBanner, PaneStateCard, paneStatePresentation } from "./PaneStateCard";

const hidden = { includeHiddenElements: true } as const;

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

async function renderCard(state: PaneState | null, starting = false) {
  const onStart = jest.fn();
  await render(
    <ThemeProvider>
      <PaneStateCard state={state} onStart={onStart} starting={starting} />
    </ThemeProvider>,
  );
  return { onStart };
}

async function renderBanner(state: PaneState | null, exitCode: number | null, withStart = true) {
  const onCloseTab = jest.fn();
  const onStart = jest.fn();
  await render(
    <ThemeProvider>
      <PaneStateBanner
        state={state}
        exitCode={exitCode}
        onCloseTab={onCloseTab}
        {...(withStart ? { onStart } : {})}
      />
    </ThemeProvider>,
  );
  return { onCloseTab, onStart };
}

describe("paneStatePresentation", () => {
  it("places every state of §4.10 and dims the grid only while reconnecting", () => {
    expect(paneStatePresentation(null)).toBeNull();
    expect(paneStatePresentation(PaneState.running)).toBeNull();
    expect(paneStatePresentation(PaneState.notStarted)).toEqual({ placement: "center", dimGrid: false });
    expect(paneStatePresentation(PaneState.connecting)).toEqual({ placement: "center", dimGrid: false });
    expect(paneStatePresentation(PaneState.awaitingDesktop)).toEqual({ placement: "center", dimGrid: false });
    expect(paneStatePresentation(PaneState.reconnecting)).toEqual({ placement: "top", dimGrid: true });
    expect(paneStatePresentation(PaneState.exited)).toEqual({ placement: "bottom", dimGrid: false });
    expect(paneStatePresentation(PaneState.disconnected)).toEqual({ placement: "bottom", dimGrid: false });
  });
});

describe("PaneStateCard and PaneStateBanner", () => {
  it("each state has exactly one of the card and the banner, none for running", async () => {
    for (const state of PANE_STATES) {
      const placement = paneStatePresentation(state)?.placement ?? null;
      await renderCard(state);
      const card = screen.queryByTestId("pane-state");
      expect(card !== null).toBe(placement === "center" || placement === "top");
      await renderBanner(state, 0);
      const banner = screen.queryByTestId("pane-banner");
      expect(banner !== null).toBe(placement === "bottom");
    }
  });

  it("not-started: the card says so and Start sends start-pane", async () => {
    const { onStart } = await renderCard(PaneState.notStarted);
    expect(screen.getByText(t("pane_state_card.not_started"))).toBeOnTheScreen();
    expect(screen.getByTestId("pane-state-icon", hidden)).toBeOnTheScreen();
    expect(screen.getByTestId("pane-state")).toHaveStyle({ maxWidth: size.stateCardMaxWidth });
    await fireEvent.press(screen.getByRole("button", { name: t("pane_state.start") }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("not-started: Start is busy while the start awaits the desktop", async () => {
    const { onStart } = await renderCard(PaneState.notStarted, true);
    const button = screen.getByRole("button", { name: t("pane_state.start") });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("connecting and reconnecting: a spinner and the words, no button", async () => {
    await renderCard(PaneState.connecting);
    expect(screen.getByText(t("connection.connecting"))).toBeOnTheScreen();
    expect(screen.getByTestId("pane-state-spinner", hidden)).toBeOnTheScreen();
    expect(screen.queryByRole("button")).toBeNull();
    await renderCard(PaneState.reconnecting);
    expect(screen.getByText(t("connection.reconnecting"))).toBeOnTheScreen();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("awaiting-desktop: the title and why only the computer can answer, with no button", async () => {
    await renderCard(PaneState.awaitingDesktop);
    expect(screen.getByRole("header", { name: t("pane_state_card.awaiting_desktop_title") })).toBeOnTheScreen();
    expect(screen.getByText(t("pane_state.awaiting_desktop_hint"))).toBeOnTheScreen();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("exited with 0: the code and Close tab", async () => {
    const { onCloseTab } = await renderBanner(PaneState.exited, 0);
    expect(screen.getByText(t("pane_state_card.exited", { code: 0 }))).toBeOnTheScreen();
    expect(screen.getByTestId("pane-banner")).toHaveStyle({ minHeight: size.bottomBannerHeight });
    expect(screen.queryByRole("button", { name: t("pane_state.start") })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: t("common.close_tab") }));
    expect(onCloseTab).toHaveBeenCalledTimes(1);
    // The button hands itself as the focus origin of the confirmation (§5).
    const origin = onCloseTab.mock.calls[0]?.[0] as { current: { props?: { testID?: string } } | null } | undefined;
    expect(origin?.current?.props?.testID).toBe("pane-banner-close");
  });

  it("exited with another code, or with none", async () => {
    await renderBanner(PaneState.exited, 127);
    expect(screen.getByText(t("pane_state_card.exited", { code: 127 }))).toBeOnTheScreen();
    await renderBanner(PaneState.exited, null);
    expect(screen.getByText(t("pane_state.exited"))).toBeOnTheScreen();
  });

  it("disconnected: the words and Start when allowed", async () => {
    const { onStart } = await renderBanner(PaneState.disconnected, null);
    expect(screen.getByText(t("pane_state.disconnected"))).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: t("common.close_tab") })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: t("pane_state.start") }));
    expect(onStart).toHaveBeenCalledTimes(1);
    await renderBanner(PaneState.disconnected, null, false);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
