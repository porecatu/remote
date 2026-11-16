// SPDX-License-Identifier: GPL-3.0-or-later

import { base64UrlEncode, hostId as deriveHostId } from "@/protocol";
import { createFakeHost, testKeypair } from "@/protocol/testing";
import { createDesktopRepository } from "@/storage/desktopList";
import type { Desktop, DesktopRepository } from "@/storage/desktopList";
import { createMemoryStore } from "@/storage/secureStore";
import { BACKGROUND_CLOSE_MS, type LifecycleSnapshot } from "./lifecycle";
import { type SessionRegistry, createSessionRegistry, statusFor } from "./registry";
import { type Harness, TEST_RELAY_URL, createHarness } from "./testing";

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

interface Rig {
  readonly h: Harness;
  readonly repository: DesktopRepository;
  readonly registry: SessionRegistry;
}

function rig(h: Harness = createHarness()): Rig {
  const repository = createDesktopRepository(createMemoryStore());
  const registry = createSessionRegistry({
    device: h.device,
    appVersion: "0.0.1",
    openSocket: h.network.openSocket,
    clock: h.time.clock,
    scheduler: h.time.scheduler,
    repository,
  });
  return { h, repository, registry };
}

async function addDesktop(
  r: Rig,
  host: { readonly hostId: string; readonly hostKey: Uint8Array },
  name = "Desktop",
): Promise<Desktop> {
  const result = await r.repository.add({
    name,
    relayUrl: TEST_RELAY_URL,
    hostId: host.hostId,
    hostKeyB64: base64UrlEncode(host.hostKey),
    pairedAt: r.h.time.clock.iso(),
  });
  if (!result.ok) {
    throw new Error("could not add the desktop");
  }
  return result.desktop;
}

async function statusOf(r: Rig, id: string): Promise<string> {
  const list = await r.repository.list();
  const status = list.find((d) => d.id === id)?.lastStatus;
  return status === undefined ? "?" : `${status.kind}${status.errorCode === undefined ? "" : `:${status.errorCode}`}`;
}

function openSockets(r: Rig): void {
  for (const socket of r.h.network.sockets) {
    socket.open();
  }
}

describe("registry: open and close", () => {
  it("creates one store per desktop and connects", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    expect(r.registry.get(desktop.id)).toBeUndefined();

    const session = r.registry.open(desktop);
    r.h.network.last().open();
    expect(session.getState().connection.state).toBe("ready");
    expect(r.registry.get(desktop.id)).toBe(session);
    expect(r.registry.openIds()).toEqual([desktop.id]);

    expect(r.registry.open(desktop)).toBe(session);
    expect(r.h.network.sockets).toHaveLength(1);
  });

  it("keeps independent sessions for two desktops", async () => {
    const h = createHarness();
    const r = rig(h);
    const other = createFakeHost({
      relay: h.relay,
      now: h.time.clock.now,
      hostKey: testKeypair(3),
      hostId: deriveHostId(new Uint8Array(32).fill(9)),
      hostName: "Other",
      pairedDevices: [h.device.publicKey],
    });
    const first = await addDesktop(r, h.host, "One");
    const second = await addDesktop(r, other, "Two");

    const a = r.registry.open(first);
    const b = r.registry.open(second);
    openSockets(r);

    expect(a).not.toBe(b);
    expect(a.getState().connection.welcome?.hostName).toBe("Test Desktop");
    expect(b.getState().connection.welcome?.hostName).toBe("Other");

    r.registry.close(first.id);
    expect(r.registry.openIds()).toEqual([second.id]);
    expect(a.getState().connection.state).toBe("closed");
    expect(b.getState().connection.state).toBe("ready");
  });

  it("reconnects a store that ended when the desktop is opened again", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    const session = r.registry.open(desktop);
    r.h.network.last().drop();
    expect(session.getState().connection.state).toBe("failed");

    expect(r.registry.open(desktop)).toBe(session);
    r.h.network.last().open();
    expect(session.getState().connection.state).toBe("ready");
  });

  it("builds a new store for a desktop paired again with another key", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    const first = r.registry.open(desktop);
    r.h.network.last().open();

    const repaired: Desktop = { ...desktop, hostKeyB64: base64UrlEncode(testKeypair(5).publicKey) };
    const second = r.registry.open(repaired);
    expect(second).not.toBe(first);
    expect(first.getState().connection.state).toBe("closed");
  });

  it("closes everything", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    r.registry.open(desktop);
    r.h.network.last().open();
    r.registry.closeAll();
    expect(r.registry.openIds()).toEqual([]);
    expect(r.h.time.pending()).toBe(0);
  });
});

