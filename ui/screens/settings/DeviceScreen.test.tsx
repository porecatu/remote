// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { createTranslator, setLocale } from "@/i18n/catalog";
import type { Desktop } from "@/storage/desktopList";
import { renderWithOverlays } from "@ui/overlay/testing";
import { type TestServices, type TestServicesOptions, createTestServices } from "@ui/services/testing";

import { DeviceScreen } from "./DeviceScreen";
import { fingerprintCharacters } from "./fingerprintSpeech";

const mockRouter = { back: jest.fn(), push: jest.fn(), dismissTo: jest.fn() };

jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

const en = createTranslator("en_US").t;

const DESKTOP: Desktop = {
  id: "0123456789abcdef0123456789abcdef",
  name: "Casa",
  relayUrl: "wss://relay.example.com",
  hostId: "abcdefghijklmnopqrstuvwxyz234567",
  hostKeyB64: "A".repeat(43),
  pairedAt: "2026-11-16T12:00:00Z",
  lastStatus: { kind: "offline", at: "2026-11-16T12:00:00Z" },
};

beforeEach(() => {
  jest.useFakeTimers();
  mockRouter.back.mockClear();
  mockRouter.dismissTo.mockClear();
  jest.mocked(AccessibilityInfo.sendAccessibilityEvent).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  setLocale("en_US");
});

/** Renders This device with the app shell started (unlocked), as the root leaves it. */
async function renderDevice(options: TestServicesOptions = {}): Promise<TestServices> {
  const services = createTestServices(options);
  await services.start();
  await act(async () => {
    await services.appShell.start();
  });
  await act(async () => {
    await services.desktops.load();
  });
  await renderWithOverlays(<DeviceScreen />, { services, start: false });
  return services;
}

/** The testIDs the screen reader focus was sent to, in order. */
function focusedTestIds(): string[] {
  return jest
    .mocked(AccessibilityInfo.sendAccessibilityEvent)
    .mock.calls.filter(([, type]) => type === "focus")
    .map(([target]) => (target as unknown as { props?: { testID?: string } }).props?.testID ?? "");
}

function fingerprintOf(services: TestServices): string {
  const fingerprint = services.status.getState().fingerprint;
  if (fingerprint === null) {
    throw new Error("no fingerprint");
  }
  return fingerprint;
}

describe("fingerprintCharacters", () => {
  it("separates the characters by spaces and the groups by the separator", () => {
    expect(fingerprintCharacters("ABCD EFGH IJKL MNOP", ", ")).toBe("A B C D, E F G H, I J K L, M N O P");
  });
});

