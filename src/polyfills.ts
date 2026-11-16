// SPDX-License-Identifier: GPL-3.0-or-later
import { getRandomValues } from "expo-crypto";

// Must be the first import of the entry point, before anything from the
// protocol package: the Noise handshake draws its keys and nonces from
// globalThis.crypto.getRandomValues, and Hermes does not provide it.

type Crypto = { getRandomValues: typeof getRandomValues };

function install(): void {
  const g = globalThis as { crypto?: Partial<Crypto> };
  if (g.crypto === undefined) {
    g.crypto = {};
  }
  if (typeof g.crypto.getRandomValues !== "function") {
    g.crypto.getRandomValues = getRandomValues;
  }
}

install();

/** Throws when no secure random source is available. Call once at startup. */
export function assertSecureRandom(): void {
  const source = (globalThis as { crypto?: Partial<Crypto> }).crypto;
  if (source === undefined || typeof source.getRandomValues !== "function") {
    throw new Error("no secure random source");
  }
  const probe = new Uint8Array(16);
  source.getRandomValues(probe);
  // An all-zero 16-byte draw has probability 2^-128: it means a broken source.
  if (probe.every((byte) => byte === 0)) {
    throw new Error("secure random source returned zeros");
  }
}
