// SPDX-License-Identifier: GPL-3.0-or-later

import {
  base64UrlDecode,
  base64UrlEncode,
  fingerprint,
  formatFingerprint,
  publicKeyFromPrivate,
} from "@/protocol";
import { testKeypair } from "@/protocol/testing";
import { createDesktopRepository } from "./desktopList";
import {
  DEVICE_KEY_ITEM,
  createDeviceIdentityRepository,
  deviceFingerprint,
  parseStoredKey,
} from "./deviceIdentity";
import { createMemoryStore, type SecureStore } from "./secureStore";

function sequenceRandom(): (n: number) => Uint8Array {
  let counter = 1;
  return (n) => {
    const out = new Uint8Array(n);
    out.fill(counter);
    counter += 1;
    return out;
  };
}

function setup(initial?: string) {
  const store = createMemoryStore(initial === undefined ? {} : { "device.static_key": initial });
  const desktops = createDesktopRepository(store);
  const log = jest.fn();
  const identity = createDeviceIdentityRepository(store, desktops, { log, random: sequenceRandom() });
  return { store, desktops, identity, log };
}

describe("parseStoredKey", () => {
  it("reads a base64url private key and derives the public one", () => {
    const pair = testKeypair(5);
    const parsed = parseStoredKey(base64UrlEncode(pair.privateKey));
    expect(parsed.status).toBe("ok");
    if (parsed.status === "ok") {
      expect(parsed.keypair.privateKey).toEqual(pair.privateKey);
      expect(parsed.keypair.publicKey).toEqual(publicKeyFromPrivate(pair.privateKey));
    }
  });

  it("reports a missing item", () => {
    expect(parseStoredKey(null)).toEqual({ status: "missing" });
  });

  it.each([
    ["not base64url", "!!!not-a-key!!!", "encoding"],
    ["padded base64", `${base64UrlEncode(new Uint8Array(32).fill(1))}=`, "encoding"],
    ["empty", "", "length"],
    ["too short", base64UrlEncode(new Uint8Array(16).fill(1)), "length"],
    ["too long", base64UrlEncode(new Uint8Array(33).fill(1)), "length"],
    ["all zeros", base64UrlEncode(new Uint8Array(32)), "zero"],
  ] as const)("detects a corrupt item: %s", (_label, text, reason) => {
    expect(parseStoredKey(text)).toEqual({ status: "corrupt", reason });
  });
});

