// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { createTranslator, setLocale } from "@/i18n/catalog";
import { loadSettings } from "@/storage/settings";
import { renderWithOverlays } from "@ui/overlay/testing";
import { type TestServices, type TestServicesOptions, createTestServices } from "@ui/services/testing";

import { SettingsScreen } from "./SettingsScreen";

const mockRouter = { back: jest.fn(), push: jest.fn(), dismissTo: jest.fn() };

jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

const en = createTranslator("en_US").t;
const pt = createTranslator("pt_BR").t;

beforeEach(() => {
  jest.useFakeTimers();
  mockRouter.back.mockClear();
  mockRouter.push.mockClear();
  mockRouter.dismissTo.mockClear();
  jest.mocked(AccessibilityInfo.sendAccessibilityEvent).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  setLocale("en_US");
});

/** Renders Settings with the app shell started, as the root leaves it. */
async function renderSettings(options: TestServicesOptions = {}): Promise<TestServices> {
  const services = createTestServices({ appVersion: "1.2.3", ...options });
  await services.start();
  await act(async () => {
    await services.appShell.start();
  });
  await renderWithOverlays(<SettingsScreen />, { services, start: false });
  return services;
}

/** The testIDs the screen reader focus was sent to, in order. */
function focusedTestIds(): string[] {
  return jest
    .mocked(AccessibilityInfo.sendAccessibilityEvent)
    .mock.calls.filter(([, type]) => type === "focus")
    .map(([target]) => (target as unknown as { props?: { testID?: string } }).props?.testID ?? "");
}

async function press(testID: string): Promise<void> {
  await fireEvent.press(screen.getByTestId(testID));
}

describe("SettingsScreen", () => {
  it("shows the sections, the rows and the version", async () => {
    await renderSettings();
    expect(screen.getByRole("header", { name: en("common.settings") })).toBeTruthy();
    for (const key of [
      "settings.section_device",
      "settings.section_security",
      "settings.section_terminal",
      "settings.section_language",
      "settings.section_about",
    ] as const) {
      expect(screen.getByRole("header", { name: en(key) })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: en("device.title") })).toBeTruthy();
    expect(screen.getByText(en("settings.version", { version: "1.2.3" }))).toBeTruthy();
  });

  it("goes back and opens This device", async () => {
    await renderSettings();
    await fireEvent.press(screen.getByRole("button", { name: en("a11y.back") }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    await press("settings-device");
    expect(mockRouter.push).toHaveBeenCalledWith("/settings/device");
  });

  describe("app lock", () => {
    it("turning off asks for the unlock and changes only when it passes", async () => {
      const services = await renderSettings();
      const { authenticator } = services.fakes;
      const unlockPrompts = authenticator.prompts.length;
      const lockSwitch = () => screen.getByRole("switch", { name: en("settings.app_lock") });
      expect(lockSwitch()).toBeChecked();

      authenticator.setResult({ kind: "failure", reason: "cancelled" });
      await press("settings-app-lock");
      expect(authenticator.prompts.slice(unlockPrompts)).toEqual([en("settings.app_lock_disable_reason")]);
      expect(lockSwitch()).toBeChecked();
      expect((await loadSettings(services.fakes.secureStore)).appLock).toBe(true);

      authenticator.setResult({ kind: "success" });
      await press("settings-app-lock");
      expect(authenticator.prompts.slice(unlockPrompts)).toHaveLength(2);
      expect(lockSwitch()).not.toBeChecked();
      expect((await loadSettings(services.fakes.secureStore)).appLock).toBe(false);
    });

    it("turning on asks for nothing", async () => {
      const services = await renderSettings({ settings: { appLock: false } });
      const lockSwitch = () => screen.getByRole("switch", { name: en("settings.app_lock") });
      expect(lockSwitch()).not.toBeChecked();
      await press("settings-app-lock");
      expect(services.fakes.authenticator.prompts).toEqual([]);
      expect(lockSwitch()).toBeChecked();
      expect((await loadSettings(services.fakes.secureStore)).appLock).toBe(true);
    });

    it("turns off without a prompt on a device that cannot authenticate (RF-1.20)", async () => {
      const services = await renderSettings({ capability: "unavailable" });
      const lockSwitch = () => screen.getByRole("switch", { name: en("settings.app_lock") });
      expect(lockSwitch()).toBeChecked();
      await press("settings-app-lock");
      expect(services.fakes.authenticator.prompts).toEqual([]);
      expect(lockSwitch()).not.toBeChecked();
    });
  });

  describe("bell vibration", () => {
    it("switches and saves", async () => {
      const services = await renderSettings();
      const vibration = () => screen.getByRole("switch", { name: en("settings.bell_vibration") });
      expect(vibration()).toBeChecked();
      await press("settings-bell-vibration");
      expect(vibration()).not.toBeChecked();
      expect((await loadSettings(services.fakes.secureStore)).bellVibration).toBe(false);
      await press("settings-bell-vibration");
      expect(vibration()).toBeChecked();
      expect((await loadSettings(services.fakes.secureStore)).bellVibration).toBe(true);
    });

    it("goes back and says so when the change cannot be saved", async () => {
      const services = await renderSettings();
      jest.spyOn(services.fakes.secureStore, "set").mockRejectedValue(new Error("keystore"));
      await press("settings-bell-vibration");
      expect(screen.getByRole("switch", { name: en("settings.bell_vibration") })).toBeChecked();
      expect(screen.getByText(en("settings.save_failed"))).toBeTruthy();
    });
  });

  describe("language", () => {
    it("shows the current choice in the row", async () => {
      await renderSettings();
      expect(
        screen.getByRole("button", {
          name: en("a11y.label_value", { label: en("settings.language"), value: en("language.system_short") }),
        }),
      ).toBeTruthy();
    });

    it("offers the three choices, each language named in itself", async () => {
      await renderSettings();
      await press("settings-language");
      expect(screen.getByTestId("language-sheet")).toBeTruthy();
      expect(screen.getByRole("radio", { name: en("language.system") })).toBeChecked();
      expect(screen.getByRole("radio", { name: "English (United States)" })).not.toBeChecked();
      expect(screen.getByRole("radio", { name: "Português (Brasil)" })).not.toBeChecked();
    });

    it("switches at once, re-renders the screen and saves", async () => {
      const services = await renderSettings();
      await press("settings-language");
      await press("language-pt_BR");
      await act(async () => {
        jest.runAllTimers();
      });
      expect(screen.queryByTestId("language-sheet")).toBeNull();
      // The screen reader focus goes back to the language row (§5).
      expect(focusedTestIds().at(-1)).toBe("settings-language");
      expect(screen.getByRole("header", { name: pt("common.settings") })).toBeTruthy();
      expect(screen.getByRole("switch", { name: pt("settings.app_lock") })).toBeTruthy();
      expect(
        screen.getByRole("button", {
          name: pt("a11y.label_value", { label: pt("settings.language"), value: pt("language.pt_BR") }),
        }),
      ).toBeTruthy();
      expect((await loadSettings(services.fakes.secureStore)).language).toBe("pt_BR");

      // And back to the system's (en-US in the tests).
      await press("settings-language");
      expect(screen.getByRole("radio", { name: pt("language.pt_BR") })).toBeChecked();
      await press("language-system");
      await act(async () => {
        jest.runAllTimers();
      });
      expect(screen.getByRole("header", { name: en("common.settings") })).toBeTruthy();
      expect((await loadSettings(services.fakes.secureStore)).language).toBe("system");
    });
  });
});
