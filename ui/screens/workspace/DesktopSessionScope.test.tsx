// SPDX-License-Identifier: GPL-3.0-or-later
import { act, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { t } from "@/i18n/catalog";
import { GoodbyeReason } from "@/protocol";
import { type EndReason, IDLE_SNAPSHOT, type LifecycleSnapshot, type LifecycleState } from "@/session/lifecycle";
import { createHarness, greetingHost } from "@/session/testing";
import { renderWithOverlays } from "@ui/overlay/testing";
import { createTestServices } from "@ui/services/testing";

import { DesktopSessionScope, leaveNotice, useDesktopSession } from "./DesktopSessionScope";

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() };

jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

function snapshot(state: LifecycleState, reason?: EndReason): LifecycleSnapshot {
  return { ...IDLE_SNAPSHOT, state, end: reason === undefined ? null : { reason, code: null, hostVersion: null } };
}

/** Lets the queued promises (the list read) settle. */
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

function Probe() {
  const { session, reachedReady } = useDesktopSession();
  return <Text testID="probe">{`${session === undefined ? "none" : "open"}|${String(reachedReady)}`}</Text>;
}

beforeEach(() => {
  jest.useFakeTimers();
  for (const fn of Object.values(mockRouter)) {
    fn.mockReset();
  }
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("leaveNotice (§4.5.4)", () => {
  it("leaves on every goodbye with its reason", () => {
    expect(leaveNotice(snapshot("closed", "goodbye"), true)).toEqual({ key: "goodbye.normal", severity: "info" });
    expect(leaveNotice(snapshot("closed", "remote-disabled"), true)?.key).toBe("goodbye.remote-disabled");
    expect(leaveNotice(snapshot("closed", "host-quitting"), false)?.key).toBe("goodbye.host-quitting");
    expect(leaveNotice(snapshot("closed", "revoked"), true)).toEqual({ key: "goodbye.revoked", severity: "warning" });
  });

  it("leaves on not-paired only after the tree was shown", () => {
    expect(leaveNotice(snapshot("closed", "not-paired"), false)).toBeNull();
    expect(leaveNotice(snapshot("closed", "not-paired"), true)?.key).toBe("goodbye.revoked");
  });

  it("stays for everything else", () => {
    expect(leaveNotice(snapshot("ready"), true)).toBeNull();
    expect(leaveNotice(snapshot("closed", "user"), true)).toBeNull();
    expect(leaveNotice(snapshot("failed", "retries-exhausted"), true)).toBeNull();
    expect(leaveNotice(snapshot("closed", "offline"), false)).toBeNull();
  });
});

describe("DesktopSessionScope", () => {
  it("takes the session already open (the list or the pairing opened it) and closes it on leaving", async () => {
    const h = createHarness();
    greetingHost(h, 1);
    const services = createTestServices({ deviceKey: h.device, desktops: [h.desktop], relay: h.relay, time: h.time });
    await services.start();
    await services.desktops.load();
    const session = services.desktops.open(h.desktop.id);
    services.fakes.network.last().open();
    expect(session?.getState().connection.state).toBe("ready");

    const r = await renderWithOverlays(
      <DesktopSessionScope desktopId={h.desktop.id}>
        <Probe />
      </DesktopSessionScope>,
      { services, start: false },
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("open|true");
    expect(services.fakes.network.sockets).toHaveLength(1);

    await act(async () => {
      r.unmount();
    });
    expect(services.registry.get(h.desktop.id)).toBeUndefined();
    expect(session?.getState().connection).toMatchObject({ state: "closed", end: { reason: "user" } });
  });

  it("goes back to the list when the desktop is not in it", async () => {
    const services = createTestServices();
    await renderWithOverlays(
      <DesktopSessionScope desktopId={"f".repeat(32)}>
        <Probe />
      </DesktopSessionScope>,
      { services },
    );
    await settle();
    expect(screen.getByTestId("probe")).toHaveTextContent("none|false");
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");
  });

  it("goes back to the list with the reason when the desktop quits", async () => {
    const h = createHarness();
    const host = greetingHost(h, 1);
    const services = createTestServices({ deviceKey: h.device, desktops: [h.desktop], relay: h.relay, time: h.time });
    const r = await renderWithOverlays(
      <DesktopSessionScope desktopId={h.desktop.id}>
        <Probe />
      </DesktopSessionScope>,
      { services },
    );
    await settle();
    await act(async () => {
      services.fakes.network.last().open();
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("open|true");

    await act(async () => {
      host.broadcast({ type: "goodbye", reason: GoodbyeReason.hostQuitting });
    });
    expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
    expect(r.overlays.store.getState().toast?.message).toBe(t("goodbye.host-quitting"));
  });
});
