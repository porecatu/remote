// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The fake desktop: a host on a {@link MemoryRelay} that answers the protocol
 * with the world of `scenario.ts`. It is the host side of one `HostChannel`
 * per client channel, like `createFakeHost` of the protocol package, plus what
 * a development session needs and that fake does not do: a 200x60 pane with
 * live diffs under the spec's flow control (spec 03 §5.4), scrollback pages,
 * echo of typed input, a workspace of two windows, and a bell on demand.
 *
 * Sans-timers: the driver calls {@link ScenarioHost.tick} often (every few
 * milliseconds); the host decides when a frame is due. Actions are answered
 * `unsupported` (the workspace is fixed), and nothing is ever logged.
 */
import {
  CloseReason,
  ErrorCode,
  GoodbyeReason,
  HostChannel,
  HostError,
  NamedKey,
  PairRejectReason,
  PairingToken,
  PaneState,
  PROTOCOL_MAJOR,
  PROTOCOL_VERSION,
  ctEqual,
  decodeHostEnvelope,
  encodeHostEnvelope,
  generateStaticKeypair,
  hostId as deriveHostId,
  type HostEvent,
  type Message,
  type PairingInvite,
  type PaneId,
  type RandomSource,
  type StaticKeypair,
  type TabId,
} from "../../src/protocol/index.ts";
import type { MemoryRelay } from "../../src/protocol/testing.ts";
import {
  LIVE_PANE,
  LivePane,
  buildProfiles,
  buildSessions,
  buildTheme,
  buildWorkspace,
  collectPanes,
  collectTabs,
  emptySnapshot,
} from "./scenario.ts";

/** Wire frames per second the host keeps per subscription (spec 03 §5.4 caps it at 30). */
const GRID_MESSAGES_PER_SECOND = 30;
const GRID_INTERVAL_MS = 1000 / GRID_MESSAGES_PER_SECOND;
/** Unacknowledged grid messages per subscription (spec 03 §5.4). */
const GRID_WINDOW = 2;
/** The simulated pane advances at the same rate it is sent. */
const SIM_FRAME_MS = GRID_INTERVAL_MS;
/** After a stall the simulation catches up by at most this many frames. */
const MAX_CATCH_UP_FRAMES = 5;

/** Same default as the protocol package's fake host, so a pairing URI stays valid across runs. */
const DEFAULT_ROUTING_KEY = new Uint8Array(32).fill(7);

export interface ScenarioHostOptions {
  readonly relay: MemoryRelay;
  /** Monotonic time in whole milliseconds. */
  readonly now: () => number;
  /** Host static key pair; pass one to keep the pairing URI stable across runs (default: a new one). */
  readonly hostKey?: StaticKeypair;
  readonly hostId?: string;
  readonly hostName?: string;
  /** `max_subscriptions` of the `welcome`; default 4. */
  readonly maxSubscriptions?: number;
  /** Refuse devices that did not pair in this run (default: any device that completes `IK` is accepted). */
  readonly strict?: boolean;
  /** Answer every valid pairing with `pair-rejected { user-declined }`. */
  readonly declinePairing?: boolean;
  readonly random?: RandomSource;
}

export interface ScenarioHost {
  readonly hostId: string;
  /** Static public key of the host. */
  readonly hostKey: Uint8Array;
  pairedDevices(): Uint8Array[];
  /** A new single-use pairing token (it replaces the previous one) and the invitation a QR carries. */
  startPairing(relayUrl: string): PairingInvite;
  /** Advances the simulation and sends what is due. Cheap when nothing is. */
  tick(nowMs: number): void;
  /** Sends a `bell` on the live pane to every client subscribed to it. */
  ringBell(): void;
  /**
   * The tab each connected client last said it shows (`view-tab`, spec 03
   * §4.4), `null` for a client that shows none. Only that is kept: the
   * workspace never changes because of it.
   */
  viewedTabs(): (TabId | null)[];
  /** Number of client channels that finished the handshake. */
  openChannels(): number;
  /** Says goodbye (`host-quitting`) to every client and leaves the relay. */
  shutdown(): void;
}

interface Subscription {
  /** `seq` of the next grid message (the first one of a subscription is 0). */
  nextSeq: number;
  /** Highest `seq` acknowledged; -1 before the first ack. */
  ackedThrough: number;
  /** The live pane's `version` at the last message sent. */
  sentVersion: number;
  nextSendMs: number;
}

interface ChannelState {
  readonly channel: HostChannel;
  readonly subscriptions: Map<PaneId, Subscription>;
  /** The state of `view-tab`: one per session, it starts `null`. */
  viewedTab: TabId | null;
}

