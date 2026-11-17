// SPDX-License-Identifier: GPL-3.0-or-later

import { base64UrlEncode, hostId as deriveHostId } from "@/protocol";
import { createFakeHost, testKeypair } from "@/protocol/testing";
import type { FetchLike } from "@/net/presence";
import { type SessionRegistry, createSessionRegistry } from "@/session/registry";
import { type Harness, TEST_RELAY_URL, createHarness } from "@/session/testing";
import { type Desktop, type DesktopRepository, createDesktopRepository } from "@/storage/desktopList";
import { type SecureStore, createMemoryStore } from "@/storage/secureStore";
import { type DesktopsController, createDesktopsController, rowStatus } from "./desktops";

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Lets the promises queued so far (secure store, presence answers) settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

interface FakeFetch {
  readonly fetch: FetchLike;
  readonly calls: string[];
  /** Status answered per URL; anything else answers 404. */
  readonly statuses: Map<string, number>;
}

function createFakeFetch(): FakeFetch {
  const calls: string[] = [];
  const statuses = new Map<string, number>();
  return {
    calls,
    statuses,
    fetch: (url) => {
      calls.push(url);
      return Promise.resolve({ status: statuses.get(url) ?? 404 });
    },
  };
}

/** A memory store that can be told to fail its reads. */
interface FlakyStore {
  readonly store: SecureStore;
  failReads: boolean;
}

function createFlakyStore(): FlakyStore {
  const inner = createMemoryStore();
  const flaky: FlakyStore = {
    failReads: false,
    store: {
      get: (key) => (flaky.failReads ? Promise.reject(new Error("keystore")) : inner.get(key)),
      set: (key, value) => inner.set(key, value),
      delete: (key) => inner.delete(key),
    },
  };
  return flaky;
}

interface Rig {
  readonly h: Harness;
  readonly flaky: FlakyStore;
  readonly repository: DesktopRepository;
  readonly registry: SessionRegistry;
  readonly fetch: FakeFetch;
  readonly controller: DesktopsController;
}

function rig(h: Harness = createHarness()): Rig {
  const flaky = createFlakyStore();
  const repository = createDesktopRepository(flaky.store);
  const registry = createSessionRegistry({
    device: h.device,
    appVersion: "0.0.1",
    openSocket: h.network.openSocket,
    clock: h.time.clock,
    scheduler: h.time.scheduler,
    repository,
  });
  const fetch = createFakeFetch();
  const controller = createDesktopsController({
    repository,
    registry,
    fetch: fetch.fetch,
    clock: h.time.clock,
    scheduler: h.time.scheduler,
  });
  return { h, flaky, repository, registry, fetch, controller };
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

function presenceUrlOf(hostId: string): string {
  return `https://relay.example/v0/presence/${hostId}`;
}

function kindOf(r: Rig, id: string): string {
  const status = r.controller.store.getState().desktops.find((d) => d.id === id)?.lastStatus;
  return status === undefined ? "?" : `${status.kind}${status.errorCode === undefined ? "" : `:${status.errorCode}`}`;
}

async function storedKindOf(r: Rig, id: string): Promise<string> {
  const status = (await r.repository.list()).find((d) => d.id === id)?.lastStatus;
  return status === undefined ? "?" : `${status.kind}${status.errorCode === undefined ? "" : `:${status.errorCode}`}`;
}

describe("desktops controller: the list", () => {
  it("loads the stored desktops", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host, "Home");
    expect(r.controller.store.getState()).toMatchObject({ loaded: false, desktops: [] });

    const loading = r.controller.load();
    expect(r.controller.store.getState().loading).toBe(true);
    await loading;

    const state = r.controller.store.getState();
    expect(state).toMatchObject({ loading: false, loaded: true, loadError: false });
    expect(state.desktops.map((d) => d.name)).toEqual(["Home"]);
    expect(state.desktops[0]?.id).toBe(desktop.id);
  });

  it("keeps everything when the secure store cannot be read, and recovers on retry", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host, "Home");
    await r.controller.load();

    r.flaky.failReads = true;
    await r.controller.reload();
    expect(r.controller.store.getState()).toMatchObject({ loading: false, loadError: true });
    expect(r.controller.store.getState().desktops.map((d) => d.id)).toEqual([desktop.id]);

    r.flaky.failReads = false;
    expect((await r.repository.list()).map((d) => d.id)).toEqual([desktop.id]);
    await r.controller.reload();
    expect(r.controller.store.getState()).toMatchObject({ loadError: false });
    expect(r.controller.store.getState().desktops.map((d) => d.id)).toEqual([desktop.id]);
  });

  it("marks the first read as failed without inventing a list", async () => {
    const r = rig();
    await addDesktop(r, r.h.host);
    r.flaky.failReads = true;
    await r.controller.load();
    expect(r.controller.store.getState()).toMatchObject({ loaded: true, loadError: true, desktops: [] });
  });

  it("renames only locally, and refuses an invalid name", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host, "Home");
    await r.controller.load();

    expect(await r.controller.rename(desktop.id, "  Office  ")).toMatchObject({ ok: true });
    expect(r.controller.store.getState().desktops[0]?.name).toBe("Office");
    expect((await r.repository.list())[0]?.name).toBe("Office");

    expect(await r.controller.rename(desktop.id, "   ")).toEqual({ ok: false, reason: "invalid-name" });
    expect(r.controller.store.getState().desktops[0]?.name).toBe("Office");
    expect(r.h.network.sockets).toHaveLength(0);
  });

  it("reports a rename the secure store could not keep", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host, "Home");
    await r.controller.load();
    r.flaky.failReads = true;
    expect(await r.controller.rename(desktop.id, "Office")).toEqual({ ok: false, reason: "storage" });
    expect(r.controller.store.getState().desktops[0]?.name).toBe("Home");
  });

  it("removes a desktop, closing its open session", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    await r.controller.load();
    const session = r.controller.open(desktop.id);
    r.h.network.last().open();
    expect(session?.getState().connection.state).toBe("ready");

    expect(await r.controller.remove(desktop.id)).toBe(true);
    expect(r.registry.get(desktop.id)).toBeUndefined();
    expect(session?.getState().connection.state).toBe("closed");
    expect(r.controller.store.getState().desktops).toEqual([]);
    expect(r.controller.store.getState().connecting).toEqual({});
    expect(await r.repository.list()).toEqual([]);
  });
});

