// SPDX-License-Identifier: GPL-3.0-or-later

/// <reference types="node" />

/**
 * The relay's network face for the fake host: a local HTTP/WebSocket server
 * that puts real sockets in front of a `MemoryRelay` (spec 01 §2). It serves
 * `GET /v0/presence/<host_id>` (204 or 404) and the client WebSocket
 * `/v0/client/<host_id>`, binary frames only, one envelope per frame. After a
 * `closed { reason }` it closes the socket with the matching code, and after
 * `host-unavailable` with 1000, as a real relay does.
 *
 * It listens on loopback only: the app accepts `ws://` for loopback hosts and
 * nothing else (spec 01 §1). Nothing about a frame is ever logged.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import {
  CLOSE_CODE,
  MAX_FRAME,
  clientCloseCode,
  decodeClientEnvelope,
  parseHostId,
} from "../../src/protocol/index.ts";
import type { MemoryRelay } from "../../src/protocol/testing.ts";

export interface BridgeOptions {
  readonly relay: MemoryRelay;
  readonly port: number;
  /** Receives events only ("client connected"), never content. */
  readonly onEvent?: (event: string) => void;
}

export interface Bridge {
  /** The port actually bound (useful with `port: 0`). */
  readonly port: number;
  close(): Promise<void>;
}

/** The path segments of `/v0/<kind>/<host_id>`, or null. */
function route(url: string | undefined): { kind: string; hostId: string } | null {
  const path = (url ?? "").split("?")[0] ?? "";
  const match = /^\/v0\/(client|presence)\/([^/]+)$/.exec(path);
  const hostId = match?.[2] === undefined ? null : parseHostId(match[2]);
  return match?.[1] === undefined || hostId === null ? null : { kind: match[1], hostId };
}

function toBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (Array.isArray(data) && data.every((part) => part instanceof Uint8Array)) {
    return new Uint8Array(Buffer.concat(data as Uint8Array[]));
  }
  return null;
}

export function startBridge(options: BridgeOptions): Promise<Bridge> {
  const { relay } = options;
  const emit = options.onEvent ?? (() => undefined);
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });

  const server: Server = createServer((request, response) => {
    const target = route(request.url);
    if (request.method === "GET" && target?.kind === "presence") {
      response.writeHead(relay.hasHost(target.hostId) ? 204 : 404).end();
      return;
    }
    response.writeHead(404).end();
  });

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const target = route(request.url);
    if (target?.kind !== "client") {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    sockets.handleUpgrade(request, socket, head, (connection) => {
      emit("client connected");
      const link = relay.connectClient(target.hostId, (frame) => {
        if (connection.readyState !== WebSocket.OPEN) {
          return;
        }
        connection.send(frame, { binary: true });
        const envelope = decodeClientEnvelope(frame);
        if (envelope.type === "closed") {
          connection.close(clientCloseCode(envelope.reason));
        } else if (envelope.type === "host-unavailable") {
          connection.close(CLOSE_CODE.normal);
        }
      });
      connection.on("message", (data, isBinary) => {
        const bytes = isBinary === false || typeof data === "string" ? null : toBytes(data);
        if (bytes === null) {
          // Only binary frames are valid (spec 01 §1).
          link.close();
          connection.close(CLOSE_CODE.unsupportedData);
          return;
        }
        link.send(bytes);
      });
      connection.on("close", () => {
        link.close();
        emit("client disconnected");
      });
      connection.on("error", () => {
        emit("socket error");
      });
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => {
      const address = server.address();
      const bound = typeof address === "object" && address !== null ? address.port : options.port;
      resolve({
        port: bound,
        close: () =>
          new Promise<void>((done) => {
            sockets.close();
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
