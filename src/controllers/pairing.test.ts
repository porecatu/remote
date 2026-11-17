// SPDX-License-Identifier: GPL-3.0-or-later

// The pairing controller end to end: the flow's effects run on sockets of the
// in-memory relay, the desktop is saved in a memory store, the device name
// goes to the settings, and the open channel reaches `ready` in the session
// registry without a new socket (PRD-001 RF-1.4 to RF-1.11).

import type { EventFields, EventName } from "@/log";
import { PAIRING_CONFIRM_GRACE_MS } from "@/pairing/pairingFlow";
import {
  CloseReason,
  HostChannel,
  PairRejectReason,
  type PairingInvite,
  Platform,
  decodeHostEnvelope,
  encodeHostEnvelope,
  formatPairingUri,
} from "@/protocol";
import { testKeypair } from "@/protocol/testing";
import { type SessionRegistry, createSessionRegistry } from "@/session/registry";
import { type Harness, TEST_RELAY_URL, createHarness } from "@/session/testing";
import { type DesktopRepository, createDesktopRepository } from "@/storage/desktopList";
import { deviceFingerprint } from "@/storage/deviceIdentity";
import { type SecureStore, createMemoryStore } from "@/storage/secureStore";
import { loadSettings, updateSettings } from "@/storage/settings";
import { type PairingController, createPairingController } from "./pairing";

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function settle(): Promise<void> {
  await flush();
  await flush();
}

interface Rig {
  readonly h: Harness;
  readonly repository: DesktopRepository;
  readonly registry: SessionRegistry;
  readonly settings: SecureStore;
  readonly controller: PairingController;
  readonly logs: [EventName, EventFields | undefined][];
}

function rig(h: Harness = createHarness({ paired: false })): Rig {
  const repository = createDesktopRepository(createMemoryStore());
  const registry = createSessionRegistry({
    device: h.device,
    appVersion: "0.0.1",
    openSocket: h.network.openSocket,
    clock: h.time.clock,
    scheduler: h.time.scheduler,
    repository,
  });
  const settings = createMemoryStore();
  const logs: [EventName, EventFields | undefined][] = [];
  const controller = createPairingController({
    device: h.device,
    platform: Platform.android,
    defaultDeviceName: "Pixel 9",
    openSocket: h.network.openSocket,
    repository,
    registry,
    rememberName: async (name) => {
      await updateSettings(settings, { deviceName: name });
    },
    clock: h.time.clock,
    scheduler: h.time.scheduler,
    log: (name, fields) => {
      logs.push([name, fields]);
    },
  });
  return { h, repository, registry, settings, controller, logs };
}

/** Reads the QR, confirms the name and lets the socket open. */
function startPairing(r: Rig, invite: PairingInvite, name = "My Phone"): void {
  r.controller.readUri(formatPairingUri(invite));
  r.controller.submitName(name);
  r.h.network.last().open();
}

/**
 * A desktop whose user decides later: it completes the `XX` handshake, holds
 * the pair request and answers when the test says so. It replaces the
 * harness's fake host (same id and key).
 */
function decidingHost(h: Harness) {
  h.host.detach();
  const channels = new Map<number, HostChannel>();
  const pending: number[] = [];
  const link = h.relay.attachHost(h.host.hostId, (frame) => {
    const envelope = decodeHostEnvelope(frame);
    if (envelope.type === "channel-opened") {
      channels.set(envelope.channel, new HostChannel(testKeypair(1), h.host.hostId, h.time.clock.now()));
    } else if (envelope.type === "channel-closed") {
      channels.get(envelope.channel)?.close();
      channels.delete(envelope.channel);
    } else if (envelope.type === "channel-data") {
      const channel = channels.get(envelope.channel);
      if (channel === undefined) {
        return;
      }
      for (const event of channel.receive(envelope.payload, h.time.clock.now())) {
        if (event.type === "send") {
          write(envelope.channel, [event.payload]);
        } else if (event.type === "pair-requested") {
          pending.push(envelope.channel);
        }
      }
    }
  });

  function write(channel: number, payloads: readonly Uint8Array[]): void {
    for (const payload of payloads) {
      link.send(encodeHostEnvelope({ type: "channel-data", channel, payload }));
    }
  }

  return {
    pending: (): number => pending.length,
    decline(reason: PairRejectReason): void {
      const number = pending.shift();
      const channel = number === undefined ? undefined : channels.get(number);
      if (number === undefined || channel === undefined) {
        throw new Error("no pairing waiting");
      }
      write(number, channel.send({ type: "pair-rejected", reason }, h.time.clock.now()));
      channel.close();
      channels.delete(number);
      link.send(encodeHostEnvelope({ type: "close-channel", channel: number, reason: CloseReason.normal }));
    },
  };
}

function loggedText(r: Rig): string {
  return JSON.stringify(r.logs);
}

