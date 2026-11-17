// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { renderWithOverlays } from "@ui/overlay/testing";
import { createTestServices } from "@ui/services/testing";
import { size } from "@ui/theme";

import { LockScreen } from "./LockScreen";

afterEach(() => {
  jest.restoreAllMocks();
});

async function lockedServices() {
  const services = createTestServices({ authResult: { kind: "failure", reason: "cancelled" } });
  await services.start();
  await services.appShell.start();
  return services;
}

describe("LockScreen", () => {
  it("puts the screen reader on the Unlock button", async () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    const services = await lockedServices();
    await renderWithOverlays(<LockScreen />, { services, start: false });
    const button = screen.getByRole("button", { name: "Unlock the app" });
    expect(focus).toHaveBeenCalledWith(expect.anything(), "focus");
    expect(screen.getByText("Unlock")).toBeTruthy();
    // The primary button of the components, `lock.button` wide (§4.1).
    expect(button).toBe(screen.getByTestId("lock-screen-unlock"));
    expect(button).toHaveStyle({ width: size.lockButton, minHeight: size.buttonHeight });
    const focused = focus.mock.calls
      .filter(([, kind]) => kind === "focus")
      .map(([target]) => (target as unknown as { props: { testID?: string } }).props.testID);
    expect(focused).toContain("lock-screen-unlock");
  });

  it("speaks the chosen language", async () => {
    const services = createTestServices({
      authResult: { kind: "failure", reason: "cancelled" },
      settings: { language: "pt_BR" },
    });
    await services.start();
    await services.appShell.start();
    await renderWithOverlays(<LockScreen />, { services, start: false });
    expect(screen.getByText("Bloqueado")).toBeTruthy();
    expect(screen.getByText("Não foi possível desbloquear.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desbloquear o app" })).toBeTruthy();
  });

  it("the button asks the shell to unlock", async () => {
    const services = await lockedServices();
    await renderWithOverlays(<LockScreen />, { services, start: false });
    expect(services.fakes.authenticator.prompts).toHaveLength(1);
    services.fakes.authenticator.setResult({ kind: "success" });
    await fireEvent.press(screen.getByRole("button", { name: "Unlock the app" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(services.fakes.authenticator.prompts).toHaveLength(2);
    expect(services.appShell.store.getState().lock.status).toBe("unlocked");
  });
});
