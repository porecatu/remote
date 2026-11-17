// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AppState, type AppStateStatus, BackHandler, View } from "react-native";

import type { AuthResult } from "@/security/authenticate";
import { type SecureStore, createMemoryStore } from "@/storage/secureStore";
import { createTestServices, TEST_SAFE_AREA, type TestServicesOptions } from "@ui/services/testing";

import { AppRoot } from "./AppRoot";

const mockRouter = { push: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

let mockInitialUrl: string | null = null;
const mockUrlListeners: ((event: { url: string }) => void)[] = [];
jest.mock("expo-linking", () => ({
  getInitialURL: () => Promise.resolve(mockInitialUrl),
  addEventListener: (_type: "url", listener: (event: { url: string }) => void) => {
    mockUrlListeners.push(listener);
    return {
      remove: () => {
        mockUrlListeners.splice(mockUrlListeners.indexOf(listener), 1);
      },
    };
  },
}));

const PAIR_URI = "porecatu://pair?v=1&relay=wss%3A%2F%2Frelay.example&token=secret";
const CANCELLED: AuthResult = { kind: "failure", reason: "cancelled" };

type BackListener = Parameters<typeof BackHandler.addEventListener>[1];

let appStateListeners: ((status: AppStateStatus) => void)[] = [];

function setAppState(status: AppStateStatus): void {
  for (const listener of [...appStateListeners]) {
    listener(status);
  }
}

beforeEach(() => {
  mockRouter.push.mockClear();
  mockInitialUrl = null;
  mockUrlListeners.length = 0;
  appStateListeners = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListeners.push(listener);
    return {
      remove: () => {
        appStateListeners = appStateListeners.filter((item) => item !== listener);
      },
    };
  });
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Lets the start-up promises (services, app shell, prompt) and the zero timers settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  }
}

async function renderRoot(options: TestServicesOptions = {}) {
  const services = createTestServices(options);
  await render(
    <AppRoot services={services} safeAreaMetrics={TEST_SAFE_AREA}>
      <View testID="navigator" />
    </AppRoot>,
  );
  await settle();
  return services;
}

