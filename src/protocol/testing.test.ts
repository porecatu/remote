// SPDX-License-Identifier: GPL-3.0-or-later

import { createFakeHost, createMemoryRelay, testKeypair } from "./testing";

describe("protocol testing entry", () => {
  it("re-exports the package's test doubles", () => {
    expect(typeof createMemoryRelay).toBe("function");
    expect(typeof createFakeHost).toBe("function");
    expect(typeof testKeypair).toBe("function");
  });
});
