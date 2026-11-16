// SPDX-License-Identifier: GPL-3.0-or-later
import {
  type CloseInfo,
  type CloseReason,
  MAX_FRAME_BYTES,
  type RelaySocket,
  type WebSocketLike,
  clientUrl,
  closeReasonFromCode,
  openRelaySocket,
} from "./relaySocket";

const HOST = "abcdefghijklmnopqrstuvwxyz234567";

class FakeSocket implements WebSocketLike {
  static last: FakeSocket | null = null;
  static created = 0;
  binaryType = "blob";
  readyState = 0;
  sent: unknown[] = [];
  closedWith: number[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; wasClean?: boolean }) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.last = this;
    FakeSocket.created += 1;
  }

  send(data: ArrayBuffer | ArrayBufferView): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closedWith.push(code ?? 1005);
  }

  // Test helpers: what the network does.
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(data: unknown): void {
    this.onmessage?.({ data });
  }
  serverClose(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function setup() {
  const frames: Uint8Array[] = [];
  const closes: CloseInfo[] = [];
  let opens = 0;
  const socket = openRelaySocket(
    `wss://relay.example.com/v0/client/${HOST}`,
    {
      onOpen: () => {
        opens += 1;
      },
      onFrame: (frame) => frames.push(frame),
      onClose: (info) => closes.push(info),
    },
    FakeSocket,
  );
  const fake = FakeSocket.last;
  if (socket === null || fake === null) {
    throw new Error("socket not opened");
  }
  return { socket: socket as RelaySocket, fake, frames, closes, opens: () => opens };
}

beforeEach(() => {
  FakeSocket.last = null;
  FakeSocket.created = 0;
});

describe("closeReasonFromCode", () => {
  it("maps the codes of spec 01 §5", () => {
    const expected: [number, CloseReason][] = [
      [1000, "normal"],
      [1001, "going-away"],
      [1003, "unsupported-data"],
      [1009, "message-too-big"],
      [4001, "registration-refused"],
      [4002, "replaced"],
      [4003, "limit-exceeded"],
      [4004, "invalid-envelope"],
      [4005, "registration-timeout"],
      [1006, "unknown"],
      [1008, "unknown"],
      [1011, "unknown"],
      [4999, "unknown"],
    ];
    for (const [code, reason] of expected) {
      expect(closeReasonFromCode(code)).toBe(reason);
    }
  });
});

describe("clientUrl", () => {
  it("builds /v0/client/<host_id> under the base", () => {
    expect(clientUrl("wss://relay.example.com/r/", HOST)).toBe(
      `wss://relay.example.com/r/v0/client/${HOST}`,
    );
    expect(clientUrl("ws://localhost:9000", HOST)).toBe(`ws://localhost:9000/v0/client/${HOST}`);
  });

  it("refuses insecure remote relays and bad ids", () => {
    expect(clientUrl("ws://relay.example.com", HOST)).toBeNull();
    expect(clientUrl("wss://relay.example.com", "nope")).toBeNull();
  });
});

describe("openRelaySocket", () => {
  it("asks for binary frames as ArrayBuffer", () => {
    const { fake } = setup();
    expect(fake.binaryType).toBe("arraybuffer");
  });

  it("does not open anything for ws:// to a remote host", () => {
    const socket = openRelaySocket(
      `ws://relay.example.com/v0/client/${HOST}`,
      { onOpen: () => undefined, onFrame: () => undefined, onClose: () => undefined },
      FakeSocket,
    );
    expect(socket).toBeNull();
    expect(FakeSocket.created).toBe(0);
  });

  it("reports open and delivers one frame per message", () => {
    const { fake, frames, opens } = setup();
    fake.open();
    expect(opens()).toBe(1);
    fake.receive(new Uint8Array([1, 2, 3]).buffer);
    fake.receive(new Uint8Array([9]));
    expect(frames.map((f) => Array.from(f))).toEqual([[1, 2, 3], [9]]);
  });

  it("respects the offset of a view", () => {
    const { fake, frames } = setup();
    fake.open();
    const backing = new Uint8Array([0, 0, 7, 8, 0]);
    fake.receive(new Uint8Array(backing.buffer, 2, 2));
    expect(Array.from(frames[0] ?? [])).toEqual([7, 8]);
  });

  it("refuses a text frame: closes with 1003 and reports it once", () => {
    const { fake, frames, closes } = setup();
    fake.open();
    fake.receive("hello");
    expect(frames).toEqual([]);
    expect(fake.closedWith).toEqual([1003]);
    fake.serverClose(1003);
    expect(closes).toEqual([{ code: 1003, reason: "unsupported-data", local: true }]);
  });

  it("ignores frames that arrive after refusing one", () => {
    const { fake, frames } = setup();
    fake.open();
    fake.receive("x");
    fake.receive(new Uint8Array([1]).buffer);
    expect(frames).toEqual([]);
  });

  it("closes with 1009 on an incoming frame over the limit", () => {
    const { fake, frames, closes } = setup();
    fake.open();
    fake.receive(new Uint8Array(MAX_FRAME_BYTES + 1).buffer);
    expect(frames).toEqual([]);
    expect(fake.closedWith).toEqual([1009]);
    fake.serverClose(1009);
    expect(closes[0]?.reason).toBe("message-too-big");
  });

  it("accepts a frame at exactly the limit", () => {
    const { fake, frames } = setup();
    fake.open();
    fake.receive(new Uint8Array(MAX_FRAME_BYTES).buffer);
    expect(frames).toHaveLength(1);
  });

  it("sends binary frames only while open", () => {
    const { socket, fake } = setup();
    const frame = new Uint8Array([4, 5]);
    expect(socket.send(frame)).toBe(false);
    fake.open();
    expect(socket.send(frame)).toBe(true);
    expect(fake.sent).toEqual([frame]);
  });

  it("throws on an outgoing frame over the limit", () => {
    const { socket, fake } = setup();
    fake.open();
    expect(() => socket.send(new Uint8Array(MAX_FRAME_BYTES + 1))).toThrow(RangeError);
    expect(fake.sent).toEqual([]);
  });

  it("maps a server close to a typed, non-local reason", () => {
    const { fake, closes } = setup();
    fake.open();
    fake.serverClose(4003);
    expect(closes).toEqual([{ code: 4003, reason: "limit-exceeded", local: false }]);
  });

  it("reports a drop without close frame as unknown", () => {
    const { fake, closes } = setup();
    fake.serverClose(1006);
    expect(closes).toEqual([{ code: 1006, reason: "unknown", local: false }]);
  });

  it("closes cleanly on request and reports it as local", () => {
    const { socket, fake, closes } = setup();
    fake.open();
    socket.close();
    expect(fake.closedWith).toEqual([1000]);
    expect(socket.send(new Uint8Array([1]))).toBe(false);
    fake.serverClose(1000);
    expect(closes).toEqual([{ code: 1000, reason: "normal", local: true }]);
  });

  it("calls onClose only once", () => {
    const { fake, closes } = setup();
    fake.serverClose(1001);
    fake.onclose?.({ code: 1001 });
    expect(closes).toHaveLength(1);
  });

  it("does not treat an error event as the end", () => {
    const { fake, closes } = setup();
    fake.onerror?.({});
    expect(closes).toEqual([]);
    fake.serverClose(1006);
    expect(closes).toHaveLength(1);
  });
});