describe("DeviceScreen", () => {
  it("shows the stored device name", async () => {
    await renderDevice({ settings: { deviceName: "Pixel de Leonardo" } });
    expect(screen.getByText("Pixel de Leonardo")).toBeTruthy();
    expect(screen.getByTestId("device-name").props.accessibilityLabel).toBe(
      en("a11y.label_value", { label: en("device.name_label"), value: "Pixel de Leonardo" }),
    );
  });

  it("shows the model before the first pairing", async () => {
    await renderDevice({ deviceModel: "Pixel 8" });
    expect(screen.getByText("Pixel 8")).toBeTruthy();
  });

  it("shows the fingerprint, read character by character", async () => {
    const services = await renderDevice();
    const fingerprint = fingerprintOf(services);
    expect(fingerprint).toMatch(/^[A-Z2-7]{4}( [A-Z2-7]{4}){3}$/);
    expect(screen.getByText(fingerprint)).toBeTruthy();
    expect(screen.getByTestId("device-fingerprint").props.accessibilityLabel).toBe(
      en("a11y.fingerprint", { characters: fingerprintCharacters(fingerprint, en("a11y.separator")) }),
    );
  });

  it("goes back", async () => {
    await renderDevice();
    await fireEvent.press(screen.getByRole("button", { name: en("a11y.back") }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("copies only the fingerprint and says so", async () => {
    const services = await renderDevice();
    await fireEvent.press(screen.getByRole("button", { name: en("common.copy") }));
    expect(services.fakes.clipboard.writes).toEqual([fingerprintOf(services)]);
    expect(screen.getByText(en("device.fingerprint_copied"))).toBeTruthy();
  });

  it("says nothing when the clipboard refuses the copy", async () => {
    const services = await renderDevice();
    services.fakes.clipboard.setWriteFails(true);
    await fireEvent.press(screen.getByRole("button", { name: en("common.copy") }));
    expect(services.fakes.clipboard.writes).toEqual([]);
    expect(screen.queryByText(en("device.fingerprint_copied"))).toBeNull();
  });

  describe("recreate identity", () => {
    it("confirms, recreates, clears the list and goes back to it", async () => {
      const services = await renderDevice({ settings: { appLock: false }, desktops: [DESKTOP] });
      const before = fingerprintOf(services);
      expect(services.desktops.store.getState().desktops).toHaveLength(1);

      await fireEvent.press(screen.getByRole("button", { name: en("device.recreate") }));
      expect(services.fakes.authenticator.prompts).toEqual([]);
      expect(screen.getByText(en("device.recreate_title"))).toBeTruthy();
      expect(screen.getByText(en("device.recreate_body"))).toBeTruthy();
      // Cancel has the initial focus.
      expect(screen.getByTestId("recreate-dialog-focus", { includeHiddenElements: true })).toBeTruthy();

      await fireEvent.press(screen.getByTestId("recreate-confirm"));
      await act(async () => {
        jest.runAllTimers();
      });
      expect(fingerprintOf(services)).not.toBe(before);
      expect(services.desktops.store.getState().desktops).toEqual([]);
      expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");
      expect(screen.getByText(fingerprintOf(services))).toBeTruthy();
    });

    it("Cancel changes nothing", async () => {
      const services = await renderDevice({ settings: { appLock: false }, desktops: [DESKTOP] });
      const before = fingerprintOf(services);
      await fireEvent.press(screen.getByRole("button", { name: en("device.recreate") }));
      await fireEvent.press(screen.getByTestId("recreate-cancel"));
      await act(async () => {
        jest.runAllTimers();
      });
      expect(screen.queryByText(en("device.recreate_title"))).toBeNull();
      expect(fingerprintOf(services)).toBe(before);
      expect(services.desktops.store.getState().desktops).toHaveLength(1);
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
      // The screen reader focus goes back to "Recreate identity" (§5).
      expect(focusedTestIds().at(-1)).toBe("device-recreate");
    });

    it("asks for the unlock first when the app lock is on", async () => {
      const services = await renderDevice();
      const { authenticator } = services.fakes;
      const unlockPrompts = authenticator.prompts.length;

      authenticator.setResult({ kind: "failure", reason: "cancelled" });
      await fireEvent.press(screen.getByRole("button", { name: en("device.recreate") }));
      expect(authenticator.prompts.slice(unlockPrompts)).toEqual([en("device.recreate_reason")]);
      expect(screen.queryByText(en("device.recreate_title"))).toBeNull();

      authenticator.setResult({ kind: "success" });
      await fireEvent.press(screen.getByRole("button", { name: en("device.recreate") }));
      expect(authenticator.prompts.slice(unlockPrompts)).toHaveLength(2);
      expect(screen.getByText(en("device.recreate_title"))).toBeTruthy();
    });

    it("says so and stays when the identity cannot be recreated", async () => {
      const services = await renderDevice({ settings: { appLock: false } });
      const before = fingerprintOf(services);
      jest.spyOn(services.fakes.secureStore, "set").mockRejectedValue(new Error("keystore"));
      await fireEvent.press(screen.getByRole("button", { name: en("device.recreate") }));
      await fireEvent.press(screen.getByTestId("recreate-confirm"));
      // Short of the snackbar's time.
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByText(en("device.recreate_failed"))).toBeTruthy();
      expect(fingerprintOf(services)).toBe(before);
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    });
  });
});
