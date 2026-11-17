// SPDX-License-Identifier: GPL-3.0-or-later
// Test kit of the pairing screens: a pairing controller whose state the test
// sets by hand (with the same derived fields as the real one), invites and
// URIs, and a render inside the pairing provider, the overlay layer and the
// services. Not imported by app code.
import type { ReactElement } from "react";
import { type StoreApi, createStore } from "zustand/vanilla";

import type { PairingController, PairingControllerState } from "@/controllers/pairing";
import type { PairingFailure, PairingState } from "@/pairing/pairingFlow";
import { type ClientSession, type PairingInvite, formatPairingUri, hostId, parsePairingUri } from "@/protocol";
import type { Desktop } from "@/storage/desktopList";
import { type RenderWithOverlaysResult, renderWithOverlays } from "@ui/overlay/testing";
import type { RenderWithServicesOptions } from "@ui/services/testing";

import { PairingProvider } from "./PairingContext";

export const TEST_FINGERPRINT = "ABCD EFGH IJKL MNOP";

/** A valid invite ("Home" on relay.example.com). */
export const TEST_INVITE: PairingInvite = {
  major: 0,
  relayUrl: "wss://relay.example.com",
  hostId: hostId(new Uint8Array(32).fill(3)),
  hostKey: new Uint8Array(32).fill(7),
  token: new Uint8Array(16).fill(9),
  hostName: "Home",
};

/** The URI of `TEST_INVITE` (or of another invite). */
export function testUri(invite: PairingInvite = TEST_INVITE): string {
  return formatPairingUri(invite);
}

/** A session object the screens never touch (the flow keeps it). */
const SESSION = {} as unknown as ClientSession;

function targetOf(invite: PairingInvite) {
  return { relayUrl: invite.relayUrl, hostId: invite.hostId, hostKeyB64: "", hostName: invite.hostName };
}

export const flows = {
  idle: (): PairingState => ({ step: "idle" }),
  naming: (suggestedName = "Test Phone", invite: PairingInvite = TEST_INVITE): PairingState => ({
    step: "naming",
    invite,
    deviceFingerprint: TEST_FINGERPRINT,
    suggestedName,
    nameError: null,
  }),
  connecting: (invite: PairingInvite = TEST_INVITE): PairingState => ({
    step: "connecting",
    invite,
    deviceName: "My Phone",
    deviceFingerprint: TEST_FINGERPRINT,
    deadline: 0,
  }),
  handshaking: (invite: PairingInvite = TEST_INVITE): PairingState => ({
    step: "handshaking",
    target: targetOf(invite),
    deviceName: "My Phone",
    deviceFingerprint: TEST_FINGERPRINT,
    session: SESSION,
  }),
  awaiting: (invite: PairingInvite = TEST_INVITE): PairingState => ({
    step: "awaiting-confirmation",
    target: targetOf(invite),
    deviceName: "My Phone",
    deviceFingerprint: TEST_FINGERPRINT,
    session: SESSION,
    confirmStartedAt: 0,
    confirmEndsAt: 120_000,
    hardDeadline: 125_000,
  }),
  saving: (invite: PairingInvite = TEST_INVITE): PairingState => ({
    step: "saving",
    target: targetOf(invite),
    deviceName: "My Phone",
    session: SESSION,
    hostName: invite.hostName,
    early: [],
    sessionEnded: false,
  }),
  paired: (desktop: Desktop): PairingState => ({
    step: "paired",
    desktop,
    replaced: false,
    session: SESSION,
    early: [],
    sessionEnded: false,
  }),
  failed: (failure: PairingFailure): PairingState => ({ step: "failed", failure }),
};

export type FakeStateExtra = {
  readonly confirmSecondsLeft?: number;
  readonly pairedDesktopId?: string;
};

