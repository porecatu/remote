// SPDX-License-Identifier: GPL-3.0-or-later

// Test harness (used only by tests): a real `ClientSession` talking to the
// package's `createFakeHost` through the in-memory relay, with no socket. The
// kit plays the part of the app's session layer: it feeds every host message to
// `onMessage` and sends what the code under test hands to `send`. Not imported
// by app code.

import {
  type ClientEvent,
  ClientSession,
  type ClientMessage,
  type Message,
  PROTOCOL_VERSION,
  type Welcome,
} from "../protocol";
import {
  type ClientLink,
  type FakeHost,
  createFakeHost,
  createMemoryRelay,
  createTestClock,
  testKeypair,
} from "../protocol/testing";

export interface FakeHostKit {
  readonly host: FakeHost;
  /** What the app would send on the wire (seals and writes). Throws once the session closed. */
  send(message: ClientMessage): void;
  /** Every host message that reached the app, in order. */
  readonly fromHost: Message[];
  /** Called for each host message, after it is recorded in `fromHost`; set before `open`. */
  onMessage: (message: Message) => void;
  /** The `welcome` once it arrived. */
  welcome(): Welcome | null;
  /** Handshake (IK) and `hello`; the fake host answers with welcome, theme, profiles, workspace. */
  open(): void;
  /** Whether the session ended (the kit saw `closed` or `failed`). */
  isClosed(): boolean;
}

export function createFakeHostKit(options: { maxSubscriptions?: number } = {}): FakeHostKit {
  const clock = createTestClock(1_000);
  const relay = createMemoryRelay();
  const device = testKeypair(2);
  const host = createFakeHost({
    relay,
    now: clock.now,
    pairedDevices: [device.publicKey],
    ...(options.maxSubscriptions === undefined ? {} : { maxSubscriptions: options.maxSubscriptions }),
  });

  const fromHost: Message[] = [];
  let welcome: Welcome | null = null;
  let closed = false;
  let link: ClientLink | null = null;
  let session: ClientSession | null = null;

  const kit: FakeHostKit = {
    host,
    fromHost,
    onMessage: () => undefined,
    send(message) {
      if (session === null || link === null) {
        throw new Error("kit is not open");
      }
      for (const frame of session.send(message, clock.now())) {
        link.send(frame);
      }
    },
    welcome: () => welcome,
    isClosed: () => closed,
    open() {
      const start = ClientSession.connect(host.hostId, host.hostKey, device, clock.now());
      session = start.session;
      const dispatch = (events: readonly ClientEvent[]): void => {
        for (const event of events) {
          switch (event.type) {
            case "send":
              link?.send(event.frame);
              break;
            case "handshake-complete":
              kit.send({
                type: "hello",
                version: PROTOCOL_VERSION,
                app: "porecatu-remote-test",
                appVersion: "0.0.0",
              });
              break;
            case "message":
              fromHost.push(event.message);
              if (event.message.type === "welcome") {
                welcome = event.message;
              }
              kit.onMessage(event.message);
              break;
            case "host-unavailable":
            case "closed":
            case "failed":
              closed = true;
              break;
          }
        }
      };
      link = relay.connectClient(host.hostId, (frame) => {
        dispatch(start.session.receive(frame, clock.now()));
      });
      for (const frame of start.frames) {
        link.send(frame);
      }
    },
  };
  return kit;
}