// ----------------------------------------------------------------- tests

describe("reading the QR and the name (RF-1.6, RF-1.7)", () => {
  it("refuses an invalid URI without opening a socket", () => {
    const r = rig();
    r.controller.readUri("porecatu://pair?v=0");
    const state = r.controller.store.getState();
    expect(state.step).toBe("failed");
    expect(state.failure).toMatchObject({ kind: "uri", error: "missing-field" });
    expect(state.active).toBe(false);
    expect(r.h.network.sockets).toHaveLength(0);
  });

  it("shows the desktop name, the fingerprint and the pre-filled name", () => {
    const r = rig();
    r.controller.readUri(formatPairingUri(r.h.host.startPairing(TEST_RELAY_URL)));
    expect(r.controller.store.getState()).toMatchObject({
      step: "naming",
      hostName: "Test Desktop",
      suggestedName: "Pixel 9",
      nameError: null,
      deviceFingerprint: deviceFingerprint(r.h.device),
      confirmSecondsLeft: null,
      pairedDesktopId: null,
    });
  });

  it("refuses an empty name and stays on the name step", () => {
    const r = rig();
    r.controller.readUri(formatPairingUri(r.h.host.startPairing(TEST_RELAY_URL)));
    r.controller.submitName("   ");
    expect(r.controller.store.getState()).toMatchObject({ step: "naming", nameError: "empty" });
    expect(r.h.network.sockets).toHaveLength(0);
  });
});

describe("accepted (RF-1.10)", () => {
  it("saves the desktop, remembers the name and hands the session over to ready, with no new socket", async () => {
    const r = rig();
    startPairing(r, r.h.host.startPairing(TEST_RELAY_URL));
    expect(r.controller.store.getState().step).toBe("saving");
    await settle();

    const state = r.controller.store.getState();
    expect(state.step).toBe("paired");
    expect(state.active).toBe(false);
    const list = await r.repository.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Test Desktop");
    expect(state.pairedDesktopId).toBe(list[0]?.id);
    expect(state.hostName).toBe("Test Desktop");
    expect(state.replaced).toBe(false);
    expect((await loadSettings(r.settings)).deviceName).toBe("My Phone");

    const session = r.registry.get(state.pairedDesktopId ?? "");
    expect(session?.getState().connection.state).toBe("ready");
    expect(session?.getState().workspace).not.toBeNull();
    expect(r.h.network.sockets).toHaveLength(1);
    expect(r.h.network.last().closedByApp).toBe(false);
    expect(r.h.host.received.filter((entry) => entry.message.type === "hello")).toHaveLength(1);
    expect(r.h.host.isPaired(r.h.device.publicKey)).toBe(true);

    expect(r.logs.map(([name]) => name)).toEqual(
      expect.arrayContaining(["relay_connecting", "relay_connected", "pair_ok"]),
    );
    expect(loggedText(r)).not.toContain("My Phone");
    expect(loggedText(r)).not.toContain("Test Desktop");
    r.registry.closeAll();
  });

  it("opens the desktop the normal way when the channel ended during the save", async () => {
    const r = rig();
    startPairing(r, r.h.host.startPairing(TEST_RELAY_URL));
    expect(r.controller.store.getState().step).toBe("saving");
    r.h.network.last().drop(1006);
    await settle();

    const state = r.controller.store.getState();
    expect(state.step).toBe("paired");
    expect(r.h.network.sockets).toHaveLength(2);
    r.h.network.last().open();
    expect(r.registry.get(state.pairedDesktopId ?? "")?.getState().connection.state).toBe("ready");
    r.registry.closeAll();
  });

  it("after dispose, a save in flight keeps the desktop and the name but opens no session", async () => {
    const r = rig();
    startPairing(r, r.h.host.startPairing(TEST_RELAY_URL));
    expect(r.controller.store.getState().step).toBe("saving");
    r.controller.dispose();
    await settle();

    expect(await r.repository.list()).toHaveLength(1);
    expect((await loadSettings(r.settings)).deviceName).toBe("My Phone");
    expect(r.registry.openIds()).toEqual([]);
    expect(r.h.network.sockets).toHaveLength(1);
    expect(r.h.network.last().closedByApp).toBe(true);
  });
});

