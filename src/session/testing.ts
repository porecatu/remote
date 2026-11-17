// SPDX-License-Identifier: GPL-3.0-or-later

// Helpers for the tests of this folder (and of the subscription and input
// steps that build on the session): a clock and scheduler driven by hand, a
// WebSocket stand-in wired to the protocol package's in-memory relay, a
// scripted host for the replies `createFakeHost` cannot give, and a harness
// that puts them together. Not imported by app code.

import { type RelaySocket, clientUrl, closeReasonFromCode } from "@/net/relaySocket";
import { type SwitchableHandlers, createSwitchableHandlers } from "@/net/socketHandoff";
import type { OpenSocket, SessionHandover } from "@/session/lifecycle";
import {
  ClientSession,
  type HostEvent,
  HostChannel,
  type Message,
  PROTOCOL_VERSION,
  Platform,
  type StaticKeypair,
  type Theme,
  type WorkspaceMessage,
  base64UrlEncode,
  decodeHostEnvelope,
  encodeHostEnvelope,
  hexEncode,
} from "@/protocol";
import {
  type FakeHost,
  type MemoryRelay,
  createFakeHost,
  createMemoryRelay,
  testKeypair,
} from "@/protocol/testing";
import type { Desktop } from "@/storage/desktopList";
import { PROFILES, tab, win, workspace } from "@/workspace/testing";
import type { Clock, Scheduler } from "./clock";

// ----------------------------------------------------------------- time

export interface ManualTime {
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  /** Moves the clock forward, running the timers that fall due on the way, in order. */
  advance(ms: number): void;
  /** Timers still waiting. */
  pending(): number;
}

const EPOCH_MS = Date.UTC(2026, 10, 15);

export function createManualTime(startMs = 1000): ManualTime {
  let current = startMs;
  let nextId = 1;
  const timers = new Map<number, { due: number; callback: () => void }>();

  function earliest(limit: number): [number, { due: number; callback: () => void }] | null {
    let best: [number, { due: number; callback: () => void }] | null = null;
    for (const entry of timers.entries()) {
      if (entry[1].due <= limit && (best === null || entry[1].due < best[1].due)) {
        best = entry;
      }
    }
    return best;
  }

  return {
    clock: {
      now: () => current,
      iso: () => new Date(EPOCH_MS + current).toISOString(),
    },
    scheduler: {
      set(callback, delayMs) {
        const id = nextId;
        nextId += 1;
        timers.set(id, { due: current + delayMs, callback });
        return id;
      },
      clear(handle) {
        timers.delete(handle as number);
      },
    },
    advance(ms) {
      const target = current + ms;
      for (let next = earliest(target); next !== null; next = earliest(target)) {
        timers.delete(next[0]);
        current = Math.max(current, next[1].due);
        next[1].callback();
      }
      current = target;
    },
    pending: () => timers.size,
  };
}

// ----------------------------------------------------------------- sockets

export interface FakeSocket {
  readonly url: string;
  /** The network let the connection through: `onOpen`, then whatever the relay had queued. */
  open(): void;
  /** The connection fell without a close frame (or with `code`). */
  drop(code?: number): void;
  readonly opened: boolean;
  readonly closedByApp: boolean;
  /** Frames the app wrote, in order. */
  readonly sent: readonly Uint8Array[];
}

export interface FakeNetwork {
  readonly openSocket: OpenSocket;
  /** Every socket ever opened, oldest first. */
  readonly sockets: readonly FakeSocket[];
  last(): FakeSocket;
}

/** `openRelaySocket` replaced by a socket on the in-memory relay; it opens only when told to. */
export function createFakeNetwork(relay: MemoryRelay): FakeNetwork {
  const sockets: FakeSocket[] = [];
  const openSocket: OpenSocket = (url, handlers) => {
    const hostId = url.slice(url.lastIndexOf("/") + 1);
    const sent: Uint8Array[] = [];
    const inbox: Uint8Array[] = [];
    const state = { opened: false, closed: false, closedByApp: false };
    const link = relay.connectClient(hostId, (frame) => {
      if (state.closed) {
        return;
      }
      if (state.opened) {
        handlers.onFrame(frame);
      } else {
        inbox.push(frame);
      }
    });
    const socket: FakeSocket = {
      url,
      open() {
        if (state.opened || state.closed) {
          return;
        }
        state.opened = true;
        handlers.onOpen();
        for (const frame of inbox.splice(0)) {
          if (state.closed) {
            return;
          }
          handlers.onFrame(frame);
        }
      },
      drop(code = 1006) {
        if (state.closed) {
          return;
        }
        state.closed = true;
        link.close();
        handlers.onClose({ code, reason: closeReasonFromCode(code), local: false });
      },
      get opened() {
        return state.opened;
      },
      get closedByApp() {
        return state.closedByApp;
      },
      sent,
    };
    sockets.push(socket);
    return {
      send(frame: Uint8Array): boolean {
        if (!state.opened || state.closed) {
          return false;
        }
        sent.push(frame);
        link.send(frame);
        return true;
      },
      close(): void {
        if (state.closed) {
          return;
        }
        state.closed = true;
        state.closedByApp = true;
        link.close();
        handlers.onClose({ code: 1000, reason: "normal", local: true });
      },
    };
  };
  return {
    openSocket,
    sockets,
    last(): FakeSocket {
      const socket = sockets[sockets.length - 1];
      if (socket === undefined) {
        throw new Error("no socket was opened");
      }
      return socket;
    },
  };
}

