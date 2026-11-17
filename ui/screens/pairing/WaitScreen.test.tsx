// SPDX-License-Identifier: GPL-3.0-or-later
// Waiting for the confirmation and the results (anatomy §4.3.4), with
// expo-router mocked: on a fake controller for each state, and once end to
// end on the real controller against the fake desktop of the protocol package.
import { act, fireEvent } from "@testing-library/react-native";
import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";

import { t, tn } from "@/i18n/catalog";
import { CloseReason, PairRejectReason, formatPairingUri } from "@/protocol";
import { createFakeHost } from "@/protocol/testing";
import { TEST_RELAY_URL, desktopFor } from "@/session/testing";
import { createTestServices } from "@ui/services/testing";

import { type PairingFlow, usePairingFlow } from "./PairingContext";
import { WaitScreen } from "./WaitScreen";
import { TEST_FINGERPRINT, createFakePairingController, flows, renderPairing, testUri } from "./testing";

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  dismissTo: jest.fn(),
};

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));

let announce: jest.SpyInstance;
let announceQueued: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  announceQueued = jest
    .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  announce.mockRestore();
  announceQueued.mockRestore();
});

async function renderWait(fake = createFakePairingController(), services = createTestServices()) {
  const seen: { flow: PairingFlow | null } = { flow: null };
  function Grab() {
    const current = usePairingFlow();
    useEffect(() => {
      seen.flow = current;
    });
    return null;
  }
  const screen = await renderPairing(
    <>
      <Grab />
      <WaitScreen />
    </>,
    { controller: fake, services },
  );
  const started = seen.flow as unknown as PairingFlow;
  await act(async () => {
    started.readUri(testUri());
    started.submitName("My Phone");
  });
  return { screen, fake, flow: started, services };
}

