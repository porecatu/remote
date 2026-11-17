// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { AccessibilityInfo, Linking } from "react-native";

import { hostId as deriveHostId } from "@/protocol";
import { createFakeHost, testKeypair, type FakeHost } from "@/protocol/testing";
import { desktopFor } from "@/session/testing";
import type { Desktop, DesktopStatus } from "@/storage/desktopList";
import { renderWithOverlays } from "@ui/overlay/testing";
import { createTestServices, type TestServices } from "@ui/services/testing";

import { DesktopsScreen, desktopRoute } from "./DesktopsScreen";

// ------------------------------------------------------------- expo-router

/** The router the screen gets, and the focus the test gives or takes. */
const mockRouter = { push: jest.fn() };
const mockFocus = { focused: true, listeners: new Set<(focused: boolean) => void>() };

jest.mock("expo-router", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  return {
    useRouter: () => mockRouter,
    // The navigator's focus effect: runs while focused, cleans up on blur.
    useFocusEffect: (effect: () => (() => void) | undefined) => {
      const [focused, setFocused] = react.useState(mockFocus.focused);
      react.useEffect(() => {
        mockFocus.listeners.add(setFocused);
        return () => {
          mockFocus.listeners.delete(setFocused);
        };
      }, []);
      react.useEffect(() => (focused ? effect() : undefined), [focused, effect]);
    },
  };
});

async function setFocused(focused: boolean): Promise<void> {
  mockFocus.focused = focused;
  await act(async () => {
    for (const listener of mockFocus.listeners) {
      listener(focused);
    }
  });
}

// ------------------------------------------------------------- fixtures

const DEVICE = testKeypair(2);
const ID_A = "a".repeat(32);
const ID_B = "b".repeat(32);
const ID_C = "c".repeat(32);
const ID_D = "d".repeat(32);
const ID_E = "e".repeat(32);

/** Lets the promises queued so far (secure store, presence) settle. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    // Timers first, then the promises: advancing the fake timers also runs
    // the faked microtasks, and React's check that this act is awaited must
    // not run before the test awaits it.
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
  }
}

function hostOn(services: TestServices, seed: number): FakeHost {
  return createFakeHost({
    relay: services.fakes.relay,
    now: services.fakes.time.clock.now,
    hostKey: testKeypair(seed),
    hostId: deriveHostId(new Uint8Array(32).fill(seed)),
    pairedDevices: [DEVICE.publicKey],
  });
}

function desktop(host: FakeHost, at: string, over: Partial<Desktop>): Desktop {
  return desktopFor(host, at, { relayUrl: "wss://relay.exemplo.com.br/v0", ...over });
}

function status(kind: DesktopStatus["kind"], at: string, errorCode?: string): DesktopStatus {
  return errorCode === undefined ? { kind, at } : { kind, at, errorCode };
}

/** Services whose list holds `build(hosts, now)`; the hosts sit on the fake relay. */
function servicesWith(
  build: (hosts: readonly FakeHost[], at: string) => readonly Desktop[],
  options: { readonly hosts?: number } = {},
): { readonly services: TestServices; readonly hosts: readonly FakeHost[] } {
  // A first instance only to reach the relay and the clock the hosts need.
  const probe = createTestServices({ deviceKey: DEVICE });
  const hosts = Array.from({ length: options.hosts ?? 1 }, (_, index) => hostOn(probe, 10 + index));
  const at = probe.fakes.time.clock.iso();
  const services = createTestServices({
    deviceKey: DEVICE,
    desktops: build(hosts, at),
    relay: probe.fakes.relay,
    time: probe.fakes.time,
  });
  return { services, hosts };
}

async function renderScreen(services: TestServices) {
  const result = await renderWithOverlays(<DesktopsScreen />, { services });
  await settle();
  return result;
}

/** The testIDs the screen reader focus was sent to, in order. */
function focusedTestIds(): string[] {
  return jest
    .mocked(AccessibilityInfo.sendAccessibilityEvent)
    .mock.calls.filter(([, type]) => type === "focus")
    .map(([target]) => (target as unknown as { props?: { testID?: string } }).props?.testID ?? "");
}