// ----------------------------------------------------------------- scripted host

export interface ScriptedHostOptions {
  readonly relay: MemoryRelay;
  readonly now: () => number;
  readonly hostKey: StaticKeypair;
  readonly hostId: string;
  /** What the host answers to each message the client sends; `send` writes to that client. */
  readonly onMessage: (message: Message, send: (reply: Message) => void) => void;
}

export interface ScriptedHost {
  /** Messages received, in order. */
  readonly received: readonly Message[];
  /** Sends to every open channel. */
  broadcast(message: Message): void;
  detach(): void;
}

/** A host that accepts every device and leaves the replies to the test. */
export function createScriptedHost(options: ScriptedHostOptions): ScriptedHost {
  const { relay, now, hostKey, hostId } = options;
  const channels = new Map<number, HostChannel>();
  const received: Message[] = [];

  const link = relay.attachHost(hostId, (frame) => {
    const envelope = decodeHostEnvelope(frame);
    if (envelope.type === "channel-opened") {
      channels.set(envelope.channel, new HostChannel(hostKey, hostId, now()));
    } else if (envelope.type === "channel-closed") {
      channels.get(envelope.channel)?.close();
      channels.delete(envelope.channel);
    } else if (envelope.type === "channel-data") {
      const channel = channels.get(envelope.channel);
      if (channel === undefined) {
        return;
      }
      const events: HostEvent[] = channel.receive(envelope.payload, now());
      for (const event of events) {
        if (event.type === "send") {
          write(envelope.channel, [event.payload]);
        } else if (event.type === "message") {
          received.push(event.message);
          options.onMessage(event.message, (reply) => {
            write(envelope.channel, channel.send(reply, now()));
          });
        } else if (event.type === "failed") {
          link.send(
            encodeHostEnvelope({
              type: "close-channel",
              channel: envelope.channel,
              reason: event.error.closeReason,
            }),
          );
        }
      }
    }
  });

  function write(channel: number, payloads: readonly Uint8Array[]): void {
    for (const payload of payloads) {
      link.send(encodeHostEnvelope({ type: "channel-data", channel, payload }));
    }
  }

  return {
    received,
    broadcast(message) {
      for (const [number, channel] of channels) {
        if (channel.isOpen) {
          write(number, channel.send(message, now()));
        }
      }
    },
    detach() {
      for (const channel of channels.values()) {
        channel.close();
      }
      channels.clear();
      link.detach();
    },
  };
}

/** A theme for the scripted hosts' greeting. */
export function makeTheme(): Theme {
  return {
    type: "theme",
    fg: 0xd4d4d4,
    bg: 0x1e1e1e,
    cursor: 0xffffff,
    selectionBg: 0x264f78,
    palette: Array.from({ length: 16 }, (_, index) => index * 0x101010),
    groupColors: [0x2472c8, 0x0dbc79],
  };
}

// ----------------------------------------------------------------- harness

export interface Harness {
  readonly time: ManualTime;
  readonly relay: MemoryRelay;
  readonly network: FakeNetwork;
  readonly device: StaticKeypair;
  readonly host: FakeHost;
  readonly desktop: Desktop;
}

export interface HarnessOptions {
  /** Whether the fake host already knows the device (default true). */
  readonly paired?: boolean;
  readonly maxSubscriptions?: number;
}

export const TEST_RELAY_URL = "wss://relay.example";

