// SPDX-License-Identifier: GPL-3.0-or-later
import { act } from "@testing-library/react-native";
import { useEffect } from "react";
import { Text } from "react-native";

import { createTestServices } from "@ui/services/testing";

import { type PairingFlow, createPairingFlow, usePairingFlow } from "./PairingContext";
import { TEST_INVITE, createFakePairingController, flows, renderPairing, testUri } from "./testing";

function StepProbe() {
  const flow = usePairingFlow();
  return <Text testID="probe">{flow.controller.store.getState().step}</Text>;
}

describe("createPairingFlow", () => {
  it("remembers the desktop, the relay host and the step a failure came from", () => {
    const fake = createFakePairingController();
    const flow = createPairingFlow(fake);
    flow.readUri(testUri());
    expect(flow.memory.getState()).toMatchObject({
      desktopName: "Home",
      relayHost: "relay.example.com",
      failedFrom: null,
      canRetry: false,
    });
    flow.submitName("My Phone");
    expect(flow.memory.getState().canRetry).toBe(true);
    fake.set(flows.failed({ kind: "connection-lost" }));
    expect(flow.memory.getState()).toMatchObject({
      desktopName: "Home",
      relayHost: "relay.example.com",
      failedFrom: "connecting",
    });
  });

  it("runs the last attempt again on retry", () => {
    const fake = createFakePairingController();
    const flow = createPairingFlow(fake);
    flow.readUri(testUri());
    flow.submitName("My Phone");
    fake.set(flows.failed({ kind: "host-unavailable" }));
    flow.retry();
    expect(fake.calls.readUri).toEqual([testUri(), testUri()]);
    expect(fake.calls.submitName).toEqual(["My Phone", "My Phone"]);
    expect(fake.store.getState().step).toBe("connecting");
  });

  it("does not retry a code without a name, and forgets everything on dispose", () => {
    const fake = createFakePairingController();
    const flow = createPairingFlow(fake);
    flow.readUri(testUri());
    flow.retry();
    expect(fake.calls.readUri).toHaveLength(1);
    flow.submitName("My Phone");
    flow.dispose();
    expect(fake.calls.dispose).toBe(1);
    expect(flow.memory.getState()).toEqual({ desktopName: null, relayHost: null, failedFrom: null, canRetry: false });
    flow.retry();
    flow.readUri(testUri());
    expect(fake.calls.readUri).toHaveLength(1);
  });
});

describe("PairingProvider", () => {
  async function unlockedServices() {
    const services = createTestServices({ settings: { appLock: false } });
    await services.start();
    await services.appShell.start();
    return services;
  }

  it("takes a held pairing link on mount (RF-1.5)", async () => {
    const services = await unlockedServices();
    expect(services.appShell.receiveLink(testUri())).toBe(true);
    const fake = createFakePairingController();
    const screen = await renderPairing(<StepProbe />, { services, controller: fake });
    expect(fake.calls.readUri).toEqual([testUri()]);
    expect(services.appShell.store.getState().pendingPairingLink).toBeNull();
    expect(screen.getByTestId("probe")).toBeTruthy();
  });

  it("takes a link released while the stack is already open", async () => {
    const services = await unlockedServices();
    const fake = createFakePairingController();
    await renderPairing(<StepProbe />, { services, controller: fake });
    expect(fake.calls.readUri).toEqual([]);
    const other = testUri({ ...TEST_INVITE, hostName: "Office" });
    await act(async () => {
      services.appShell.receiveLink(other);
    });
    expect(fake.calls.readUri).toEqual([other]);
    expect(fake.store.getState().hostName).toBe("Office");
    expect(services.appShell.store.getState().pendingPairingLink).toBeNull();
  });

  it("disposes of the controller when the stack goes away", async () => {
    const fake = createFakePairingController();
    const screen = await renderPairing(<StepProbe />, { controller: fake });
    expect(fake.calls.dispose).toBe(0);
    await screen.unmount();
    expect(fake.calls.dispose).toBe(1);
  });

  it("builds a real controller over the services, suggesting the phone model", async () => {
    const services = await unlockedServices();
    services.appShell.receiveLink(testUri());
    const seen: { flow: PairingFlow | null } = { flow: null };
    function Grab() {
      const flow = usePairingFlow();
      useEffect(() => {
        seen.flow = flow;
      });
      return null;
    }
    await renderPairing(<Grab />, { services });
    const state = seen.flow?.controller.store.getState();
    expect(state?.step).toBe("naming");
    expect(state?.suggestedName).toBe("Test Phone");
  });
});