describe("device identity repository", () => {
  it("creates the key on the first execution and stores the private half as base64url", async () => {
    const { store, identity, log } = setup();
    const ensured = await identity.ensure();
    expect(ensured.origin).toBe("created");
    const stored = await store.get(DEVICE_KEY_ITEM);
    expect(stored).not.toBeNull();
    expect(stored).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(base64UrlDecode(stored ?? "")).toEqual(ensured.keypair.privateKey);
    expect(ensured.keypair.publicKey).toEqual(publicKeyFromPrivate(ensured.keypair.privateKey));
    expect(log).not.toHaveBeenCalled();
  });

  it("loads the same key afterwards", async () => {
    const { identity } = setup();
    const first = await identity.ensure();
    const second = await identity.ensure();
    expect(second.origin).toBe("existing");
    expect(second.keypair).toEqual(first.keypair);
  });

  it("survives a restart: a new repository over the same store finds the key", async () => {
    const { store, desktops, identity } = setup();
    const first = await identity.ensure();
    const again = createDeviceIdentityRepository(store, desktops);
    const loaded = await again.ensure();
    expect(loaded.origin).toBe("existing");
    expect(loaded.keypair.publicKey).toEqual(first.keypair.publicKey);
  });

  it("hands out copies: wiping one does not touch the next", async () => {
    const { identity } = setup();
    const first = await identity.ensure();
    const expected = first.keypair.privateKey.slice();
    first.keypair.privateKey.fill(0);
    const second = await identity.ensure();
    expect(second.keypair.privateKey).toEqual(expected);
  });

  it("two concurrent first executions create one key", async () => {
    const { identity } = setup();
    const [a, b] = await Promise.all([identity.ensure(), identity.ensure()]);
    expect(a.keypair.publicKey).toEqual(b.keypair.publicKey);
    expect([a.origin, b.origin].sort()).toEqual(["created", "existing"]);
  });

  it("inspect reports missing, ok and corrupt without creating anything", async () => {
    const empty = setup();
    expect(await empty.identity.inspect()).toEqual({ status: "missing" });
    expect(await empty.store.get(DEVICE_KEY_ITEM)).toBeNull();

    const corrupt = setup("garbage!");
    expect(await corrupt.identity.inspect()).toEqual({ status: "corrupt", reason: "encoding" });
    expect(await corrupt.store.get(DEVICE_KEY_ITEM)).toBe("garbage!");

    const ok = setup(base64UrlEncode(testKeypair(2).privateKey));
    const inspected = await ok.identity.inspect();
    expect(inspected.status).toBe("ok");
  });

  it("replaces a corrupt key, logs the event without the content and keeps the desktops", async () => {
    const shortKey = base64UrlEncode(new Uint8Array(16).fill(9));
    const { store, desktops, identity, log } = setup(shortKey);
    await desktops.add({
      name: "Home",
      relayUrl: "wss://relay.example.com",
      hostId: "a".repeat(32),
      hostKeyB64: base64UrlEncode(testKeypair(3).publicKey),
      pairedAt: "2026-11-15T10:00:00Z",
    });
    const ensured = await identity.ensure();
    expect(ensured.origin).toBe("replaced-corrupt");
    expect(log).toHaveBeenCalledWith("storage_invalid", { item: "device.static_key", reason: "length" });
    expect(JSON.stringify(log.mock.calls)).not.toContain(shortKey);
    expect(await store.get(DEVICE_KEY_ITEM)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await desktops.list()).toHaveLength(1);
  });

  it("never replaces the key when the read itself fails", async () => {
    const real = createMemoryStore({ "device.static_key": base64UrlEncode(testKeypair(4).privateKey) });
    const set = jest.fn(real.set);
    const failing: SecureStore = {
      get: () => Promise.reject(new Error("keystore locked")),
      set,
      delete: real.delete,
    };
    const identity = createDeviceIdentityRepository(failing, createDesktopRepository(real));
    await expect(identity.ensure()).rejects.toThrow("keystore locked");
    await expect(identity.inspect()).rejects.toThrow("keystore locked");
    expect(set).not.toHaveBeenCalled();
  });

  it("recreate writes a new key and forgets every desktop (RF-1.3)", async () => {
    const { store, desktops, identity } = setup();
    const before = await identity.ensure();
    await desktops.add({
      name: "Home",
      relayUrl: "wss://relay.example.com",
      hostId: "a".repeat(32),
      hostKeyB64: base64UrlEncode(testKeypair(3).publicKey),
      pairedAt: "2026-11-15T10:00:00Z",
    });
    const after = await identity.recreate();
    expect(after.publicKey).not.toEqual(before.keypair.publicKey);
    expect(base64UrlDecode((await store.get(DEVICE_KEY_ITEM)) ?? "")).toEqual(after.privateKey);
    expect(await desktops.list()).toEqual([]);
    const next = await identity.ensure();
    expect(next.origin).toBe("existing");
    expect(next.keypair.publicKey).toEqual(after.publicKey);
  });

  it("recreate loses nothing when writing the key fails", async () => {
    const real = createMemoryStore();
    const failing: SecureStore = {
      get: real.get,
      set: () => Promise.reject(new Error("disk full")),
      delete: real.delete,
    };
    const desktops = createDesktopRepository(real);
    await desktops.add({
      name: "Home",
      relayUrl: "wss://relay.example.com",
      hostId: "a".repeat(32),
      hostKeyB64: base64UrlEncode(testKeypair(3).publicKey),
      pairedAt: "2026-11-15T10:00:00Z",
    });
    const identity = createDeviceIdentityRepository(failing, desktops);
    await expect(identity.recreate()).rejects.toThrow("disk full");
    expect(await desktops.list()).toHaveLength(1);
  });
});

describe("deviceFingerprint", () => {
  it("is the spec 02 §1 digest of the public key in four groups", () => {
    const pair = testKeypair(6);
    const text = deviceFingerprint(pair);
    expect(text).toBe(formatFingerprint(fingerprint(pair.publicKey)));
    expect(text).toMatch(/^[A-Z2-7]{4} [A-Z2-7]{4} [A-Z2-7]{4} [A-Z2-7]{4}$/);
  });
});
