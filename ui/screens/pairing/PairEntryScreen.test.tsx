// SPDX-License-Identifier: GPL-3.0-or-later
// The camera permission and the camera (anatomy §4.3.1, §4.3.2), with
// expo-camera and expo-router mocked.
import { act, fireEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AccessibilityInfo, Linking } from "react-native";

import { t } from "@/i18n/catalog";
import { createTestServices } from "@ui/services/testing";

import { PairEntryScreen } from "./PairEntryScreen";
import { createFakePairingController, renderPairing, testUri } from "./testing";

type MockPermission = { granted: boolean; canAskAgain: boolean; status: string; expires: "never" };

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  dismissTo: jest.fn(),
};
let mockFocused = true;
let mockPermission: MockPermission | null = null;
const mockRequest = jest.fn();
const mockGet = jest.fn();
let mockCameraProps: Record<string, unknown> = {};

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useIsFocused: () => mockFocused,
}));

jest.mock("expo-camera", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    CameraView: (props: Record<string, unknown> & { children?: ReactNode }) => {
      mockCameraProps = props;
      return <View testID="camera-view" />;
    },
    useCameraPermissions: () => [mockPermission, mockRequest, mockGet],
  };
});

function permission(granted: boolean, canAskAgain = true): MockPermission {
  return { granted, canAskAgain, status: granted ? "granted" : "denied", expires: "never" };
}

/** The scan handler the camera has now (undefined while the reading is locked). */
function scanHandler(): ((result: { type: string; data: string }) => void) | undefined {
  return mockCameraProps["onBarcodeScanned"] as ((result: { type: string; data: string }) => void) | undefined;
}

let announce: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockPermission = null;
  mockCameraProps = {};
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
});

afterEach(() => {
  announce.mockRestore();
});

describe("camera permission", () => {
  it("explains the camera and asks for it", async () => {
    mockPermission = permission(false);
    const screen = await renderPairing(<PairEntryScreen />, { controller: createFakePairingController() });
    expect(screen.getByText(t("pairing.camera_permission_body"))).toBeTruthy();
    await fireEvent.press(screen.getByTestId("camera-permission-allow"));
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("camera-view")).toBeNull();
  });

  it("points to the system settings when the system will not ask again", async () => {
    mockPermission = permission(false, false);
    const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    const screen = await renderPairing(<PairEntryScreen />, { controller: createFakePairingController() });
    expect(screen.getByText(t("pairing.camera_permission_denied"))).toBeTruthy();
    expect(screen.queryByTestId("camera-permission-allow")).toBeNull();
    await fireEvent.press(screen.getByTestId("camera-permission-settings"));
    expect(open).toHaveBeenCalledTimes(1);
    expect(mockRequest).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("goes back with the arrow", async () => {
    mockPermission = permission(false);
    const screen = await renderPairing(<PairEntryScreen />, { controller: createFakePairingController() });
    await fireEvent.press(screen.getByTestId("camera-permission-bar-back"));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

describe("camera", () => {
  it("reads QR codes only, says it is looking, and toggles the torch", async () => {
    mockPermission = permission(true);
    const screen = await renderPairing(<PairEntryScreen />, { controller: createFakePairingController() });
    expect(screen.getByTestId("camera-view")).toBeTruthy();
    expect(mockCameraProps["barcodeScannerSettings"]).toEqual({ barcodeTypes: ["qr"] });
    expect(mockCameraProps["enableTorch"]).toBe(false);
    expect(announce).toHaveBeenCalledWith(t("pairing.scanning"));
    expect(screen.getByText(t("pairing.scan_instruction"))).toBeTruthy();
    await fireEvent.press(screen.getByTestId("scan-torch"));
    expect(mockCameraProps["enableTorch"]).toBe(true);
    expect(screen.getByTestId("scan-torch")).toBeSelected();
  });

  it("goes on to the name with a valid code, reading it once", async () => {
    mockPermission = permission(true);
    const fake = createFakePairingController();
    await renderPairing(<PairEntryScreen />, { controller: fake });
    const handler = scanHandler();
    await act(async () => {
      handler?.({ type: "qr", data: testUri() });
      handler?.({ type: "qr", data: testUri() });
    });
    expect(fake.calls.readUri).toEqual([testUri()]);
    expect(mockRouter.push).toHaveBeenCalledWith("/pair/name");
    expect(announce).toHaveBeenCalledWith(t("pairing.scanned"));
    expect(scanHandler()).toBeUndefined();
  });

  it("turns the frame red, opens the error sheet, and reads again only when it closes", async () => {
    mockPermission = permission(true);
    const services = createTestServices();
    const fake = createFakePairingController();
    const screen = await renderPairing(<PairEntryScreen />, { controller: fake, services });
    await act(async () => {
      scanHandler()?.({ type: "qr", data: "porecatu://pair?v=0&relay=ws%3A%2F%2Fexample.com" });
    });
    expect(screen.getByTestId("scan-corner-topLeft")).toHaveStyle({ borderColor: "#ef8a8a" });
    expect(screen.queryByTestId("qr-error")).toBeNull();
    expect(scanHandler()).toBeUndefined();

    await act(async () => {
      services.fakes.time.advance(400);
    });
    expect(screen.getByTestId("scan-corner-topLeft", { includeHiddenElements: true })).toHaveStyle({ borderColor: "#5ed3bc" });
    expect(screen.getByTestId("qr-error")).toBeTruthy();
    expect(screen.getByText(t("pairing.invalid_code_title"))).toBeTruthy();
    expect(screen.getByTestId("qr-error-reason")).toBeTruthy();
    // Still locked while the sheet is open.
    expect(scanHandler()).toBeUndefined();

    await fireEvent.press(screen.getByTestId("qr-error-scan-again"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(scanHandler()).toBeDefined();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("shows why a code is not a Porecatu code", async () => {
    mockPermission = permission(true);
    const services = createTestServices();
    const screen = await renderPairing(<PairEntryScreen />, { controller: createFakePairingController(), services });
    await act(async () => {
      scanHandler()?.({ type: "qr", data: "https://example.com" });
    });
    await act(async () => {
      services.fakes.time.advance(400);
    });
    expect(screen.getByText(t("pairing_uri.not-porecatu"))).toBeTruthy();
  });

  it("shows the camera-off state when the camera will not start", async () => {
    mockPermission = permission(true);
    const screen = await renderPairing(<PairEntryScreen />, { controller: createFakePairingController() });
    await act(async () => {
      (mockCameraProps["onMountError"] as (event: { message: string }) => void)({ message: "in use" });
    });
    expect(screen.getByTestId("scan-unavailable")).toBeTruthy();
    expect(screen.getByText(t("pairing.camera_unavailable_title"))).toBeTruthy();
    expect(screen.getByText(t("pairing.camera_busy"))).toBeTruthy();
    expect(screen.queryByTestId("scan-torch")).toBeNull();
    await fireEvent.press(screen.getByTestId("scan-unavailable-close"));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("closes with the x", async () => {
    mockPermission = permission(true);
    const screen = await renderPairing(<PairEntryScreen />, { controller: createFakePairingController() });
    await fireEvent.press(screen.getByTestId("scan-close"));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