describe("registry: the desktop list learns the outcome", () => {
  it("records connecting, then connected", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    r.registry.open(desktop);
    expect(await statusOf(r, desktop.id)).toBe("connecting");
    r.h.network.last().open();
    expect(await statusOf(r, desktop.id)).toBe("connected");
  });

  it("records offline when the relay has no such host", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    r.h.host.detach();
    r.registry.open(desktop);
    r.h.network.last().open();
    expect(await statusOf(r, desktop.id)).toBe("offline");
  });

  it("records not-paired when the desktop does not know the device", async () => {
    const r = rig(createHarness({ paired: false }));
    const desktop = await addDesktop(r, r.h.host);
    r.registry.open(desktop);
    r.h.network.last().open();
    expect(await statusOf(r, desktop.id)).toBe("not-paired");
  });

  it("records not-paired on goodbye { revoked } and offline with the reason on remote-disabled", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    r.registry.open(desktop);
    r.h.network.last().open();
    r.h.host.broadcast({ type: "goodbye", reason: 2 });
    expect(await statusOf(r, desktop.id)).toBe("not-paired");

    r.registry.open(desktop);
    r.h.network.last().open();
    r.h.host.broadcast({ type: "goodbye", reason: 1 });
    expect(await statusOf(r, desktop.id)).toBe("offline:remote-disabled");
  });

  it("records the error code when the connection fails before the first ready", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    r.registry.open(desktop);
    r.h.network.last().drop(1006);
    expect(await statusOf(r, desktop.id)).toBe("error:unreachable:closed:1006");
  });

  it("does not record the user leaving", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    r.registry.open(desktop);
    r.h.network.last().open();
    r.registry.close(desktop.id);
    expect(await statusOf(r, desktop.id)).toBe("connected");
  });
});

describe("registry: background", () => {
  it("closes every session after 30 s and brings them back on return", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    const session = r.registry.open(desktop);
    r.h.network.last().open();

    r.registry.enterBackground();
    r.h.time.advance(BACKGROUND_CLOSE_MS);
    expect(session.getState().connection).toMatchObject({ state: "closed", end: { reason: "background" } });

    r.registry.enterForeground();
    r.h.network.last().open();
    expect(session.getState().connection.state).toBe("ready");
  });
});

describe("statusFor", () => {
  const base: LifecycleSnapshot = { state: "idle", attempt: 0, retryAt: null, end: null, welcome: null };

  it("says nothing for idle and for ends that are not an attempt's outcome", () => {
    expect(statusFor(base)).toBeNull();
    expect(
      statusFor({ ...base, state: "closed", end: { reason: "user", code: null, hostVersion: null } }),
    ).toBeNull();
    expect(
      statusFor({ ...base, state: "closed", end: { reason: "background", code: null, hostVersion: null } }),
    ).toBeNull();
  });

  it("maps a reconnection to connecting and incompatible to an error", () => {
    expect(statusFor({ ...base, state: "reconnecting", attempt: 1 })).toEqual({ kind: "connecting" });
    expect(
      statusFor({
        ...base,
        state: "closed",
        end: { reason: "incompatible", code: null, hostVersion: [0, 9] },
      }),
    ).toEqual({ kind: "error", errorCode: "incompatible" });
  });
});