export function createScenarioHost(options: ScenarioHostOptions): ScenarioHost {
  const { relay, now } = options;
  const key = options.hostKey ?? generateStaticKeypair(options.random);
  const id = options.hostId ?? deriveHostId(DEFAULT_ROUTING_KEY);
  const hostName = options.hostName ?? "Fake Desktop";
  const maxSubscriptions = options.maxSubscriptions ?? 4;
  const random = options.random ?? ((n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)));
  const hostInstance = random(16);

  const workspace = buildWorkspace();
  const panes = collectPanes(workspace);
  const tabs = collectTabs(workspace);
  const live = new LivePane();
  const channels = new Map<number, ChannelState>();
  const paired: Uint8Array[] = [];
  let token: PairingToken | null = null;
  let simClockMs = now();

  const isPaired = (deviceKey: Uint8Array): boolean => paired.some((known) => ctEqual(known, deviceKey));
  const link = relay.attachHost(id, (frame) => onFrame(frame));

  function sendPayloads(number: number, payloads: readonly Uint8Array[]): void {
    for (const payload of payloads) {
      link.send(encodeHostEnvelope({ type: "channel-data", channel: number, payload }));
    }
  }

  function closeChannel(number: number, reason: CloseReason): void {
    const state = channels.get(number);
    if (state === undefined) {
      return;
    }
    state.channel.close();
    channels.delete(number);
    link.send(encodeHostEnvelope({ type: "close-channel", channel: number, reason }));
  }

  function reply(number: number, state: ChannelState, ...messages: Message[]): void {
    for (const message of messages) {
      if (!state.channel.isOpen) {
        return;
      }
      sendPayloads(number, state.channel.send(message, now()));
    }
  }

  function sendGrid(number: number, state: ChannelState, pane: PaneId, sub: Subscription, snapshot: boolean): void {
    const seq = sub.nextSeq;
    sub.nextSeq += 1;
    sub.nextSendMs = now() + GRID_INTERVAL_MS;
    if (pane !== LIVE_PANE) {
      const info = panes.get(pane);
      reply(number, state, emptySnapshot(pane, seq, info?.cols ?? 80, info?.rows ?? 24));
      return;
    }
    const version = live.version;
    reply(number, state, snapshot ? live.snapshot(seq) : live.diffSince(sub.sentVersion, seq));
    sub.sentVersion = version;
  }

  function onSubscribe(number: number, state: ChannelState, pane: PaneId): void {
    if (!panes.has(pane)) {
      reply(number, state, { type: "error", code: ErrorCode.unknownPane, pane });
      return;
    }
    let sub = state.subscriptions.get(pane);
    if (sub === undefined) {
      if (state.subscriptions.size >= maxSubscriptions) {
        reply(number, state, { type: "error", code: ErrorCode.tooManySubscriptions, pane });
        return;
      }
      sub = { nextSeq: 0, ackedThrough: -1, sentVersion: 0, nextSendMs: 0 };
      state.subscriptions.set(pane, sub);
    }
    sendGrid(number, state, pane, sub, true);
  }

  function onInput(number: number, state: ChannelState, message: Message): void {
    if (message.type !== "key" && message.type !== "text-input" && message.type !== "paste") {
      return;
    }
    if (!state.subscriptions.has(message.pane)) {
      reply(number, state, { type: "error", code: ErrorCode.notSubscribed, pane: message.pane });
      return;
    }
    if (panes.get(message.pane)?.state !== PaneState.running || message.pane !== LIVE_PANE) {
      reply(number, state, { type: "error", code: ErrorCode.paneNotRunning, pane: message.pane });
      return;
    }
    if (message.type === "key") {
      if (message.key === NamedKey.enter) {
        live.enter();
      } else if (message.key === NamedKey.backspace) {
        live.backspace();
      } else if (typeof message.key === "string") {
        live.type(message.key);
      }
    } else {
      live.type(message.text);
    }
  }

  function onMessage(number: number, state: ChannelState, message: Message): void {
    switch (message.type) {
      case "hello": {
        const [major, minor] = message.version;
        if (major !== PROTOCOL_VERSION[0] || minor !== PROTOCOL_VERSION[1]) {
          reply(number, state, { type: "incompatible", version: PROTOCOL_VERSION });
          closeChannel(number, CloseReason.normal);
          return;
        }
        reply(
          number,
          state,
          {
            type: "welcome",
            version: PROTOCOL_VERSION,
            hostName,
            porecatuVersion: "0.0.0-fake-host",
            maxSubscriptions,
            hostInstance,
          },
          buildTheme(),
          buildProfiles(),
          workspace,
        );
        return;
      }
      case "subscribe":
        onSubscribe(number, state, message.pane);
        return;
      case "unsubscribe":
        state.subscriptions.delete(message.pane);
        return;
      case "grid-ack": {
        const sub = state.subscriptions.get(message.pane);
        if (sub !== undefined && message.seq < sub.nextSeq) {
          sub.ackedThrough = Math.max(sub.ackedThrough, message.seq);
        }
        return;
      }
      case "scrollback-request": {
        if (!state.subscriptions.has(message.pane)) {
          reply(number, state, { type: "error", code: ErrorCode.notSubscribed, id: message.id, pane: message.pane });
        } else if (message.pane !== LIVE_PANE) {
          reply(number, state, { type: "error", code: ErrorCode.invalidArgument, id: message.id, pane: message.pane });
        } else {
          reply(number, state, live.scrollbackPage(message.id, message.offset, message.count));
        }
        return;
      }
      case "key":
      case "text-input":
      case "paste":
        onInput(number, state, message);
        return;
      case "view-tab":
        // Not an action, and no success reply; an unknown tab is an error and clears the state.
        if (message.tab === null || tabs.has(message.tab)) {
          state.viewedTab = message.tab;
        } else {
          state.viewedTab = null;
          reply(number, state, { type: "error", code: ErrorCode.unknownTab });
        }
        return;
      case "list-sessions":
        reply(number, state, buildSessions(message.id));
        return;
      case "action":
        reply(number, state, { type: "action-result", id: message.id, error: ErrorCode.unsupported });
        return;
      case "goodbye":
        closeChannel(number, CloseReason.normal);
        return;
      default:
        return;
    }
  }

  function onEvents(number: number, state: ChannelState, events: readonly HostEvent[]): void {
    for (const event of events) {
      if (!channels.has(number)) {
        return;
      }
      switch (event.type) {
        case "send":
          sendPayloads(number, [event.payload]);
          break;
        case "device-connecting":
          if (options.strict === true && !isPaired(event.deviceKey)) {
            sendPayloads(number, state.channel.rejectNotPaired(now()));
            closeChannel(number, CloseReason.normal);
          }
          break;
        case "pair-requested": {
          const matches = token !== null && token.matchesAndConsume(event.request.token, now());
          if (!matches) {
            reply(number, state, { type: "pair-rejected", reason: PairRejectReason.tokenInvalid });
            closeChannel(number, CloseReason.normal);
          } else if (options.declinePairing === true) {
            reply(number, state, { type: "pair-rejected", reason: PairRejectReason.userDeclined });
            closeChannel(number, CloseReason.normal);
          } else {
            paired.push(event.deviceKey.slice());
            reply(number, state, { type: "pair-accepted", hostName });
          }
          break;
        }
        case "message":
          onMessage(number, state, event.message);
          break;
        case "failed":
          closeChannel(number, event.error.closeReason);
          break;
      }
    }
  }

  function onFrame(frame: Uint8Array): void {
    const envelope = decodeHostEnvelope(frame);
    switch (envelope.type) {
      case "channel-opened": {
        const channelOptions = options.random === undefined ? {} : { random: options.random };
        channels.set(envelope.channel, {
          channel: new HostChannel(key, id, now(), channelOptions),
          subscriptions: new Map(),
          viewedTab: null,
        });
        break;
      }
      case "channel-data": {
        const state = channels.get(envelope.channel);
        if (state === undefined) {
          break;
        }
        try {
          onEvents(envelope.channel, state, state.channel.receive(envelope.payload, now()));
        } catch (error) {
          if (!(error instanceof HostError)) {
            throw error;
          }
        }
        break;
      }
      case "channel-closed":
        channels.get(envelope.channel)?.channel.close();
        channels.delete(envelope.channel);
        break;
      default:
        break;
    }
  }

  function tick(nowMs: number): void {
    // Handshake deadlines.
    for (const [number, state] of [...channels]) {
      if (state.channel.nextDeadline() !== null) {
        onEvents(number, state, state.channel.tick(nowMs));
      }
    }
    // The simulation moves at 30 frames per second of host time.
    let frames = 0;
    while (nowMs - simClockMs >= SIM_FRAME_MS) {
      simClockMs += SIM_FRAME_MS;
      if (frames < MAX_CATCH_UP_FRAMES) {
        live.step();
        frames += 1;
      }
    }
    // Grid messages: only the live pane changes by itself.
    for (const [number, state] of channels) {
      const sub = state.subscriptions.get(LIVE_PANE);
      if (sub === undefined || !state.channel.isOpen) {
        continue;
      }
      const unacked = sub.nextSeq - 1 - sub.ackedThrough;
      if (unacked < GRID_WINDOW && nowMs >= sub.nextSendMs && live.version > sub.sentVersion) {
        sendGrid(number, state, LIVE_PANE, sub, false);
      }
    }
  }

  return {
    hostId: id,
    hostKey: key.publicKey.slice(),
    pairedDevices: () => paired.map((device) => device.slice()),
    startPairing(relayUrl) {
      token?.destroy();
      token = PairingToken.generate(now(), options.random);
      return {
        major: PROTOCOL_MAJOR,
        relayUrl,
        hostId: id,
        hostKey: key.publicKey.slice(),
        token: token.bytes,
        hostName,
      };
    },
    tick,
    ringBell() {
      for (const [number, state] of channels) {
        if (state.subscriptions.has(LIVE_PANE)) {
          reply(number, state, { type: "bell", pane: LIVE_PANE });
        }
      }
    },
    viewedTabs() {
      return [...channels.values()].filter((state) => state.channel.isOpen).map((state) => state.viewedTab);
    },
    openChannels() {
      let count = 0;
      for (const state of channels.values()) {
        if (state.channel.isOpen) {
          count += 1;
        }
      }
      return count;
    },
    shutdown() {
      for (const [number, state] of [...channels]) {
        reply(number, state, { type: "goodbye", reason: GoodbyeReason.hostQuitting });
        closeChannel(number, CloseReason.normal);
      }
      link.detach();
    },
  };
}
