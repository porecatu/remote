// SPDX-License-Identifier: GPL-3.0-or-later

import {
  HostChannel,
  PROTOCOL_MAJOR,
  PairRejectReason,
  PairingToken,
  Platform,
  decodeHostEnvelope,
  encodeHostEnvelope,
  CloseReason,
  base64UrlEncode,
  fingerprint,
  formatFingerprint,
  formatPairingUri,
  hostId as deriveHostId,
  type Message,
  type PairRequest,
  type PairingInvite,
  type RandomSource,
  type StaticKeypair,
} from "@/protocol";
import { createMemoryRelay, createTestClock, testKeypair, type ClientLink, type MemoryRelay, type TestClock } from "@/protocol/testing";
import { MAX_DESKTOPS, createDesktopRepository, type DesktopRepository } from "../storage/desktopList";
import { createMemoryStore, type SecureStore } from "../storage/secureStore";
import {
  PAIRING_CONFIRM_GRACE_MS,
  PAIRING_CONFIRM_WAIT_MS,
  PAIRING_CONNECT_TIMEOUT_MS,
  createPairingState,
  isPairingActive,
  nextPairingDeadline,
  normalizeDeviceName,
  reducePairing,
  savePairedDesktop,
  type PairingContext,
  type PairingEffect,
  type PairingEvent,
  type PairingState,
} from "./pairingFlow";

const RELAY_URL = "wss://relay.example.com";
const NOW_ISO = "2026-11-15T12:00:00Z";

function seededRandom(seed: number): RandomSource {
  let x = seed >>> 0 || 1;
  return (n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      out[i] = x & 0xff;
    }
    return out;
  };
}

// ----------------------------------------------------------------- the desktop

interface PendingPair {
  readonly channel: number;
  readonly deviceKey: Uint8Array;
  readonly request: PairRequest;
}

/** The desktop side: `HostChannel` per channel, a real `PairingToken`, a user who decides later. */
function createDesktop(relay: MemoryRelay, clock: TestClock, hostKey: StaticKeypair = testKeypair(1)) {
  const hostId = deriveHostId(new Uint8Array(32).fill(7));
  const channels = new Map<number, HostChannel>();
  const pending: PendingPair[] = [];
  const paired: Uint8Array[] = [];
  const received: Message[] = [];
  let token = PairingToken.generate(clock.now(), seededRandom(99));
  let random = 1000;

  const link = relay.attachHost(hostId, (frame) => onFrame(frame));

  const sendPayloads = (channel: number, payloads: readonly Uint8Array[]): void => {
    for (const payload of payloads) {
      link.send(encodeHostEnvelope({ type: "channel-data", channel, payload }));
    }
  };
  const close = (channel: number, reason: CloseReason): void => {
    channels.get(channel)?.close();
    channels.delete(channel);
    link.send(encodeHostEnvelope({ type: "close-channel", channel, reason }));
  };

  function onFrame(frame: Uint8Array): void {
    const envelope = decodeHostEnvelope(frame);
    if (envelope.type === "channel-opened") {
      random += 1;
      channels.set(
        envelope.channel,
        new HostChannel(hostKey, hostId, clock.now(), { random: seededRandom(random) }),
      );
    } else if (envelope.type === "channel-data") {
      const channel = channels.get(envelope.channel);
      if (channel === undefined) {
        return;
      }
      for (const event of channel.receive(envelope.payload, clock.now())) {
        if (event.type === "send") {
          sendPayloads(envelope.channel, [event.payload]);
        } else if (event.type === "pair-requested") {
          if (token.matchesAndConsume(event.request.token, clock.now())) {
            pending.push({ channel: envelope.channel, deviceKey: event.deviceKey, request: event.request });
          } else {
            sendPayloads(envelope.channel, channel.send({ type: "pair-rejected", reason: PairRejectReason.tokenInvalid }, clock.now()));
            close(envelope.channel, CloseReason.normal);
          }
        } else if (event.type === "message") {
          received.push(event.message);
        } else if (event.type === "failed") {
          close(envelope.channel, event.error.closeReason);
        }
      }
    } else if (envelope.type === "channel-closed") {
      channels.get(envelope.channel)?.close();
      channels.delete(envelope.channel);
    }
  }

  return {
    hostId,
    hostKey,
    pending,
    paired,
    received,
    channelCount: () => channels.size,
    /** The invitation a QR code would carry, with a fresh single-use token. */
    invite(overrides: Partial<PairingInvite> = {}): PairingInvite {
      token.destroy();
      token = PairingToken.generate(clock.now(), seededRandom(random + 7));
      return {
        major: PROTOCOL_MAJOR,
        relayUrl: RELAY_URL,
        hostId,
        hostKey: hostKey.publicKey,
        token: token.bytes,
        hostName: "Workstation",
        ...overrides,
      };
    },
    /** The user confirms on the desktop. */
    accept(name = "Workstation"): void {
      const request = pending.shift();
      if (request === undefined) {
        throw new Error("no pairing waiting");
      }
      paired.push(request.deviceKey);
      const channel = channels.get(request.channel);
      if (channel === undefined) {
        throw new Error("channel gone");
      }
      sendPayloads(request.channel, channel.send({ type: "pair-accepted", hostName: name }, clock.now()));
    },
    /** The user declines (or the desktop times out). */
    decline(reason: PairRejectReason): void {
      const request = pending.shift();
      if (request === undefined) {
        throw new Error("no pairing waiting");
      }
      const channel = channels.get(request.channel);
      if (channel === undefined) {
        throw new Error("channel gone");
      }
      sendPayloads(request.channel, channel.send({ type: "pair-rejected", reason }, clock.now()));
      close(request.channel, CloseReason.normal);
    },
    /** The desktop sends a message of its own before deciding. */
    sendOnPending(message: Message): void {
      const request = pending[0];
      const channel = request === undefined ? undefined : channels.get(request.channel);
      if (request === undefined || channel === undefined) {
        throw new Error("no pairing waiting");
      }
      sendPayloads(request.channel, channel.send(message, clock.now()));
    },
    /** The relay-level close the host does on its own. */
    closeAll(reason: CloseReason): void {
      for (const number of [...channels.keys()]) {
        close(number, reason);
      }
    },
  };
}