describe("desktops controller: presence", () => {
  it("polls only while visible: on show, every 30 s and on refresh", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    r.fetch.statuses.set(presenceUrlOf(r.h.host.hostId), 204);
    await r.controller.load();

    r.h.time.advance(60_000);
    await flush();
    expect(r.fetch.calls).toHaveLength(0);
    await r.controller.refresh();
    expect(r.fetch.calls).toHaveLength(0);

    r.controller.setVisible(true);
    r.h.time.advance(0);
    await flush();
    expect(r.fetch.calls).toEqual([presenceUrlOf(r.h.host.hostId)]);
    expect(r.controller.store.getState().presence[desktop.id]).toBe("online");
    expect(rowStatus(r.controller.store.getState(), desktop.id)).toEqual({ kind: "online" });

    r.h.time.advance(29_999);
    await flush();
    expect(r.fetch.calls).toHaveLength(1);
    r.h.time.advance(1);
    await flush();
    expect(r.fetch.calls).toHaveLength(2);

    const refreshing = r.controller.refresh();
    expect(r.controller.store.getState().refreshing).toBe(true);
    await refreshing;
    expect(r.controller.store.getState().refreshing).toBe(false);
    expect(r.fetch.calls).toHaveLength(3);

    r.controller.setVisible(false);
    r.h.time.advance(120_000);
    await flush();
    await r.controller.refresh();
    expect(r.fetch.calls).toHaveLength(3);
    expect(r.h.time.pending()).toBe(0);
  });

  it("queries once the list is read when it was shown before", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    r.controller.setVisible(true);
    await r.controller.load();
    await flush();
    expect(r.fetch.calls).toEqual([presenceUrlOf(r.h.host.hostId)]);
    expect(r.controller.store.getState().presence[desktop.id]).toBe("offline");
    expect(rowStatus(r.controller.store.getState(), desktop.id)).toEqual({ kind: "offline", errorCode: null });
  });

  it("keeps the last value while a round runs", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    const url = presenceUrlOf(r.h.host.hostId);
    r.fetch.statuses.set(url, 204);
    await r.controller.load();
    r.controller.setVisible(true);
    r.h.time.advance(0);
    await flush();
    expect(r.controller.store.getState().presence[desktop.id]).toBe("online");

    const seen: (string | undefined)[] = [];
    const stop = r.controller.store.subscribe((state) => {
      seen.push(state.presence[desktop.id]);
    });
    r.fetch.statuses.set(url, 404);
    await r.controller.refresh();
    stop();
    expect(seen.filter((value) => value !== "online" && value !== "offline")).toEqual([]);
    expect(r.controller.store.getState().presence[desktop.id]).toBe("offline");
  });
});

