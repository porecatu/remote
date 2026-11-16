// SPDX-License-Identifier: GPL-3.0-or-later

type MutableGlobal = { crypto?: unknown };

const mockGetRandomValues = jest.fn(<T extends ArrayBufferView>(array: T): T => {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = (i * 31 + 7) % 251;
  }
  return array;
});

jest.mock("expo-crypto", () => ({
  getRandomValues: (array: ArrayBufferView) => mockGetRandomValues(array),
}));

function loadModule(): typeof import("../polyfills") {
  // A fresh module registry makes the module run its install step again.
  jest.resetModules();
  return jest.requireActual<typeof import("../polyfills")>("../polyfills");
}

describe("polyfills", () => {
  const g = globalThis as MutableGlobal;
  let original: unknown;

  beforeEach(() => {
    original = g.crypto;
    mockGetRandomValues.mockClear();
  });

  afterEach(() => {
    if (original === undefined) {
      delete g.crypto;
    } else {
      g.crypto = original;
    }
  });

  it("installs getRandomValues from expo-crypto when absent", () => {
    delete g.crypto;
    const { assertSecureRandom } = loadModule();
    const installed = g.crypto as { getRandomValues?: unknown } | undefined;
    expect(typeof installed?.getRandomValues).toBe("function");
    expect(() => assertSecureRandom()).not.toThrow();
    expect(mockGetRandomValues).toHaveBeenCalledTimes(1);
  });

  it("keeps an existing getRandomValues untouched", () => {
    const existing = jest.fn((array: ArrayBufferView) => {
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(9);
      return array;
    });
    g.crypto = { getRandomValues: existing };
    const { assertSecureRandom } = loadModule();
    expect((g.crypto as { getRandomValues: unknown }).getRandomValues).toBe(existing);
    expect(() => assertSecureRandom()).not.toThrow();
    expect(existing).toHaveBeenCalledTimes(1);
    expect(mockGetRandomValues).not.toHaveBeenCalled();
  });

  it("throws when the source is missing", () => {
    const { assertSecureRandom } = loadModule();
    delete g.crypto;
    expect(() => assertSecureRandom()).toThrow("no secure random source");
  });

  it("throws when the source returns only zeros", () => {
    const { assertSecureRandom } = loadModule();
    g.crypto = { getRandomValues: (array: ArrayBufferView) => array };
    expect(() => assertSecureRandom()).toThrow("secure random source returned zeros");
  });
});
