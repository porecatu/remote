// SPDX-License-Identifier: GPL-3.0-or-later
import { logEvent } from "../log";
import {
  base64UrlDecode,
  base64UrlEncode,
  fingerprint,
  formatFingerprint,
  generateStaticKeypair,
  publicKeyFromPrivate,
  zeroize,
  type RandomSource,
  type StaticKeypair,
} from "@/protocol";
import type { DesktopRepository } from "./desktopList";
import type { SecureStore } from "./secureStore";

// The device identity: the X25519 static key pair of this phone (PRD-001
// RF-1.1 to RF-1.3, ADR-0003). Only the private key is stored, in item
// `device.static_key` of the secure store, as 43 characters of base64url; the
// public key is derived from it on every load, so the two can never disagree.
// The key never leaves the device and is never logged or shown.
//
// A read that fails (the keystore is locked or unavailable) is an error that
// reaches the caller, never a reason to create a new key: only an item that is
// missing or does not hold a valid key is replaced.

export const DEVICE_KEY_ITEM = "device.static_key";

const PRIVATE_KEY_LENGTH = 32;

export type StoredKey =
  | { readonly status: "ok"; readonly keypair: StaticKeypair }
  | { readonly status: "missing" }
  /** The item exists but does not hold a usable key. */
  | { readonly status: "corrupt"; readonly reason: "encoding" | "length" | "zero" };

/** Parses the stored text of `device.static_key`. Pure. */
export function parseStoredKey(text: string | null): StoredKey {
  if (text === null) {
    return { status: "missing" };
  }
  const privateKey = base64UrlDecode(text);
  if (privateKey === null) {
    return { status: "corrupt", reason: "encoding" };
  }
  if (privateKey.length !== PRIVATE_KEY_LENGTH) {
    zeroize(privateKey);
    return { status: "corrupt", reason: "length" };
  }
  // A key of all zeros is what a wiped or truncated buffer looks like.
  if (privateKey.every((byte) => byte === 0)) {
    return { status: "corrupt", reason: "zero" };
  }
  return { status: "ok", keypair: { privateKey, publicKey: publicKeyFromPrivate(privateKey) } };
}

/** A copy a caller may hand to (or let be wiped by) the handshake without touching ours. */
export function copyKeypair(keypair: StaticKeypair): StaticKeypair {
  return { publicKey: keypair.publicKey.slice(), privateKey: keypair.privateKey.slice() };
}

/** Hands out a copy and wipes the original: the module keeps no key in memory. */
function handOut(keypair: StaticKeypair): StaticKeypair {
  const copy = copyKeypair(keypair);
  zeroize(keypair.privateKey);
  return copy;
}

/** `"ABCD EFGH IJKL MNOP"`: what the desktop shows next to the device name (spec 02 §1). */
export function deviceFingerprint(keypair: StaticKeypair): string {
  return formatFingerprint(fingerprint(keypair.publicKey));
}

/** Where the key came from: found as it was, created for the first time, or replacing a corrupt item. */
export type IdentityOrigin = "existing" | "created" | "replaced-corrupt";

export interface EnsuredIdentity {
  /** A fresh copy on every call. */
  readonly keypair: StaticKeypair;
  readonly origin: IdentityOrigin;
}

export interface DeviceIdentityRepository {
  /** Reads the stored key without creating anything (detects missing and corrupt). */
  inspect(): Promise<StoredKey>;
  /**
   * The key of this device, created on the first execution (RF-1.1). A corrupt
   * item is replaced and reported as `replaced-corrupt`: the pairings that
   * depended on the old key no longer work and the desktops answer `not-paired`
   * (RF-1.16 offers to pair again), so they are left for the user to remove.
   */
  ensure(): Promise<EnsuredIdentity>;
  /**
   * Recreates the identity (RF-1.3): writes a new key, then forgets every
   * desktop. The key goes first so a failure to write it loses nothing.
   */
  recreate(): Promise<StaticKeypair>;
}

export interface DeviceIdentityDeps {
  readonly log?: typeof logEvent;
  readonly random?: RandomSource;
}

export function createDeviceIdentityRepository(
  store: SecureStore,
  desktops: Pick<DesktopRepository, "clear">,
  deps: DeviceIdentityDeps = {},
): DeviceIdentityRepository {
  const log = deps.log ?? logEvent;
  let tail: Promise<unknown> = Promise.resolve();

  // One read-modify-write at a time: two concurrent first executions must not
  // each create a key and leave the loser's public key shown to the user.
  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  }

  const read = async (): Promise<StoredKey> => parseStoredKey(await store.get(DEVICE_KEY_ITEM));

  const generate = async (): Promise<StaticKeypair> => {
    const keypair =
      deps.random === undefined ? generateStaticKeypair() : generateStaticKeypair(deps.random);
    await store.set(DEVICE_KEY_ITEM, base64UrlEncode(keypair.privateKey));
    return keypair;
  };

  return {
    inspect: () =>
      exclusive(async () => {
        const stored = await read();
        return stored.status === "ok" ? { status: "ok", keypair: handOut(stored.keypair) } : stored;
      }),
    ensure: () =>
      exclusive(async () => {
        const stored = await read();
        if (stored.status === "ok") {
          return { keypair: handOut(stored.keypair), origin: "existing" as const };
        }
        if (stored.status === "corrupt") {
          log("storage_invalid", { item: DEVICE_KEY_ITEM, reason: stored.reason });
        }
        const keypair = await generate();
        return {
          keypair: handOut(keypair),
          origin: stored.status === "corrupt" ? ("replaced-corrupt" as const) : ("created" as const),
        };
      }),
    recreate: () =>
      exclusive(async () => {
        const keypair = await generate();
        await desktops.clear();
        return handOut(keypair);
      }),
  };
}
