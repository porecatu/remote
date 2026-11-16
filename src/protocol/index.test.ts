// SPDX-License-Identifier: GPL-3.0-or-later

import {
  PROTOCOL_VERSION,
  decodeMessage,
  encodeMessage,
  hostId,
  parsePairingUri,
} from "./index";

describe("@porecatu/protocol in the app", () => {
  it("loads the ESM package under jest-expo", () => {
    expect(PROTOCOL_VERSION).toEqual([0, 1]);
  });

  it("round-trips a message", () => {
    const bytes = encodeMessage({ type: "bell", pane: 7 });
    const decoded = decodeMessage(bytes, "host");
    expect(decoded.ok).toBe(true);
  });

  it("parses the reference pairing URI", () => {
    const keyA = Uint8Array.from({ length: 32 }, (_, i) => i);
    expect(hostId(keyA)).toBe("awbfmb6x7xznqlxuypemflvjmgwzrvqo");
    const result = parsePairingUri("porecatu://pair?v=1");
    expect(result.ok).toBe(false);
  });
});