describe("WaitScreen phases", () => {
  it("shows the connection steps with Cancel", async () => {
    const { screen, fake } = await renderWait();
    expect(screen.getByText(t("pairing.title_with", { name: "Home" }))).toBeTruthy();
    expect(screen.getByText(t("pairing.connecting_relay"))).toBeTruthy();
    expect(screen.getByText(t("pairing.verifying_desktop"))).toBeTruthy();
    expect(screen.getByTestId("wait-step-relay-spinner", { includeHiddenElements: true })).toBeTruthy();
    await act(async () => {
      fake.set(flows.handshaking());
    });
    expect(screen.getByTestId("wait-step-relay-done", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("wait-step-desktop-spinner", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("wait-cancel")).toBeEnabled();
  });

  it("shows the fingerprint and the time left while the desktop asks", async () => {
    const { screen, fake } = await renderWait();
    await act(async () => {
      fake.set(flows.awaiting(), { confirmSecondsLeft: 102 });
    });
    expect(screen.getByText(t("pairing.waiting_for_desktop"))).toBeTruthy();
    expect(screen.getByText(t("pairing.compare_fingerprint"))).toBeTruthy();
    expect(screen.getByTestId("fingerprint-text")).toHaveTextContent("ABCD EFGH IJKL MNOP");
    expect(
      screen.getByLabelText(
        t("a11y.fingerprint", { characters: "A B C D, E F G H, I J K L, M N O P" }),
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("countdown-time")).toHaveTextContent("1:42");
    expect(screen.getByLabelText(tn("pairing.seconds_left", 102))).toBeTruthy();
    expect(screen.getByTestId("wait-cancel")).toBeTruthy();
    expect(TEST_FINGERPRINT).toBe("ABCD EFGH IJKL MNOP");
  });

  it("announces the time left every 30 s and in the last 10 s", async () => {
    const { fake } = await renderWait();
    for (const seconds of [120, 119, 91, 90, 89, 60, 30, 11, 10, 9]) {
      await act(async () => {
        fake.set(flows.awaiting(), { confirmSecondsLeft: seconds });
      });
    }
    const said = announceQueued.mock.calls.map((call: unknown[]) => call[0]);
    expect(said).toEqual([90, 60, 30, 10, 9].map((n) => tn("pairing.seconds_left", n)));
  });

  it("cancels: closes the attempt and leaves the flow", async () => {
    const { screen, fake } = await renderWait();
    await act(async () => {
      fake.set(flows.awaiting(), { confirmSecondsLeft: 100 });
    });
    await fireEvent.press(screen.getByTestId("wait-cancel"));
    expect(fake.calls.cancel).toBe(1);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");
  });

  it("cancels with the x of the bar too", async () => {
    const { screen, fake } = await renderWait();
    await fireEvent.press(screen.getByTestId("wait-bar-close"));
    expect(fake.calls.cancel).toBe(1);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");
  });

  it("the x of the bar says Cancel during the attempt and Close after it", async () => {
    const { screen, fake } = await renderWait();
    await act(async () => {
      fake.set(flows.handshaking());
    });
    expect(screen.getByTestId("wait-bar-close").props.accessibilityLabel).toBe(t("common.cancel"));
    await act(async () => {
      fake.set(flows.failed({ kind: "host-key-mismatch" }));
    });
    expect(screen.getByTestId("wait-bar-close").props.accessibilityLabel).toBe(t("common.close"));
    await fireEvent.press(screen.getByTestId("wait-bar-close"));
    expect(fake.calls.cancel).toBe(0);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");
  });

  it("cancels when the screen goes away during the attempt", async () => {
    const { screen, fake } = await renderWait();
    await screen.unmount();
    expect(fake.calls.cancel).toBeGreaterThanOrEqual(1);
  });

  it("cannot cancel while the desktop is being saved", async () => {
    const { screen, fake } = await renderWait();
    await act(async () => {
      fake.set(flows.saving());
    });
    expect(screen.getByTestId("wait-cancel")).toBeDisabled();
  });
});

describe("WaitScreen results", () => {
  async function failWith(failure: Parameters<typeof flows.failed>[0], from = flows.awaiting()) {
    const rendered = await renderWait();
    await act(async () => {
      rendered.fake.set(from);
    });
    await act(async () => {
      rendered.fake.set(flows.failed(failure));
    });
    return rendered;
  }

  it("token-invalid: scan another code or close", async () => {
    const { screen, services } = await failWith({ kind: "rejected", reason: PairRejectReason.tokenInvalid });
    expect(screen.getByText(t("pairing.failed_title"))).toBeTruthy();
    expect(screen.getByText(t("pair_rejected.token-invalid"))).toBeTruthy();
    expect(services.fakes.haptics.calls).toContain("notify-error");
    await fireEvent.press(screen.getByTestId("pairing-result-scan-another"));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/pair");
    await fireEvent.press(screen.getByTestId("pairing-result-close"));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");
  });

  it("user-declined and timeout have their texts", async () => {
    const declined = await failWith({ kind: "rejected", reason: PairRejectReason.userDeclined });
    expect(declined.screen.getByText(t("pair_rejected.user-declined"))).toBeTruthy();
    const timeout = await failWith({ kind: "timeout", phase: "confirmation" });
    expect(timeout.screen.getByText(t("pair_rejected.timeout"))).toBeTruthy();
  });

  it("identity mismatch: a security screen with only Close", async () => {
    const { screen } = await failWith({ kind: "host-key-mismatch" }, flows.handshaking());
    expect(screen.getByTestId("pairing-security-error")).toBeTruthy();
    expect(screen.getByText(t("pairing.identity_mismatch_title"))).toBeTruthy();
    expect(screen.getByText(t("pairing.identity_mismatch"))).toBeTruthy();
    expect(screen.getByTestId("pairing-result-close")).toBeTruthy();
    expect(screen.queryByTestId("pairing-result-retry")).toBeNull();
    expect(screen.queryByTestId("pairing-result-scan-another")).toBeNull();
  });

  it("unreachable relay: names the host and tries again with the same code", async () => {
    const { screen, fake } = await failWith({ kind: "connection-lost" }, flows.connecting());
    expect(screen.getByText(t("connection.relay_unreachable", { host: "relay.example.com" }))).toBeTruthy();
    await fireEvent.press(screen.getByTestId("pairing-result-retry"));
    expect(fake.calls.readUri).toEqual([testUri(), testUri()]);
    expect(fake.calls.submitName).toEqual(["My Phone", "My Phone"]);
    expect(screen.getByText(t("pairing.connecting_relay"))).toBeTruthy();
  });

  it("full list and failed save have their texts", async () => {
    const full = await failWith({ kind: "list-full" }, flows.saving());
    expect(full.screen.getByText(t("pairing.list_full", { max: 20 }))).toBeTruthy();
    const storage = await failWith({ kind: "storage" }, flows.saving());
    expect(storage.screen.getByText(t("pairing.storage_failed"))).toBeTruthy();
  });

  it("other failures have their texts", async () => {
    expect((await failWith({ kind: "host-unavailable" }, flows.handshaking())).screen.getByText(
      t("pairing.host_unavailable"),
    )).toBeTruthy();
    expect((await failWith({ kind: "relay-closed", reason: CloseReason.hostGone })).screen.getByText(
      t("close_reason.host-gone"),
    )).toBeTruthy();
    expect((await failWith({ kind: "protocol", detail: "x" })).screen.getByText(t("error.protocol"))).toBeTruthy();
  });

  it("accepted: shows the success for 800 ms, then opens the workspace", async () => {
    const { screen, fake, services } = await renderWait();
    const desktop = desktopFor({ hostId: "h", hostKey: new Uint8Array(32) }, "2026-11-16T00:00:00.000Z", {
      id: "b".repeat(32),
      name: "Home PC",
    });
    await act(async () => {
      fake.set(flows.paired(desktop));
    });
    expect(screen.getByText(t("pairing.paired", { name: "Home PC" }))).toBeTruthy();
    expect(screen.getByTestId("pairing-result-icon", { includeHiddenElements: true })).toBeTruthy();
    expect(services.fakes.haptics.calls).toContain("notify-success");
    await act(async () => {
      services.fakes.time.advance(799);
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await act(async () => {
      services.fakes.time.advance(1);
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(`/desktop/${"b".repeat(32)}`);
    // Paired: leaving does not cancel anything.
    const cancels = fake.calls.cancel;
    await screen.unmount();
    expect(fake.calls.cancel).toBe(cancels);
  });
});

describe("WaitScreen end to end", () => {
  it("pairs with the fake desktop and opens its workspace in the same session", async () => {
    const services = createTestServices({ settings: { appLock: false } });
    await services.start();
    const host = createFakeHost({
      relay: services.fakes.relay,
      now: () => services.fakes.time.clock.now(),
      hostName: "Home PC",
    });
    const uri = formatPairingUri(host.startPairing(TEST_RELAY_URL));

    const seen: { flow: PairingFlow | null } = { flow: null };
    function Grab() {
      const current = usePairingFlow();
      useEffect(() => {
        seen.flow = current;
      });
      return null;
    }
    const screen = await renderPairing(
      <>
        <Grab />
        <WaitScreen />
      </>,
      { services },
    );
    const live = seen.flow as unknown as PairingFlow;
    await act(async () => {
      live.readUri(uri);
      live.submitName("My Phone");
    });
    expect(screen.getByText(t("pairing.connecting_relay"))).toBeTruthy();
    await act(async () => {
      services.fakes.network.last().open();
    });
    // The fake desktop accepts at once; the save is asynchronous.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const state = live.controller.store.getState();
    expect(state.step).toBe("paired");
    expect(screen.getByText(t("pairing.paired", { name: "Home PC" }))).toBeTruthy();
    expect(services.fakes.network.sockets).toHaveLength(1);
    expect(services.registry.openIds()).toEqual([state.pairedDesktopId]);
    await act(async () => {
      services.fakes.time.advance(800);
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(`/desktop/${state.pairedDesktopId ?? ""}`);
    // RF-1.2: the name of this pairing is remembered.
    expect(services.settings.store.getState().settings.deviceName).toBe("My Phone");
    await screen.unmount();
    services.registry.closeAll();
  });
});
