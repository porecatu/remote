// SPDX-License-Identifier: GPL-3.0-or-later
import { MAX_FRAME, clientChannelUrl, isSecureRelayUrl, parseHostId } from "@/protocol";

// Adapter over the React Native WebSocket (protocol spec 01 §1 and §5): binary
// frames only, one envelope per frame, text frames refused with 1003 and the
// close codes mapped to typed reasons. It carries opaque bytes; envelope and
// Noise codecs live in the protocol package. The WebSocket constructor is
// injectable for tests. Nothing about the frames is ever logged.

/** Largest frame either side may send (spec 01 §1 and §6), from the protocol package. */
export const MAX_FRAME_BYTES = MAX_FRAME;

// The names are the suffixes of the `socket_close.*` catalog keys.
export type CloseReason =
  | "normal" // 1000
  | "going-away" // 1001: relay shutting down
  | "unsupported-data" // 1003: a text frame is a protocol violation
  | "message-too-big" // 1009
  | "registration-refused" // 4001
  | "replaced" // 4002
  | "limit-exceeded" // 4003
  | "invalid-envelope" // 4004
  | "registration-timeout" // 4005
  | "unknown"; // anything else, including 1005/1006 (dropped without a close frame)

export function closeReasonFromCode(code: number): CloseReason {
  switch (code) {
    case 1000:
      return "normal";
    case 1001:
      return "going-away";
    case 1003:
      return "unsupported-data";
    case 1009:
      return "message-too-big";
    case 4001:
      return "registration-refused";
    case 4002:
      return "replaced";
    case 4003:
      return "limit-exceeded";
    case 4004:
      return "invalid-envelope";
    case 4005:
      return "registration-timeout";
    default:
      return "unknown";
  }
}

/**
 * `<base>/v0/client/<host_id>` (spec 01 §2); null for an unacceptable URL or
 * id. The package function throws on malformed input and does not check the
 * security rule (`ws://` only to loopback); this guard turns both into a null.
 */
export function clientUrl(relayUrl: string, hostId: string): string | null {
  if (!isSecureRelayUrl(relayUrl) || parseHostId(hostId) === null) {
    return null;
  }
  return clientChannelUrl(relayUrl, hostId);
}

// The subset of the WebSocket API this adapter touches.
export interface WebSocketLike {
  binaryType: string;
  readonly readyState: number;
  send(data: ArrayBuffer | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; wasClean?: boolean }) => void) | null;
}

export type WebSocketConstructor = new (url: string) => WebSocketLike;

const OPEN = 1;

export interface CloseInfo {
  readonly code: number;
  readonly reason: CloseReason;
  /** True when this side closed the socket on purpose. */
  readonly local: boolean;
}

export interface RelaySocketHandlers {
  onOpen(): void;
  /** One binary frame, which is one envelope. */
  onFrame(frame: Uint8Array): void;
  /** Called once, whatever the cause. */
  onClose(info: CloseInfo): void;
}

export interface RelaySocket {
  /** False when the socket is not open. Throws RangeError past the frame limit. */
  send(frame: Uint8Array): boolean;
  /** Clean close (1000). */
  close(): void;
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === "[object ArrayBuffer]";
}

function toBytes(data: unknown): Uint8Array | null {
  if (isArrayBuffer(data)) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

/**
 * Opens the client channel. Returns null, without opening anything, when the
 * URL is not acceptable (`ws://` is only allowed to loopback).
 */
export function openRelaySocket(
  url: string,
  handlers: RelaySocketHandlers,
  WebSocketImpl: WebSocketConstructor = globalThis.WebSocket as unknown as WebSocketConstructor,
): RelaySocket | null {
  if (!isAcceptableSocketUrl(url)) {
    return null;
  }
  const socket = new WebSocketImpl(url);
  socket.binaryType = "arraybuffer";

  let localReason: CloseReason | null = null;
  let localCode = 1000;
  let closed = false;

  const closeLocally = (code: number, reason: CloseReason): void => {
    if (localReason !== null) {
      return;
    }
    localReason = reason;
    localCode = code;
    socket.close(code);
  };

  const finish = (code: number): void => {
    if (closed) {
      return;
    }
    closed = true;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (localReason !== null) {
      handlers.onClose({ code: localCode, reason: localReason, local: true });
    } else {
      handlers.onClose({ code, reason: closeReasonFromCode(code), local: false });
    }
  };

  socket.onopen = () => {
    handlers.onOpen();
  };
  socket.onmessage = (event) => {
    if (localReason !== null) {
      return;
    }
    const bytes = toBytes(event.data);
    if (bytes === null) {
      closeLocally(1003, "unsupported-data");
      return;
    }
    if (bytes.byteLength > MAX_FRAME_BYTES) {
      closeLocally(1009, "message-too-big");
      return;
    }
    handlers.onFrame(bytes);
  };
  // The close event always follows an error; the code is reported there.
  socket.onerror = () => undefined;
  socket.onclose = (event) => {
    finish(event.code);
  };

  return {
    send(frame: Uint8Array): boolean {
      if (frame.byteLength > MAX_FRAME_BYTES) {
        throw new RangeError("frame larger than the relay limit");
      }
      if (socket.readyState !== OPEN || localReason !== null) {
        return false;
      }
      socket.send(frame);
      return true;
    },
    close(): void {
      closeLocally(1000, "normal");
    },
  };
}

// Same rule as the base URL, applied to a full client URL: wss://, or ws://
// only to loopback.
function isAcceptableSocketUrl(url: string): boolean {
  return isSecureRelayUrl(url.replace(/\/v0\/client\/[^/?#]*$/, ""));
}