function hidden() {
  return { includeHiddenElements: true } as const;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockRouter.push.mockReset();
  mockFocus.focused = true;
  mockFocus.listeners.clear();
  jest.mocked(AccessibilityInfo.sendAccessibilityEvent).mockClear();
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ------------------------------------------------------------- tests

describe("DesktopsScreen", () => {
  it("shows the bar actions and goes to pairing and settings", async () => {
    const { services } = servicesWith(() => []);
    await renderScreen(services);

    expect(screen.getByRole("header", { name: "Desktops" })).toBeTruthy();
    await fireEvent.press(screen.getByTestId("desktops-pair"));
    expect(mockRouter.push).toHaveBeenLastCalledWith("/pair");
    await fireEvent.press(screen.getByLabelText("Settings"));
    expect(mockRouter.push).toHaveBeenLastCalledWith("/settings");
  });

  it("shows the empty state with Pair desktop", async () => {
    const { services } = servicesWith(() => []);
    await renderScreen(services);

    expect(screen.getByText("No paired desktops")).toBeTruthy();
    expect(screen.getByTestId("desktops-empty-icon", hidden())).toBeTruthy();
    await fireEvent.press(screen.getByTestId("desktops-empty-pair"));
    expect(mockRouter.push).toHaveBeenCalledWith("/pair");
    expect(screen.queryByTestId("desktops-list")).toBeNull();
  });

  it("shows skeleton rows until the list is read", async () => {
    const services = createTestServices({ deviceKey: DEVICE });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const list = services.repository.list.bind(services.repository);
    jest.spyOn(services.repository, "list").mockImplementation(async () => {
      await gate;
      return list();
    });
    await renderWithOverlays(<DesktopsScreen />, { services });

    expect(screen.getByTestId("desktops-skeleton")).toBeTruthy();
    expect(screen.getAllByTestId("desktops-skeleton-row")).toHaveLength(3);
    release();
    await settle();
    expect(screen.queryByTestId("desktops-skeleton")).toBeNull();
    expect(screen.getByText("No paired desktops")).toBeTruthy();
  });

  it("shows each state with its label, line 2 and composed label", async () => {
    const { services, hosts } = servicesWith(
      ([online, offline, error, notPaired, unknown], at) => [
        desktop(online!, at, { id: ID_A, name: "Casa" }),
        desktop(offline!, at, { id: ID_B, name: "Notebook", lastStatus: status("offline", at) }),
        desktop(error!, at, {
          id: ID_C,
          name: "Build",
          lastStatus: status("error", at, "unreachable:1006"),
        }),
        desktop(notPaired!, at, { id: ID_D, name: "Antigo", lastStatus: status("not-paired", at) }),
        desktop(unknown!, at, { id: ID_E, name: "Novo" }),
      ],
      { hosts: 5 },
    );
    services.fakes.fetch.setPresence(hosts[0]!.hostId, "online");
    services.fakes.fetch.setPresence(hosts[1]!.hostId, "offline");
    await renderScreen(services);
    await settle();

    // Online: success dot.
    const casa = screen.getByTestId(`desktop-${ID_A}`);
    expect(within(casa).getByText("Online")).toBeTruthy();
    expect(within(casa).getByText("relay.exemplo.com.br · now")).toBeTruthy();
    expect(casa.props.accessibilityLabel).toBe("Casa, Online, relay relay.exemplo.com.br, last attempt now");
    expect(screen.getByTestId(`desktop-${ID_A}-status-leading`, hidden())).toBeTruthy();

    // Offline: neutral dot, same line 2.
    const notebook = screen.getByTestId(`desktop-${ID_B}`);
    expect(within(notebook).getByText("Offline")).toBeTruthy();
    expect(within(notebook).getByText("relay.exemplo.com.br · now")).toBeTruthy();

    // Error: the short reason in place of the host.
    const build = screen.getByTestId(`desktop-${ID_C}`);
    expect(within(build).getByText("Error")).toBeTruthy();
    expect(within(build).getByText("Relay unreachable · now")).toBeTruthy();
    expect(build.props.accessibilityLabel).toBe("Build, Error, Relay unreachable, last attempt now");

    // Not paired: the hint, two buttons and no menu.
    const antigo = screen.getByTestId(`desktop-${ID_D}`);
    expect(within(antigo).getByText("Not paired")).toBeTruthy();
    expect(within(antigo).getByText("Pair again or remove it")).toBeTruthy();
    expect(antigo.props.accessibilityLabel).toBe("Antigo, Not paired, pair again or remove it");
    expect(screen.getByTestId(`desktop-${ID_D}-pair-again`)).toBeTruthy();
    expect(screen.getByTestId(`desktop-${ID_D}-remove`)).toBeTruthy();
    expect(screen.queryByTestId(`desktop-${ID_D}-menu`, hidden())).toBeNull();
    expect(screen.getByTestId(`desktop-${ID_A}-menu`, hidden())).toBeTruthy();

    // No state yet: no label.
    expect(screen.queryByTestId(`desktop-${ID_E}-status`)).toBeNull();
  });

  it("shows Connecting with the spinner while an attempt runs", async () => {
    const { services } = servicesWith(([host], at) => [desktop(host!, at, { id: ID_A, name: "Casa" })]);
    await renderScreen(services);

    await act(async () => {
      services.desktops.open(ID_A);
    });
    expect(within(screen.getByTestId(`desktop-${ID_A}`)).getByText("Connecting…")).toBeTruthy();
    expect(screen.getByTestId(`desktop-${ID_A}-spinner`, hidden())).toBeTruthy();
  });

  it("opens the workspace of a desktop online or with no state yet", async () => {
    const { services } = servicesWith(([host], at) => [desktop(host!, at, { id: ID_A, name: "Casa" })]);
    await renderScreen(services);

    await fireEvent.press(screen.getByTestId(`desktop-${ID_A}`));
    expect(mockRouter.push).toHaveBeenCalledWith(desktopRoute(ID_A));
    expect(services.registry.get(ID_A)).toBeDefined();
  });

  it("tries an offline desktop in place and goes back to Offline when it does not answer", async () => {
    const { services, hosts } = servicesWith(([host], at) => [
      desktop(host!, at, { id: ID_B, name: "Notebook", lastStatus: status("offline", at) }),
    ]);
    hosts[0]!.detach();
    await renderScreen(services);

    await fireEvent.press(screen.getByTestId(`desktop-${ID_B}`));
    expect(within(screen.getByTestId(`desktop-${ID_B}`)).getByText("Connecting…")).toBeTruthy();
    await act(async () => {
      services.fakes.network.last().open();
    });
    expect(within(screen.getByTestId(`desktop-${ID_B}`)).getByText("Offline")).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("opens the workspace once an offline desktop answers the attempt", async () => {
    const { services } = servicesWith(([host], at) => [
      desktop(host!, at, { id: ID_B, name: "Notebook", lastStatus: status("offline", at) }),
    ]);
    await renderScreen(services);

    await fireEvent.press(screen.getByTestId(`desktop-${ID_B}`));
    expect(mockRouter.push).not.toHaveBeenCalled();
    await act(async () => {
      services.fakes.network.last().open();
    });
    expect(mockRouter.push).toHaveBeenCalledWith(desktopRoute(ID_B));
  });

  it("renames from the row sheet, on this device only", async () => {
    const { services } = servicesWith(([host], at) => [desktop(host!, at, { id: ID_A, name: "Casa" })]);
    await renderScreen(services);

    await fireEvent.press(screen.getByTestId(`desktop-${ID_A}-menu`, hidden()));
    expect(screen.getByTestId("desktop-sheet-title")).toHaveTextContent("Casa");
    await fireEvent.press(screen.getByTestId("desktop-sheet-rename"));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText("Only on this device")).toBeTruthy();
    const field = screen.getByLabelText("Desktop name");
    expect(field.props.value).toBe("Casa");
    await fireEvent.changeText(field, "   ");
    expect(screen.getByTestId("rename-save")).toBeDisabled();
    await fireEvent.changeText(field, "Casa nova");
    await fireEvent.press(screen.getByTestId("rename-save"));
    await settle();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(within(screen.getByTestId(`desktop-${ID_A}`)).getByText("Casa nova")).toBeTruthy();
    expect((await services.repository.list())[0]?.name).toBe("Casa nova");
    // The sheet and the form give the screen reader focus back to the menu button (§5).
    expect(focusedTestIds().at(-1)).toBe(`desktop-${ID_A}-menu`);
  });

  it("offers Rename and Remove as screen reader actions, and Refresh", async () => {
    const { services } = servicesWith(([host], at) => [desktop(host!, at, { id: ID_A, name: "Casa" })]);
    await renderScreen(services);
    const row = screen.getByTestId(`desktop-${ID_A}`);
    expect(row.props.accessibilityActions.map((action: { label: string }) => action.label)).toEqual([
      "Rename",
      "Remove",
      "Refresh",
    ]);

    const before = services.fakes.fetch.requests.length;
    await fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "refresh" } });
    await settle();
    expect(services.fakes.fetch.requests.length).toBeGreaterThan(before);

    await fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "rename" } });
    expect(screen.getByLabelText("Desktop name")).toBeTruthy();

    // Opened from the row, the form gives the focus back to the row (§5).
    await fireEvent.press(screen.getByTestId("rename-cancel"));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByLabelText("Desktop name")).toBeNull();
    expect(focusedTestIds().at(-1)).toBe(`desktop-${ID_A}`);

    await fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "remove" } });
    await fireEvent.press(screen.getByTestId("remove-cancel"));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(focusedTestIds().at(-1)).toBe(`desktop-${ID_A}`);
  });

  it("removes after the dialog, and keeps the desktop on Cancel", async () => {
    const { services } = servicesWith(([host], at) => [desktop(host!, at, { id: ID_A, name: "Casa" })]);
    await renderScreen(services);

    await fireEvent.press(screen.getByTestId(`desktop-${ID_A}-menu`, hidden()));
    await fireEvent.press(screen.getByTestId("desktop-sheet-remove"));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Remove Casa?")).toBeTruthy();
    expect(
      screen.getByText("This device still shows as paired in Porecatu on that computer until you revoke it there."),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId("remove-cancel"));
    await settle();
    expect(screen.getByTestId(`desktop-${ID_A}`)).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(focusedTestIds().at(-1)).toBe(`desktop-${ID_A}-menu`);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await fireEvent.press(screen.getByTestId(`desktop-${ID_A}-menu`, hidden()));
    await fireEvent.press(screen.getByTestId("desktop-sheet-remove"));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await fireEvent.press(screen.getByTestId("remove-confirm"));
    await settle();

    expect(screen.queryByTestId(`desktop-${ID_A}`)).toBeNull();
    expect(await services.repository.list()).toEqual([]);
    expect(screen.getByText("No paired desktops")).toBeTruthy();
  });

  it("offers only Pair again and Remove on a desktop not paired", async () => {
    const { services } = servicesWith(([host], at) => [
      desktop(host!, at, { id: ID_D, name: "Antigo", lastStatus: status("not-paired", at) }),
    ]);
    await renderScreen(services);

    await fireEvent.press(screen.getByTestId(`desktop-${ID_D}`));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(services.registry.get(ID_D)).toBeUndefined();

    const row = screen.getByTestId(`desktop-${ID_D}`);
    expect(row.props.accessibilityActions.map((action: { label: string }) => action.label)).toEqual([
      "Pair again",
      "Remove",
      "Refresh",
    ]);

    await fireEvent.press(screen.getByTestId(`desktop-${ID_D}-pair-again`));
    expect(mockRouter.push).toHaveBeenCalledWith("/pair");

    await fireEvent.press(screen.getByTestId(`desktop-${ID_D}-remove`));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Remove Antigo?")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("remove-cancel"));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    // Back to the Remove button that opened the dialog (§5).
    expect(focusedTestIds().at(-1)).toBe(`desktop-${ID_D}-remove`);
  });

  it("shows the permanent warning of RF-1.20 with Open system settings", async () => {
    const { services } = servicesWith(() => []);
    services.fakes.authenticator.setCapability("unavailable");
    await services.start();
    await services.appShell.start();
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    await renderScreen(services);

    expect(
      screen.getByText(
        "This device has no screen lock, so the app cannot be locked. Set one up in the system settings.",
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId("desktops-lock-warning-action"));
    expect(openSettings).toHaveBeenCalled();
  });

  it("has no warning band when the device can lock", async () => {
    const { services } = servicesWith(() => []);
    await services.start();
    await services.appShell.start();
    await renderScreen(services);
    expect(screen.queryByTestId("desktops-lock-warning")).toBeNull();
  });

  it("polls presence only while the screen has the focus", async () => {
    const { services, hosts } = servicesWith(([host], at) => [desktop(host!, at, { id: ID_A, name: "Casa" })]);
    services.fakes.fetch.setPresence(hosts[0]!.hostId, "online");
    await renderScreen(services);
    await settle();

    const shown = services.fakes.fetch.requests.length;
    expect(shown).toBeGreaterThan(0);
    await act(async () => {
      services.fakes.time.advance(30_000);
    });
    await settle();
    const polled = services.fakes.fetch.requests.length;
    expect(polled).toBeGreaterThan(shown);

    await setFocused(false);
    await act(async () => {
      services.fakes.time.advance(120_000);
    });
    await settle();
    expect(services.fakes.fetch.requests.length).toBe(polled);

    await setFocused(true);
    await settle();
    expect(services.fakes.fetch.requests.length).toBeGreaterThan(polled);
  });

  it("stops polling while the app is in the background", async () => {
    const { services, hosts } = servicesWith(([host], at) => [desktop(host!, at, { id: ID_A, name: "Casa" })]);
    services.fakes.fetch.setPresence(hosts[0]!.hostId, "online");
    await renderScreen(services);
    await settle();

    await act(async () => {
      services.appShell.appStateChanged("background");
    });
    const before = services.fakes.fetch.requests.length;
    await act(async () => {
      services.fakes.time.advance(120_000);
    });
    await settle();
    expect(services.fakes.fetch.requests.length).toBe(before);
  });

  it("shows the read error band and tries again", async () => {
    const { services } = servicesWith(([host], at) => [desktop(host!, at, { id: ID_A, name: "Casa" })]);
    const list = services.repository.list.bind(services.repository);
    const spy = jest.spyOn(services.repository, "list").mockRejectedValueOnce(new Error("keystore"));
    await renderScreen(services);

    expect(screen.getByText("Could not read the paired desktops.")).toBeTruthy();
    expect(screen.queryByText("No paired desktops")).toBeNull();

    spy.mockImplementation(list);
    await fireEvent.press(screen.getByTestId("desktops-load-error-retry"));
    await settle();
    expect(screen.queryByTestId("desktops-load-error")).toBeNull();
    expect(screen.getByTestId(`desktop-${ID_A}`)).toBeTruthy();
  });
});