/** Builds a desktop record for a host on the relay. */
export function desktopFor(
  host: { readonly hostId: string; readonly hostKey: Uint8Array },
  at: string,
  over: Partial<Desktop> = {},
): Desktop {
  return {
    id: "a".repeat(32),
    name: "Test Desktop",
    relayUrl: TEST_RELAY_URL,
    hostId: host.hostId,
    hostKeyB64: base64UrlEncode(host.hostKey),
    pairedAt: at,
    lastStatus: { kind: "connected", at },
    ...over,
  };
}

/** A fake desktop on the in-memory relay, plus a device that is (or is not) paired to it. */
export function createHarness(options: HarnessOptions = {}): Harness {
  const time = createManualTime();
  const relay = createMemoryRelay();
  const device = testKeypair(2);
  const host = createFakeHost({
    relay,
    now: time.clock.now,
    pairedDevices: options.paired === false ? [] : [device.publicKey],
    ...(options.maxSubscriptions === undefined ? {} : { maxSubscriptions: options.maxSubscriptions }),
  });
  return {
    time,
    relay,
    network: createFakeNetwork(relay),
    device,
    host,
    desktop: desktopFor(host, time.clock.iso()),
  };
}

/** Hex of a 16-byte `host_instance` filled with `byte`, as `WelcomeInfo` shows it. */
export function instanceHex(byte: number): string {
  return hexEncode(new Uint8Array(16).fill(byte));
}

// ----------------------------------------------------------------- greeting host

/**
 * A scripted host that greets like the real one (welcome, theme, profiles,
 * workspace) with the given `host_instance` and tree, and leaves every other
 * message to `extra`. It replaces the harness's fake host.
 */
export function greetingHost(
  h: Harness,
  instance: number,
  tree: WorkspaceMessage = workspace([win(1, [tab(1)], { active: 1 })]),
  extra: (message: Message, send: (reply: Message) => void) => void = () => undefined,
): ScriptedHost {
  h.host.detach();
  return createScriptedHost({
    relay: h.relay,
    now: h.time.clock.now,
    hostKey: testKeypair(1),
    hostId: h.host.hostId,
    onMessage: (message, send) => {
      if (message.type !== "hello") {
        extra(message, send);
        return;
      }
      send({
        type: "welcome",
        version: PROTOCOL_VERSION,
        hostName: "Scripted",
        porecatuVersion: "0.0.0-test",
        maxSubscriptions: 4,
        hostInstance: new Uint8Array(16).fill(instance),
      });
      send(makeTheme());
      send(PROFILES);
      send(tree);
    },
  });
}

// ----------------------------------------------------------------- pairing handover

export interface PairedChannel {
  /** What the pairing hands to the session (`SessionHandover`). */
  readonly handover: SessionHandover;
  /** The socket of the pairing, on the fake network. */
  readonly socket: FakeSocket;
  readonly switchable: SwitchableHandlers;
}

/**
 * Pairs `h.device` with the harness's fake host (`XX`) over a socket of the
 * fake network, the way the pairing controller does, and stops at
 * `pair-accepted` with the socket's events held (no target) for the handover.
 * Use a harness made with `paired: false`.
 */
export function pairOnRelay(h: Harness, early: readonly Message[] = []): PairedChannel {
  const invite = h.host.startPairing(TEST_RELAY_URL);
  const url = clientUrl(TEST_RELAY_URL, h.host.hostId);
  if (url === null) {
    throw new Error("bad test relay url");
  }
  const device = { publicKey: h.device.publicKey.slice(), privateKey: h.device.privateKey.slice() };
  const started = ClientSession.pair(invite, device, "Test Phone", Platform.android, h.time.clock.now());
  const switchable = createSwitchableHandlers();
  let socket: RelaySocket | null = null;
  let accepted = false;
  switchable.setTarget({
    onOpen: () => {
      for (const frame of started.frames) {
        socket?.send(frame);
      }
    },
    onFrame: (frame) => {
      for (const event of started.session.receive(frame, h.time.clock.now())) {
        if (event.type === "send") {
          socket?.send(event.frame);
        } else if (event.type === "message" && event.message.type === "pair-accepted") {
          accepted = true;
        }
      }
    },
    onClose: () => undefined,
  });
  socket = h.network.openSocket(url, switchable.handlers);
  if (socket === null) {
    throw new Error("socket refused");
  }
  const fake = h.network.last();
  fake.open();
  if (!accepted) {
    throw new Error("pairing was not accepted");
  }
  switchable.setTarget(null);
  return {
    handover: {
      session: started.session,
      socket,
      redirect: (handlers) => {
        switchable.setTarget(handlers);
      },
      early,
    },
    socket: fake,
    switchable,
  };
}