/** The controller state of a flow state, derived as the real controller does. */
export function controllerState(flow: PairingState, extra: FakeStateExtra = {}): PairingControllerState {
  const active =
    flow.step === "connecting" ||
    flow.step === "handshaking" ||
    flow.step === "awaiting-confirmation" ||
    flow.step === "saving";
  let hostName: string | null = null;
  if (flow.step === "naming" || flow.step === "connecting") {
    hostName = flow.invite.hostName;
  } else if (flow.step === "handshaking" || flow.step === "awaiting-confirmation") {
    hostName = flow.target.hostName;
  } else if (flow.step === "saving") {
    hostName = flow.hostName;
  } else if (flow.step === "paired") {
    hostName = flow.desktop.name;
  }
  return {
    flow,
    step: flow.step,
    active,
    hostName,
    deviceFingerprint: TEST_FINGERPRINT,
    suggestedName: flow.step === "naming" ? flow.suggestedName : null,
    nameError: flow.step === "naming" ? flow.nameError : null,
    deviceName: active && flow.step !== "connecting" ? "My Phone" : flow.step === "connecting" ? flow.deviceName : null,
    confirmSecondsLeft:
      flow.step === "awaiting-confirmation" ? (extra.confirmSecondsLeft ?? 120) : null,
    failure: flow.step === "failed" ? flow.failure : null,
    pairedDesktopId: flow.step === "paired" ? (extra.pairedDesktopId ?? flow.desktop.id) : null,
    replaced: flow.step === "paired" ? flow.replaced : false,
  };
}

export type FakePairingController = PairingController & {
  readonly store: StoreApi<PairingControllerState>;
  /** Puts the controller in a state. */
  set(flow: PairingState, extra?: FakeStateExtra): void;
  readonly calls: {
    readonly readUri: string[];
    readonly submitName: string[];
    cancel: number;
    dispose: number;
  };
};

/**
 * A controller that moves only on `set`, and on the actions as the flow
 * would: a URI is parsed (naming or a `uri` failure), a non-empty name goes
 * to `connecting`, cancel goes back to idle (but not while saving).
 */
export function createFakePairingController(initial: PairingState = flows.idle()): FakePairingController {
  const store = createStore<PairingControllerState>()(() => controllerState(initial));
  const calls = { readUri: [] as string[], submitName: [] as string[], cancel: 0, dispose: 0 };
  const set = (flow: PairingState, extra?: FakeStateExtra): void => {
    store.setState(controllerState(flow, extra), true);
  };
  return {
    store,
    set,
    calls,
    readUri(uri) {
      calls.readUri.push(uri);
      const parsed = parsePairingUri(uri);
      if (parsed.ok) {
        set(flows.naming("Test Phone", parsed.invite));
      } else {
        set(
          flows.failed(
            parsed.field === undefined
              ? { kind: "uri", error: parsed.error }
              : { kind: "uri", error: parsed.error, field: parsed.field },
          ),
        );
      }
    },
    submitName(name) {
      calls.submitName.push(name);
      const flow = store.getState().flow;
      if (flow.step === "naming" && name.trim() !== "") {
        set(flows.connecting(flow.invite));
      }
    },
    cancel() {
      calls.cancel += 1;
      const step = store.getState().step;
      if (step !== "saving" && step !== "paired" && step !== "failed") {
        set(flows.idle());
      }
    },
    dispose() {
      calls.dispose += 1;
    },
  };
}

/** Renders `ui` inside `PairingProvider` (with `controller`), the overlay layer and the services. */
export async function renderPairing(
  ui: ReactElement,
  options: RenderWithServicesOptions & { readonly controller?: PairingController } = {},
): Promise<RenderWithOverlaysResult> {
  const { controller, ...rest } = options;
  return renderWithOverlays(
    controller === undefined ? (
      <PairingProvider>{ui}</PairingProvider>
    ) : (
      <PairingProvider controller={controller}>{ui}</PairingProvider>
    ),
    rest,
  );
}