describe("refused and failed", () => {
  it("token-invalid: rejected, socket closed, nothing saved", async () => {
    const r = rig();
    const stale = r.h.host.startPairing(TEST_RELAY_URL);
    r.h.host.startPairing(TEST_RELAY_URL);
    startPairing(r, stale);
    await settle();

    expect(r.controller.store.getState()).toMatchObject({
      step: "failed",
      failure: { kind: "rejected", reason: PairRejectReason.tokenInvalid },
      pairedDesktopId: null,
    });
    expect(r.h.network.last().closedByApp).toBe(true);
    expect(await r.repository.list()).toEqual([]);
    expect((await loadSettings(r.settings)).deviceName).toBeNull();
    expect(r.registry.openIds()).toEqual([]);
  });

  it.each([
    ["user-declined", PairRejectReason.userDeclined],
    ["timeout", PairRejectReason.timeout],
  ] as const)("%s: rejected, nothing saved", async (_label, reason) => {
    const r = rig();
    const invite = r.h.host.startPairing(TEST_RELAY_URL);
    const host = decidingHost(r.h);
    startPairing(r, invite);
    expect(r.controller.store.getState().step).toBe("awaiting-confirmation");
    expect(host.pending()).toBe(1);

    host.decline(reason);
    await settle();
    expect(r.controller.store.getState()).toMatchObject({
      step: "failed",
      failure: { kind: "rejected", reason },
    });
    expect(await r.repository.list()).toEqual([]);
    expect((await loadSettings(r.settings)).deviceName).toBeNull();
    expect(r.h.time.pending()).toBe(0);
  });

  it("a desktop with another key fails on identity and sends nothing past the handshake", async () => {
    const r = rig();
    const invite = { ...r.h.host.startPairing(TEST_RELAY_URL), hostKey: testKeypair(9).publicKey };
    startPairing(r, invite);
    await settle();

    expect(r.controller.store.getState()).toMatchObject({
      step: "failed",
      failure: { kind: "host-key-mismatch" },
    });
    // Only the first handshake message left: no msg3, no pair request.
    expect(r.h.network.last().sent).toHaveLength(1);
    expect(r.h.host.received).toEqual([]);
    expect(r.h.host.isPaired(r.h.device.publicKey)).toBe(false);
    expect(r.h.network.last().closedByApp).toBe(true);
    expect(await r.repository.list()).toEqual([]);
    expect(r.logs).toContainEqual(["handshake_failed", { code: "host-key-mismatch" }]);
  });

  it("cancel closes the socket and saves nothing", async () => {
    const r = rig();
    const invite = r.h.host.startPairing(TEST_RELAY_URL);
    decidingHost(r.h);
    startPairing(r, invite);
    expect(r.controller.store.getState().step).toBe("awaiting-confirmation");

    r.controller.cancel();
    await settle();
    expect(r.controller.store.getState()).toMatchObject({ step: "idle", active: false, failure: null });
    expect(r.h.network.last().closedByApp).toBe(true);
    expect(await r.repository.list()).toEqual([]);
    expect((await loadSettings(r.settings)).deviceName).toBeNull();
    expect(r.h.time.pending()).toBe(0);
  });

  it("a new QR during the wait drops the first attempt", () => {
    const r = rig();
    const invite = r.h.host.startPairing(TEST_RELAY_URL);
    decidingHost(r.h);
    startPairing(r, invite);
    const first = r.h.network.last();

    r.controller.readUri(formatPairingUri(invite));
    expect(first.closedByApp).toBe(true);
    expect(r.controller.store.getState().step).toBe("naming");
    expect(r.h.time.pending()).toBe(0);
  });
});

describe("waiting for the desktop (RF-1.9)", () => {
  it("counts the seconds down and gives up after the wait plus the grace", () => {
    const r = rig();
    const invite = r.h.host.startPairing(TEST_RELAY_URL);
    decidingHost(r.h);
    startPairing(r, invite);
    const store = r.controller.store;
    expect(store.getState()).toMatchObject({
      step: "awaiting-confirmation",
      active: true,
      confirmSecondsLeft: 120,
      deviceName: "My Phone",
      hostName: "Test Desktop",
    });

    r.h.time.advance(999);
    expect(store.getState().confirmSecondsLeft).toBe(120);
    r.h.time.advance(1);
    expect(store.getState().confirmSecondsLeft).toBe(119);
    r.h.time.advance(119_000);
    expect(store.getState()).toMatchObject({ step: "awaiting-confirmation", confirmSecondsLeft: 0 });

    r.h.time.advance(PAIRING_CONFIRM_GRACE_MS);
    expect(store.getState()).toMatchObject({
      step: "failed",
      failure: { kind: "timeout", phase: "confirmation" },
      confirmSecondsLeft: null,
    });
    expect(r.h.network.last().closedByApp).toBe(true);
    expect(r.h.time.pending()).toBe(0);
  });

  it("times out opening the socket when it never opens", () => {
    const r = rig();
    r.controller.readUri(formatPairingUri(r.h.host.startPairing(TEST_RELAY_URL)));
    r.controller.submitName("My Phone");
    expect(r.controller.store.getState().step).toBe("connecting");
    r.h.time.advance(60_000);
    expect(r.controller.store.getState().failure).toEqual({ kind: "timeout", phase: "connect" });
    expect(r.h.network.last().closedByApp).toBe(true);
  });
});