// ----------------------------------------------------------------- the client driver

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface ClientOptions {
  readonly relay: MemoryRelay;
  readonly clock: TestClock;
  readonly repository: DesktopRepository;
  readonly device?: StaticKeypair;
  readonly hostIdForLink: string;
  readonly defaultDeviceName?: string;
}

/** What a screen plus socket adapter would do: run the effects, feed the events back. */
function createClient(options: ClientOptions) {
  const device = options.device ?? testKeypair(2);
  const context: PairingContext = {
    device,
    platform: Platform.android,
    random: seededRandom(5),
    ...(options.defaultDeviceName === undefined ? {} : { defaultDeviceName: options.defaultDeviceName }),
  };
  let state: PairingState = createPairingState();
  const effects: PairingEffect[] = [];
  const states: PairingState[] = [];
  const queue: PairingEvent[] = [];
  let running = false;
  let link: ClientLink | null = null;
  const savePromises: Promise<void>[] = [];

  function run(effect: PairingEffect): void {
    effects.push(effect);
    switch (effect.type) {
      case "open-socket":
        // The socket opens before the relay says anything.
        queue.push({ type: "socket-opened", now: options.clock.now() });
        link = options.relay.connectClient(effect.url.slice(effect.url.lastIndexOf("/") + 1), (frame) => {
          dispatch({ type: "frame-received", frame, now: options.clock.now() });
        });
        break;
      case "send-frame":
        link?.send(effect.frame);
        break;
      case "close-socket":
        link?.close();
        break;
      case "save-desktop":
        savePromises.push(
          savePairedDesktop(options.repository, effect, NOW_ISO).then((event) => {
            dispatch(event);
          }),
        );
        break;
      case "log":
        break;
    }
  }

  function dispatch(event: PairingEvent): void {
    queue.push(event);
    if (running) {
      return;
    }
    running = true;
    try {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next === undefined) {
          break;
        }
        const step = reducePairing(context, state, next);
        state = step.state;
        states.push(state);
        for (const effect of step.effects) {
          run(effect);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    context,
    effects,
    states,
    get state(): PairingState {
      return state;
    },
    dispatch,
    /** Waits for the saves in flight and everything they cause. */
    async settle(): Promise<void> {
      await flush();
      await Promise.all(savePromises);
      await flush();
    },
    sent(): PairingEffect[] {
      return effects.filter((effect) => effect.type === "send-frame");
    },
  };
}

interface World {
  readonly relay: MemoryRelay;
  readonly clock: TestClock;
  readonly desktop: ReturnType<typeof createDesktop>;
  readonly store: SecureStore;
  readonly repository: DesktopRepository;
  readonly client: ReturnType<typeof createClient>;
}

function world(options: { defaultDeviceName?: string; store?: SecureStore } = {}): World {
  const relay = createMemoryRelay();
  const clock = createTestClock(1000);
  const desktop = createDesktop(relay, clock);
  const store = options.store ?? createMemoryStore();
  const repository = createDesktopRepository(store, { randomBytes: (n) => new Uint8Array(n).fill(0xab) });
  const client = createClient({
    relay,
    clock,
    repository,
    hostIdForLink: desktop.hostId,
    ...(options.defaultDeviceName === undefined ? {} : { defaultDeviceName: options.defaultDeviceName }),
  });
  return { relay, clock, desktop, store, repository, client };
}

/** Reads the QR and confirms the name: the flow is now talking to the relay. */
function startPairing(w: World, name = "My Phone", invite = w.desktop.invite()): void {
  w.client.dispatch({ type: "uri-read", uri: formatPairingUri(invite) });
  w.client.dispatch({ type: "name-submitted", name, now: w.clock.now() });
}

// ----------------------------------------------------------------- tests

describe("reading the QR (RF-1.6, RF-1.7)", () => {
  it("goes to the name step with the desktop name from the QR and the device fingerprint", () => {
    const w = world({ defaultDeviceName: "Pixel 9" });
    w.client.dispatch({ type: "uri-read", uri: formatPairingUri(w.desktop.invite({ hostName: "Casa" })) });
    const state = w.client.state;
    expect(state.step).toBe("naming");
    if (state.step === "naming") {
      expect(state.invite.hostName).toBe("Casa");
      expect(state.suggestedName).toBe("Pixel 9");
      expect(state.nameError).toBeNull();
      expect(state.deviceFingerprint).toBe(
        formatFingerprint(fingerprint(testKeypair(2).publicKey)),
      );
    }
    expect(w.client.effects.filter((e) => e.type !== "log")).toEqual([]);
  });

  it.each([
    ["a URI that is not Porecatu's", "https://example.com/pair", "not-porecatu"],
    ["a future major version", `porecatu://pair?v=1`, "version-mismatch"],
    ["a field that is missing", "porecatu://pair?v=0", "missing-field"],
  ] as const)("refuses %s without connecting", (_label, uri, error) => {
    const w = world();
    w.client.dispatch({ type: "uri-read", uri });
    expect(w.client.state).toEqual(
      expect.objectContaining({ step: "failed", failure: expect.objectContaining({ kind: "uri", error }) }),
    );
    expect(w.client.effects.some((e) => e.type === "open-socket")).toBe(false);
  });

  it("refuses an insecure relay and names the field", () => {
    const w = world();
    const uri = formatPairingUri(w.desktop.invite({ relayUrl: "ws://localhost:8080" })).replace(
      "ws%3A%2F%2Flocalhost%3A8080",
      "ws%3A%2F%2Frelay.example.com",
    );
    w.client.dispatch({ type: "uri-read", uri });
    expect(w.client.state).toEqual({
      step: "failed",
      failure: { kind: "uri", error: "insecure-relay", field: "relay" },
    });
  });

  it("accepts ws:// to localhost, as the spec allows for development", () => {
    const w = world();
    w.client.dispatch({
      type: "uri-read",
      uri: formatPairingUri(w.desktop.invite({ relayUrl: "ws://localhost:8080" })),
    });
    expect(w.client.state.step).toBe("naming");
  });

  it("a new QR replaces the one waiting for a name", () => {
    const w = world();
    w.client.dispatch({ type: "uri-read", uri: formatPairingUri(w.desktop.invite({ hostName: "One" })) });
    w.client.dispatch({ type: "uri-read", uri: formatPairingUri(w.desktop.invite({ hostName: "Two" })) });
    expect(w.client.state).toEqual(
      expect.objectContaining({ step: "naming", invite: expect.objectContaining({ hostName: "Two" }) }),
    );
  });
});

describe("the device name (RF-1.7)", () => {
  it("normalizes: trims, drops control characters, cuts at 64 UTF-8 bytes without splitting a character", () => {
    expect(normalizeDeviceName("  My\u0000 Phone\n ")).toBe("My Phone");
    expect(normalizeDeviceName("   ")).toBe("");
    const long = normalizeDeviceName("é".repeat(40));
    expect(new TextEncoder().encode(long).length).toBeLessThanOrEqual(64);
    expect(long).toBe("é".repeat(32));
    expect(normalizeDeviceName(`${"a".repeat(63)} b`)).toBe("a".repeat(63));
  });

  it("an empty name keeps the flow on the name step with an error", () => {
    const w = world();
    w.client.dispatch({ type: "uri-read", uri: formatPairingUri(w.desktop.invite()) });
    w.client.dispatch({ type: "name-submitted", name: "  \n ", now: 0 });
    expect(w.client.state).toEqual(expect.objectContaining({ step: "naming", nameError: "empty" }));
    expect(w.client.effects.some((e) => e.type === "open-socket")).toBe(false);
    w.client.dispatch({ type: "name-submitted", name: "Phone", now: 0 });
    expect(w.client.effects.some((e) => e.type === "open-socket")).toBe(true);
    expect(w.client.state.step).not.toBe("naming");
  });

  it("the desktop receives the name that was sent, clamped", async () => {
    const w = world();
    startPairing(w, `  ${"é".repeat(40)}  `);
    await w.client.settle();
    expect(w.desktop.pending).toHaveLength(1);
    expect(w.desktop.pending[0]?.request.device).toBe("é".repeat(32));
    expect(w.desktop.pending[0]?.request.platform).toBe(Platform.android);
  });
});

describe("pairing end to end (RF-1.8 to RF-1.10)", () => {
  it("connects, shows the device fingerprint while waiting, and saves the desktop on pair-accepted", async () => {
    const w = world();
    startPairing(w);
    expect(w.client.effects).toContainEqual({
      type: "open-socket",
      url: `${RELAY_URL}/v0/client/${w.desktop.hostId}`,
    });
    await w.client.settle();

    const waiting = w.client.state;
    expect(waiting.step).toBe("awaiting-confirmation");
    if (waiting.step === "awaiting-confirmation") {
      expect(waiting.deviceFingerprint).toBe(formatFingerprint(fingerprint(testKeypair(2).publicKey)));
      expect(waiting.confirmEndsAt - waiting.confirmStartedAt).toBe(PAIRING_CONFIRM_WAIT_MS);
      expect(waiting.deviceName).toBe("My Phone");
    }
    // The desktop sees the same fingerprint from the key it received (spec 02 §3.2, item 4).
    expect(formatFingerprint(fingerprint(w.desktop.pending[0]?.deviceKey ?? new Uint8Array()))).toBe(
      formatFingerprint(fingerprint(testKeypair(2).publicKey)),
    );
    // Nothing is saved before the user confirms.
    expect(await w.repository.list()).toEqual([]);

    w.desktop.accept("Casa do Leo");
    expect(w.client.state.step).toBe("saving");
    await w.client.settle();

    const done = w.client.state;
    expect(done.step).toBe("paired");
    if (done.step === "paired") {
      expect(done.replaced).toBe(false);
      expect(done.sessionEnded).toBe(false);
      expect(done.session.isOpen).toBe(true);
      expect(done.desktop).toEqual({
        id: "ab".repeat(16),
        name: "Casa do Leo",
        relayUrl: RELAY_URL,
        hostId: w.desktop.hostId,
        hostKeyB64: base64UrlEncode(testKeypair(1).publicKey),
        pairedAt: NOW_ISO,
        lastStatus: { kind: "connected", at: NOW_ISO },
      });
    }
    expect(await w.repository.list()).toHaveLength(1);
    expect(w.desktop.paired).toHaveLength(1);
  });

  it("hands over a live session: it can send hello and get the welcome", async () => {
    const w = world();
    startPairing(w);
    await w.client.settle();
    w.desktop.accept();
    await w.client.settle();
    const done = w.client.state;
    if (done.step !== "paired") {
      throw new Error("not paired");
    }
    const frames = done.session.send(
      { type: "hello", version: [0, 1], app: "porecatu-remote", appVersion: "0.0.0" },
      w.clock.now(),
    );
    expect(frames.length).toBeGreaterThan(0);
  });

  it("pairing the same desktop again replaces the entry, keeping its id (RF-1.11)", async () => {
    const w = world();
    startPairing(w);
    await w.client.settle();
    w.desktop.accept("First");
    await w.client.settle();
    expect(w.client.state.step).toBe("paired");

    startPairing(w, "Renamed Phone");
    await w.client.settle();
    w.desktop.accept("Second");
    await w.client.settle();

    const done = w.client.state;
    expect(done.step).toBe("paired");
    if (done.step === "paired") {
      expect(done.replaced).toBe(true);
    }
    const list = await w.repository.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Second");
    expect(list[0]?.id).toBe("ab".repeat(16));
  });

  it("falls back to the QR name when the accepted name cannot be stored", async () => {
    const w = world();
    startPairing(w, "Phone", w.desktop.invite({ hostName: "From QR" }));
    await w.client.settle();
    w.desktop.accept("bad\nname");
    await w.client.settle();
    expect((await w.repository.list())[0]?.name).toBe("From QR");
  });
});

describe("what the desktop can answer instead (RF-1.10)", () => {
  it.each([
    ["user-declined", PairRejectReason.userDeclined],
    ["timeout", PairRejectReason.timeout],
  ] as const)("pair-rejected %s saves nothing", async (_label, reason) => {
    const w = world();
    startPairing(w);
    await w.client.settle();
    w.desktop.decline(reason);
    await w.client.settle();
    expect(w.client.state).toEqual({ step: "failed", failure: { kind: "rejected", reason } });
    expect(await w.repository.list()).toEqual([]);
    expect(w.client.effects.some((e) => e.type === "save-desktop")).toBe(false);
  });

  it("an expired or reused QR gives token-invalid and saves nothing", async () => {
    const w = world();
    const invite = w.desktop.invite();
    startPairing(w, "Phone", invite);
    await w.client.settle();
    w.desktop.accept();
    await w.client.settle();
    expect(w.client.state.step).toBe("paired");

    // The same token again: it was consumed.
    w.client.dispatch({ type: "uri-read", uri: formatPairingUri(invite) });
    w.client.dispatch({ type: "name-submitted", name: "Phone", now: w.clock.now() });
    await w.client.settle();
    expect(w.client.state).toEqual({
      step: "failed",
      failure: { kind: "rejected", reason: PairRejectReason.tokenInvalid },
    });
    expect(await w.repository.list()).toHaveLength(1);
  });

  it("a token past its five minutes is refused", async () => {
    const w = world();
    const invite = w.desktop.invite();
    w.clock.advance(5 * 60 * 1000 + 1);
    startPairing(w, "Phone", invite);
    await w.client.settle();
    expect(w.client.state).toEqual({
      step: "failed",
      failure: { kind: "rejected", reason: PairRejectReason.tokenInvalid },
    });
  });

  it("a desktop that is not at the relay is host-unavailable", async () => {
    const w = world();
    startPairing(w, "Phone", w.desktop.invite({ hostId: deriveHostId(new Uint8Array(32).fill(9)) }));
    await w.client.settle();
    expect(w.client.state).toEqual({ step: "failed", failure: { kind: "host-unavailable" } });
  });
});

describe("the desktop is not who the QR said (RF-1.8)", () => {
  it("aborts with host-key-mismatch before sending the pair request, saving nothing", async () => {
    const w = world();
    startPairing(w, "Phone", w.desktop.invite({ hostKey: testKeypair(9).publicKey }));
    await w.client.settle();
    expect(w.client.state).toEqual({ step: "failed", failure: { kind: "host-key-mismatch" } });
    // The desktop never reached a pair request: msg3 was not written.
    expect(w.desktop.pending).toEqual([]);
    expect(await w.repository.list()).toEqual([]);
    expect(w.client.effects).toContainEqual({ type: "close-socket" });
    expect(w.client.effects).toContainEqual({
      type: "log",
      name: "handshake_failed",
      fields: { code: "host-key-mismatch" },
    });
  });
});

describe("timeouts (RF-1.9)", () => {
  it("waits 120 s plus a grace for the user, then gives up with the timeout failure", async () => {
    const w = world();
    startPairing(w);
    await w.client.settle();
    const waiting = w.client.state;
    if (waiting.step !== "awaiting-confirmation") {
      throw new Error("not waiting");
    }
    expect(nextPairingDeadline(waiting)).toBe(waiting.confirmEndsAt + PAIRING_CONFIRM_GRACE_MS);

    w.client.dispatch({ type: "tick", now: waiting.confirmEndsAt });
    expect(w.client.state.step).toBe("awaiting-confirmation");
    w.client.dispatch({ type: "tick", now: waiting.confirmEndsAt + PAIRING_CONFIRM_GRACE_MS - 1 });
    expect(w.client.state.step).toBe("awaiting-confirmation");

    w.client.dispatch({ type: "tick", now: waiting.confirmEndsAt + PAIRING_CONFIRM_GRACE_MS });
    expect(w.client.state).toEqual({ step: "failed", failure: { kind: "timeout", phase: "confirmation" } });
    expect(w.client.effects).toContainEqual({ type: "close-socket" });
    expect(await w.repository.list()).toEqual([]);
    // The channel was closed toward the relay.
    await w.client.settle();
    expect(w.desktop.channelCount()).toBe(0);
  });

  it("an answer in the grace window is still honored", async () => {
    const w = world();
    startPairing(w);
    await w.client.settle();
    const waiting = w.client.state;
    if (waiting.step !== "awaiting-confirmation") {
      throw new Error("not waiting");
    }
    w.client.dispatch({ type: "tick", now: waiting.confirmEndsAt + 1000 });
    w.desktop.accept();
    await w.client.settle();
    expect(w.client.state.step).toBe("paired");
  });

  it("gives up when the socket never opens", () => {
    const w = world();
    w.client.dispatch({ type: "uri-read", uri: formatPairingUri(w.desktop.invite()) });
    // Hold the open-socket effect: drive the reducer directly.
    const named = reducePairing(w.client.context, w.client.state, { type: "name-submitted", name: "P", now: 10 });
    expect(named.state.step).toBe("connecting");
    expect(nextPairingDeadline(named.state)).toBe(10 + PAIRING_CONNECT_TIMEOUT_MS);
    const early = reducePairing(w.client.context, named.state, { type: "tick", now: 10 + PAIRING_CONNECT_TIMEOUT_MS - 1 });
    expect(early.state.step).toBe("connecting");
    const late = reducePairing(w.client.context, named.state, { type: "tick", now: 10 + PAIRING_CONNECT_TIMEOUT_MS });
    expect(late.state).toEqual({ step: "failed", failure: { kind: "timeout", phase: "connect" } });
    expect(late.effects).toContainEqual({ type: "close-socket" });
  });

  it("gives up when the desktop never answers the handshake", () => {
    const w = world();
    // A relay with a host that is registered but silent: no HostChannel answers.
    const silent = createMemoryRelay();
    silent.attachHost(w.desktop.hostId, () => undefined);
    const client = createClient({
      relay: silent,
      clock: w.clock,
      repository: w.repository,
      hostIdForLink: w.desktop.hostId,
    });
    client.dispatch({ type: "uri-read", uri: formatPairingUri(w.desktop.invite()) });
    client.dispatch({ type: "name-submitted", name: "Phone", now: w.clock.now() });
    const handshaking = client.state;
    expect(handshaking.step).toBe("handshaking");
    const due = nextPairingDeadline(handshaking);
    expect(due).not.toBeNull();
    client.dispatch({ type: "tick", now: (due ?? 0) + 1 });
    expect(client.state).toEqual({ step: "failed", failure: { kind: "timeout", phase: "handshake" } });
  });
});

describe("connection trouble", () => {
  it("the relay closing the channel while waiting is relay-closed, nothing saved", async () => {
    const w = world();
    startPairing(w);
    await w.client.settle();
    w.desktop.closeAll(CloseReason.hostGone);
    await w.client.settle();
    expect(w.client.state).toEqual({
      step: "failed",
      failure: { kind: "relay-closed", reason: CloseReason.hostGone },
    });
    expect(await w.repository.list()).toEqual([]);
  });

  it("the socket dropping under us is connection-lost, with no extra close", async () => {
    const w = world();
    startPairing(w);
    await w.client.settle();
    const before = w.client.effects.length;
    w.client.dispatch({ type: "socket-closed" });
    expect(w.client.state).toEqual({ step: "failed", failure: { kind: "connection-lost" } });
    expect(w.client.effects.slice(before).some((e) => e.type === "close-socket")).toBe(false);
  });

  it("a socket that fails to open is connection-lost", () => {
    const w = world();
    w.client.dispatch({ type: "uri-read", uri: formatPairingUri(w.desktop.invite()) });
    const named = reducePairing(w.client.context, w.client.state, { type: "name-submitted", name: "P", now: 0 });
    const lost = reducePairing(w.client.context, named.state, { type: "socket-closed" });
    expect(lost.state).toEqual({ step: "failed", failure: { kind: "connection-lost" } });
  });

  it("garbage from the relay is a protocol failure, not a crash", async () => {
    const w = world();
    startPairing(w);
    await w.client.settle();
    w.client.dispatch({ type: "frame-received", frame: new Uint8Array([1, 2, 3]), now: w.clock.now() });
    const state = w.client.state;
    expect(state.step).toBe("failed");
    if (state.step === "failed") {
      expect(state.failure.kind).toBe("protocol");
    }
  });

  it("an unexpected message while waiting ends the pairing", async () => {
    const w = world();
    startPairing(w);
    await w.client.settle();
    w.desktop.sendOnPending({ type: "bell", pane: 1 });
    await w.client.settle();
    expect(w.client.state).toEqual({ step: "failed", failure: { kind: "protocol", detail: "unexpected-message" } });
    expect(await w.repository.list()).toEqual([]);
  });
});

describe("saving the desktop", () => {
  it("a full list ends in list-full and nothing is added", async () => {
    const w = world();
    // Fill the list with 20 other desktops.
    const filler = createDesktopRepository(w.store);
    for (let i = 0; i < MAX_DESKTOPS; i += 1) {
      await filler.add({
        name: `D${i}`,
        relayUrl: RELAY_URL,
        hostId: "a".repeat(32),
        hostKeyB64: base64UrlEncode(testKeypair(100 + i).publicKey),
        pairedAt: NOW_ISO,
      });
    }
    startPairing(w);
    await w.client.settle();
    w.desktop.accept();
    await w.client.settle();
    expect(w.client.state).toEqual({ step: "failed", failure: { kind: "list-full" } });
    expect(await filler.list()).toHaveLength(MAX_DESKTOPS);
  });

  it("a storage error ends in storage", async () => {
    const real = createMemoryStore();
    const broken: SecureStore = {
      get: real.get,
      set: () => Promise.reject(new Error("keystore")),
      delete: real.delete,
    };
    const w = world({ store: broken });
    startPairing(w);
    await w.client.settle();
    w.desktop.accept();
    await w.client.settle();
    expect(w.client.state).toEqual({ step: "failed", failure: { kind: "storage" } });
  });

  it("a channel that closes while saving still ends paired, flagged sessionEnded", async () => {
    const w = world();
    startPairing(w);
    await w.client.settle();
    w.desktop.accept();
    w.desktop.closeAll(CloseReason.normal);
    await w.client.settle();
    const done = w.client.state;
    expect(done.step).toBe("paired");
    if (done.step === "paired") {
      expect(done.sessionEnded).toBe(true);
    }
    expect(await w.repository.list()).toHaveLength(1);
  });

  it("a new QR or a cancel while saving does not lose the pairing", async () => {
    const w = world();
    startPairing(w);
    await w.client.settle();
    w.desktop.accept();
    expect(w.client.state.step).toBe("saving");
    w.client.dispatch({ type: "cancel" });
    w.client.dispatch({ type: "uri-read", uri: formatPairingUri(w.desktop.invite()) });
    expect(w.client.state.step).toBe("saving");
    await w.client.settle();
    expect(w.client.state.step).toBe("paired");
  });
});

describe("leaving the flow", () => {
  it("cancel while waiting closes the socket and goes back to idle, saving nothing", async () => {
    const w = world();
    startPairing(w);
    await w.client.settle();
    expect(isPairingActive(w.client.state)).toBe(true);
    w.client.dispatch({ type: "cancel" });
    expect(w.client.state).toEqual({ step: "idle" });
    expect(isPairingActive(w.client.state)).toBe(false);
    await w.client.settle();
    expect(w.desktop.channelCount()).toBe(0);
    expect(await w.repository.list()).toEqual([]);
    // Late events after a cancel change nothing.
    w.client.dispatch({ type: "socket-closed" });
    w.client.dispatch({ type: "tick", now: 10_000_000 });
    expect(w.client.state).toEqual({ step: "idle" });
  });

  it("a new QR while connecting abandons the attempt and starts over", async () => {
    const w = world();
    startPairing(w);
    await w.client.settle();
    w.client.dispatch({ type: "uri-read", uri: formatPairingUri(w.desktop.invite({ hostName: "Other" })) });
    expect(w.client.state).toEqual(
      expect.objectContaining({ step: "naming", invite: expect.objectContaining({ hostName: "Other" }) }),
    );
    expect(w.client.effects).toContainEqual({ type: "close-socket" });
  });

  it("cancel on a terminal state changes nothing", async () => {
    const w = world();
    w.client.dispatch({ type: "uri-read", uri: "nope" });
    const failed = w.client.state;
    w.client.dispatch({ type: "cancel" });
    expect(w.client.state).toBe(failed);
  });
});

describe("what leaves the flow", () => {
  it("effects and logs carry no token, no key and no device name", async () => {
    const w = world();
    const invite = w.desktop.invite();
    startPairing(w, "Secret Phone Name", invite);
    await w.client.settle();
    w.desktop.accept();
    await w.client.settle();
    const logs = w.client.effects.filter((e) => e.type === "log");
    const text = JSON.stringify(logs);
    expect(text).not.toContain("Secret Phone Name");
    expect(text).not.toContain(base64UrlEncode(invite.token));
    expect(text).not.toContain(base64UrlEncode(testKeypair(2).privateKey));
    expect(logs.map((e) => (e.type === "log" ? e.name : ""))).toEqual(
      expect.arrayContaining(["relay_connecting", "relay_connected", "pair_ok"]),
    );
  });

  it("does not hand the context's private key to the handshake: wiping the session copy leaves it intact", async () => {
    const w = world();
    const before = w.client.context.device.privateKey.slice();
    startPairing(w);
    await w.client.settle();
    w.desktop.accept();
    await w.client.settle();
    const done = w.client.state;
    if (done.step === "paired") {
      done.session.close();
    }
    expect(w.client.context.device.privateKey).toEqual(before);
  });
});

describe("savePairedDesktop", () => {
  it("never throws: a failing repository becomes a storage event", async () => {
    const repository = {
      add: () => Promise.reject(new Error("boom")),
    };
    const event = await savePairedDesktop(
      repository,
      {
        type: "save-desktop",
        desktop: { name: "X", relayUrl: RELAY_URL, hostId: "a".repeat(32), hostKeyB64: "A".repeat(43) },
      },
      NOW_ISO,
    );
    expect(event).toEqual({ type: "desktop-save-failed", reason: "storage" });
  });
});