describe("desktops controller: opening", () => {
  it("opens through the registry and follows the attempt until connected", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    await r.controller.load();

    const session = r.controller.open(desktop.id);
    expect(session).toBe(r.registry.get(desktop.id));
    expect(r.controller.store.getState().connecting[desktop.id]).toBe(true);
    expect(kindOf(r, desktop.id)).toBe("connecting");
    expect(rowStatus(r.controller.store.getState(), desktop.id)).toEqual({ kind: "connecting" });

    r.h.network.last().open();
    expect(session?.getState().connection.state).toBe("ready");
    expect(r.controller.store.getState().connecting[desktop.id]).toBeUndefined();
    expect(kindOf(r, desktop.id)).toBe("connected");
    await flush();
    expect(await storedKindOf(r, desktop.id)).toBe("connected");

    expect(r.controller.open(desktop.id)).toBe(session);
    expect(r.h.network.sockets).toHaveLength(1);
  });

  it("marks host-unavailable as offline, and tapping again retries", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    await r.controller.load();
    const host = r.h.host;
    host.detach();

    const session = r.controller.open(desktop.id);
    r.h.network.last().open();
    expect(session?.getState().connection).toMatchObject({ state: "closed", end: { reason: "offline" } });
    expect(kindOf(r, desktop.id)).toBe("offline");
    expect(r.controller.store.getState().connecting[desktop.id]).toBeUndefined();
    expect(rowStatus(r.controller.store.getState(), desktop.id)).toEqual({ kind: "offline", errorCode: null });
    await flush();
    expect(await storedKindOf(r, desktop.id)).toBe("offline");

    expect(r.controller.open(desktop.id)).toBe(session);
    expect(r.h.network.sockets).toHaveLength(2);
    expect(r.controller.store.getState().connecting[desktop.id]).toBe(true);
  });

  it("marks not-paired, and does not open it again", async () => {
    const r = rig(createHarness({ paired: false }));
    const desktop = await addDesktop(r, r.h.host);
    await r.controller.load();

    r.controller.open(desktop.id);
    r.h.network.last().open();
    expect(kindOf(r, desktop.id)).toBe("not-paired");
    expect(rowStatus(r.controller.store.getState(), desktop.id)).toEqual({ kind: "not-paired" });
    await flush();
    expect(await storedKindOf(r, desktop.id)).toBe("not-paired");

    expect(r.controller.open(desktop.id)).toBeUndefined();
    expect(r.h.network.sockets).toHaveLength(1);
  });

  it("marks goodbye { revoked } as not-paired", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    await r.controller.load();
    r.controller.open(desktop.id);
    r.h.network.last().open();
    r.h.host.broadcast({ type: "goodbye", reason: 2 });
    expect(kindOf(r, desktop.id)).toBe("not-paired");
  });

  it("marks an unreachable relay as an error with its code", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    await r.controller.load();
    r.controller.open(desktop.id);
    r.h.network.last().drop(1006);
    expect(kindOf(r, desktop.id)).toBe("error:unreachable:closed:1006");
    expect(rowStatus(r.controller.store.getState(), desktop.id)).toEqual({
      kind: "error",
      errorCode: "unreachable:closed:1006",
    });
  });

  it("does not open an unknown id", async () => {
    const r = rig();
    await r.controller.load();
    expect(r.controller.open("f".repeat(32))).toBeUndefined();
  });

  it("follows a store opened elsewhere once the list is read, and keeps its status over a later read", async () => {
    const h = createHarness();
    const r = rig(h);
    const other = createFakeHost({
      relay: h.relay,
      now: h.time.clock.now,
      hostKey: testKeypair(3),
      hostId: deriveHostId(new Uint8Array(32).fill(9)),
      pairedDevices: [h.device.publicKey],
    });
    const first = await addDesktop(r, h.host, "One");
    const second = await addDesktop(r, other, "Two");
    r.registry.open(second);

    await r.controller.load();
    expect(r.controller.store.getState().connecting[second.id]).toBe(true);
    h.network.last().open();
    expect(kindOf(r, second.id)).toBe("connected");
    expect(kindOf(r, first.id)).toBe("connected");

    await r.controller.reload();
    expect(kindOf(r, second.id)).toBe("connected");
  });

  it("stops polling and following stores on dispose", async () => {
    const r = rig();
    const desktop = await addDesktop(r, r.h.host);
    await r.controller.load();
    r.controller.setVisible(true);
    const session = r.controller.open(desktop.id);
    r.controller.dispose();
    r.h.network.last().open();
    expect(session?.getState().connection.state).toBe("ready");
    expect(r.controller.store.getState().connecting[desktop.id]).toBe(true);
    r.registry.closeAll();
    expect(r.h.time.pending()).toBe(0);
  });
});
