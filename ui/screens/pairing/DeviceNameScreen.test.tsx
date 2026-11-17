// SPDX-License-Identifier: GPL-3.0-or-later
// The device name (anatomy §4.3.3), with expo-router mocked.
import { act, fireEvent } from "@testing-library/react-native";

import { t } from "@/i18n/catalog";
import { createTestServices } from "@ui/services/testing";

import { DeviceNameScreen } from "./DeviceNameScreen";
import { TEST_INVITE, createFakePairingController, flows, renderPairing, testUri } from "./testing";

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  dismissTo: jest.fn(),
};

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));

beforeEach(() => {
  jest.clearAllMocks();
});

function namingController(suggested = "Test Phone") {
  const fake = createFakePairingController();
  fake.readUri(testUri());
  fake.set(flows.naming(suggested));
  return fake;
}

describe("DeviceNameScreen", () => {
  it("shows the desktop of the code and the pre-filled name", async () => {
    const screen = await renderPairing(<DeviceNameScreen />, { controller: namingController() });
    expect(screen.getByText(t("pairing.desktop_label"))).toBeTruthy();
    expect(screen.getByTestId("device-name-host-name")).toHaveTextContent("Home");
    expect(screen.getByTestId("device-name-relay")).toHaveTextContent("relay.example.com");
    expect(screen.getByTestId("device-name-field-input")).toHaveDisplayValue("Test Phone");
    expect(screen.getByLabelText(t("pairing.device_name_label"))).toBeTruthy();
    expect(screen.getByText(t("pairing.device_name_hint"))).toBeTruthy();
  });

  it("disables Connect while the name is empty", async () => {
    const fake = namingController();
    const screen = await renderPairing(<DeviceNameScreen />, { controller: fake });
    await fireEvent.changeText(screen.getByTestId("device-name-field-input"), "   ");
    expect(screen.getByTestId("device-name-connect")).toBeDisabled();
    await fireEvent.press(screen.getByTestId("device-name-connect"));
    expect(fake.calls.submitName).toEqual([]);
    await fireEvent.changeText(screen.getByTestId("device-name-field-input"), "Pixel");
    expect(screen.getByTestId("device-name-connect")).toBeEnabled();
  });

  it("caps the name at 64 and counts from 48", async () => {
    const screen = await renderPairing(<DeviceNameScreen />, { controller: namingController() });
    const input = screen.getByTestId("device-name-field-input");
    expect(input.props.maxLength).toBe(64);
    await fireEvent.changeText(input, "x".repeat(47));
    expect(screen.queryByTestId("device-name-field-counter")).toBeNull();
    await fireEvent.changeText(input, "x".repeat(52));
    expect(screen.getByTestId("device-name-field-counter")).toHaveTextContent("52/64");
  });

  it("connects with the name and replaces itself with the wait", async () => {
    const fake = namingController();
    const screen = await renderPairing(<DeviceNameScreen />, { controller: fake });
    await fireEvent.changeText(screen.getByTestId("device-name-field-input"), "My Phone");
    await fireEvent.press(screen.getByTestId("device-name-connect"));
    expect(fake.calls.submitName).toEqual(["My Phone"]);
    expect(mockRouter.replace).toHaveBeenCalledWith("/pair/wait");
    // Leaving now does not cancel: the wait owns the attempt.
    await screen.unmount();
    expect(fake.calls.cancel).toBe(0);
  });

  it("drops the code read when going back", async () => {
    const fake = namingController();
    const screen = await renderPairing(<DeviceNameScreen />, { controller: fake });
    await fireEvent.press(screen.getByTestId("device-name-bar-back"));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    await screen.unmount();
    expect(fake.calls.cancel).toBe(1);
  });

  it("enters straight from a held link (RF-1.5)", async () => {
    const services = createTestServices({ settings: { appLock: false, deviceName: "Leo's phone" } });
    await services.start();
    await services.appShell.start();
    services.appShell.receiveLink(testUri());
    const screen = await renderPairing(<DeviceNameScreen />, { services });
    expect(screen.getByTestId("device-name-host-name")).toHaveTextContent(TEST_INVITE.hostName);
    // The name of the last pairing comes first (RF-1.2).
    expect(screen.getByTestId("device-name-field-input")).toHaveDisplayValue("Leo's phone");
  });

  it("restarts from the suggested name when a new link arrives", async () => {
    const fake = namingController();
    const screen = await renderPairing(<DeviceNameScreen />, { controller: fake });
    await fireEvent.changeText(screen.getByTestId("device-name-field-input"), "Typed");
    await act(async () => {
      fake.set(flows.naming("Other", { ...TEST_INVITE, hostName: "Office" }));
    });
    expect(screen.getByTestId("device-name-host-name")).toHaveTextContent("Office");
    expect(screen.getByTestId("device-name-field-input")).toHaveDisplayValue("Other");
  });

  it("explains an unusable code from a link", async () => {
    const fake = createFakePairingController();
    fake.readUri("porecatu://pair?v=99");
    const screen = await renderPairing(<DeviceNameScreen />, { controller: fake });
    expect(screen.getByText(t("pairing.invalid_code_title"))).toBeTruthy();
    await fireEvent.press(screen.getByTestId("pairing-result-scan-another"));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/pair");
    await fireEvent.press(screen.getByTestId("pairing-result-close"));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");
  });
});