describe("AppRoot", () => {
  it("shows a bare background until the services and the shell start", async () => {
    // The secure store answers only when the test opens the gate.
    const base = createMemoryStore();
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const store: SecureStore = {
      get: (key) => gate.then(() => base.get(key)),
      set: (key, value) => base.set(key, value),
      delete: (key) => base.delete(key),
    };
    const services = createTestServices({ authResult: CANCELLED, deps: { secureStore: store } });
    await render(
      <AppRoot services={services} safeAreaMetrics={TEST_SAFE_AREA}>
        <View testID="navigator" />
      </AppRoot>,
    );
    expect(screen.queryByTestId("navigator")).toBeNull();
    expect(screen.queryByTestId("lock-screen")).toBeNull();
    expect(screen.queryByTestId("privacy-cover")).toBeNull();

    await act(async () => {
      open();
    });
    await settle();
    expect(services.status.getState().ready).toBe(true);
    expect(services.appShell.store.getState().ready).toBe(true);
    // The default lock is on: the lock screen, still no navigator.
    expect(screen.getByTestId("lock-screen")).toBeTruthy();
    expect(screen.queryByTestId("navigator")).toBeNull();
  });

  it("locked: shows the lock screen and opens the system prompt on its own", async () => {
    const services = await renderRoot({ authResult: CANCELLED });
    expect(services.fakes.authenticator.prompts).toEqual(["Unlock Porecatu Remote"]);
    expect(screen.getByTestId("lock-screen")).toBeTruthy();
    expect(screen.getByText("Porecatu Remote")).toBeTruthy();
    expect(screen.getByText("Locked")).toBeTruthy();
    // No navigator (no desktop list) before the first unlock.
    expect(screen.queryByTestId("navigator")).toBeNull();
  });

  it("cancelled: says so, and the button tries again and unlocks", async () => {
    const services = await renderRoot({ authResult: CANCELLED });
    expect(screen.getByText("Could not unlock.")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Unlock the app" });
    expect(button).toBeTruthy();

    services.fakes.authenticator.setResult({ kind: "success" });
    await fireEvent.press(button);
    await settle();

    expect(services.fakes.authenticator.prompts).toHaveLength(2);
    expect(screen.queryByTestId("lock-screen")).toBeNull();
    expect(screen.getByTestId("navigator")).toBeTruthy();
  });

  it("lockout: tells to use the device passcode", async () => {
    await renderRoot({ authResult: { kind: "failure", reason: "lockout" } });
    expect(screen.getByText("Biometrics are unavailable for now. Use the device passcode.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlock the app" })).toBeTruthy();
  });

  it("a device that cannot authenticate opens with no lock screen (RF-1.20)", async () => {
    const services = await renderRoot({ capability: "unavailable" });
    expect(screen.queryByTestId("lock-screen")).toBeNull();
    expect(screen.getByTestId("navigator")).toBeTruthy();
    expect(services.fakes.authenticator.prompts).toEqual([]);
  });

  it("the lock off opens with no prompt", async () => {
    const services = await renderRoot({ settings: { appLock: false } });
    expect(screen.queryByTestId("lock-screen")).toBeNull();
    expect(screen.getByTestId("navigator")).toBeTruthy();
    expect(services.fakes.authenticator.prompts).toEqual([]);
  });

  it("covers everything while the app is not active, lock or no lock (RF-1.19)", async () => {
    await renderRoot({ settings: { appLock: false } });
    expect(screen.queryByTestId("privacy-cover")).toBeNull();

    await act(async () => {
      setAppState("inactive");
    });
    expect(screen.getByTestId("privacy-cover")).toBeTruthy();
    // The content under the cover leaves the screen reader tree.
    expect(screen.queryByTestId("navigator")).toBeNull();
    expect(screen.getByTestId("navigator", { includeHiddenElements: true })).toBeTruthy();

    await act(async () => {
      setAppState("active");
    });
    expect(screen.queryByTestId("privacy-cover")).toBeNull();
    expect(screen.getByTestId("navigator")).toBeTruthy();
  });

  it("covers the lock screen too", async () => {
    await renderRoot({ authResult: CANCELLED });
    await act(async () => {
      setAppState("inactive");
    });
    expect(screen.getByTestId("privacy-cover")).toBeTruthy();
    expect(screen.queryByTestId("lock-screen")).toBeNull();
    expect(screen.getByTestId("lock-screen", { includeHiddenElements: true })).toBeTruthy();
  });

  it("locks again after a minute in the background, with the navigator kept under it", async () => {
    const services = await renderRoot();
    expect(screen.getByTestId("navigator")).toBeTruthy();

    services.fakes.authenticator.setResult(CANCELLED);
    await act(async () => {
      setAppState("background");
    });
    services.fakes.time.advance(60_000);
    await act(async () => {
      setAppState("active");
    });
    await settle();

    expect(screen.getByTestId("lock-screen")).toBeTruthy();
    expect(screen.queryByTestId("navigator")).toBeNull();
    expect(screen.getByTestId("navigator", { includeHiddenElements: true })).toBeTruthy();
    expect(services.fakes.authenticator.prompts).toHaveLength(2);
  });

  it("holds a pairing link until the unlock, then opens the name step", async () => {
    mockInitialUrl = PAIR_URI;
    const services = await renderRoot({ authResult: CANCELLED });
    expect(services.appShell.store.getState().pendingPairingLink).toBe(PAIR_URI);
    expect(mockRouter.push).not.toHaveBeenCalled();

    services.fakes.authenticator.setResult({ kind: "success" });
    await fireEvent.press(screen.getByRole("button", { name: "Unlock the app" }));
    await settle();

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith("/pair/name");
    // The pairing stack takes the link; the route carries no parameter.
    let taken: string | null = null;
    await act(async () => {
      taken = services.appShell.takePairingLink();
    });
    expect(taken).toBe(PAIR_URI);
  });

  it("opens the name step for a link that arrives while running, once", async () => {
    const services = await renderRoot({ settings: { appLock: false } });
    expect(mockUrlListeners).toHaveLength(1);

    await act(async () => {
      mockUrlListeners[0]?.({ url: "https://example.com/other" });
    });
    expect(mockRouter.push).not.toHaveBeenCalled();

    await act(async () => {
      mockUrlListeners[0]?.({ url: PAIR_URI });
    });
    expect(mockRouter.push).toHaveBeenCalledTimes(1);

    await act(async () => {
      services.appShell.takePairingLink();
    });
    await settle();
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it("the back button on the lock screen sends the app to the background", async () => {
    const exitApp = jest.spyOn(BackHandler, "exitApp").mockImplementation(() => undefined);
    const listeners: BackListener[] = [];
    jest.spyOn(BackHandler, "addEventListener").mockImplementation((_type, listener) => {
      listeners.push(listener);
      return {
        remove: () => {
          listeners.splice(listeners.indexOf(listener), 1);
        },
      };
    });
    await renderRoot({ authResult: CANCELLED });
    const latest = listeners.at(-1);
    expect(latest?.({} as never)).toBe(true);
    expect(exitApp).toHaveBeenCalledTimes(1);
  });
});
