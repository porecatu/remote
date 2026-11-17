// SPDX-License-Identifier: GPL-3.0-or-later
// One pairing flow for the three routes of the pairing stack (anatomy §4.3;
// PRD-001 RF-1.4 to RF-1.11): the layout of `app/pair` creates the controller
// (`src/controllers/pairing.ts`) with the services, hands it to the camera,
// name and wait screens, and disposes of it when the stack goes away, which
// closes any socket still open and saves nothing.
//
// Around the controller the flow keeps, in memory only, what the screens need
// after a failure: the desktop name and the relay host of the last code read,
// the step the flow failed from (to tell "could not reach the relay" from a
// connection lost later), and the last code and name, so "Try again" can run
// the same attempt. The code is a secret (single-use token): never shown,
// never logged, never in a route parameter; dropped on dispose.
//
// A pairing link from the system (RF-1.5) is taken from the app shell when the
// stack mounts, and whenever another one is released while it is mounted.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { type StoreApi, createStore } from "zustand/vanilla";

import {
  type PairingController,
  type PairingControllerState,
  createPairingController,
} from "@/controllers/pairing";
import type { Services } from "@ui/services/createServices";
import { useServices } from "@ui/services/ServicesContext";

import { type PairingStep, relayHostOf } from "./pairingModel";

/** What the flow remembers of the attempt (memory only). */
export type PairingMemory = {
  /** The desktop name of the last code read, kept after a failure (bar title). */
  readonly desktopName: string | null;
  /** The relay host of the last code read ("relay.example.com"). */
  readonly relayHost: string | null;
  /** The step the flow left when it failed; null when it is not failed. */
  readonly failedFrom: PairingStep | null;
  /** The last code and name are held: the same attempt can run again. */
  readonly canRetry: boolean;
};

export type PairingFlow = {
  readonly controller: PairingController;
  readonly memory: StoreApi<PairingMemory>;
  /** A code from the camera or a link. */
  readUri(uri: string): void;
  /** The name step's "Connect". */
  submitName(name: string): void;
  /** Leaves the attempt: closes the socket, saves nothing. */
  cancel(): void;
  /** Runs the last attempt again (same code and name), when `canRetry`. */
  retry(): void;
  /** Disposes of the controller and forgets the code. */
  dispose(): void;
};

const EMPTY_MEMORY: PairingMemory = {
  desktopName: null,
  relayHost: null,
  failedFrom: null,
  canRetry: false,
};

function targetOf(state: PairingControllerState): { hostName: string; relayUrl: string } | null {
  const flow = state.flow;
  switch (flow.step) {
    case "naming":
    case "connecting":
      return flow.invite;
    case "handshaking":
    case "awaiting-confirmation":
    case "saving":
      return flow.target;
    default:
      return null;
  }
}

/** Wraps a pairing controller with the memory of the attempt. */
export function createPairingFlow(controller: PairingController): PairingFlow {
  const memory = createStore<PairingMemory>()(() => EMPTY_MEMORY);
  let lastUri: string | null = null;
  let lastName: string | null = null;
  let disposed = false;

  function remember(state: PairingControllerState, previous: PairingControllerState): void {
    const target = targetOf(state);
    const failedNow = state.step === "failed" && state.failure !== previous.failure;
    memory.setState((current) => ({
      desktopName: target?.hostName ?? state.hostName ?? current.desktopName,
      relayHost: target === null ? current.relayHost : relayHostOf(target.relayUrl),
      failedFrom: state.step !== "failed" ? null : failedNow ? previous.step : current.failedFrom,
      canRetry: lastUri !== null && lastName !== null,
    }));
  }

  const unsubscribe = controller.store.subscribe(remember);
  const initial = controller.store.getState();
  remember(initial, initial);

  function syncRetry(): void {
    memory.setState({ canRetry: lastUri !== null && lastName !== null });
  }

  return {
    controller,
    memory,
    readUri(uri) {
      if (disposed) {
        return;
      }
      lastUri = uri;
      // A new code waits for its own name.
      lastName = null;
      syncRetry();
      controller.readUri(uri);
    },
    submitName(name) {
      if (disposed) {
        return;
      }
      lastName = name;
      syncRetry();
      controller.submitName(name);
    },
    cancel() {
      controller.cancel();
    },
    retry() {
      if (disposed || lastUri === null || lastName === null) {
        return;
      }
      const name = lastName;
      controller.readUri(lastUri);
      controller.submitName(name);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      lastUri = null;
      lastName = null;
      unsubscribe();
      controller.dispose();
      memory.setState(EMPTY_MEMORY, true);
    },
  };
}

/**
 * The pairing controller over the services (stage 13 wiring): the device key,
 * the stored device name or else the phone model as the suggested name, and
 * the settings as the place the name of a completed pairing is remembered.
 */
export function createPairingControllerFromServices(services: Services): PairingController {
  const stored = services.settings.store.getState().settings.deviceName;
  const suggested = stored ?? services.deviceModel;
  return createPairingController({
    device: services.identity.keypair(),
    platform: services.platform,
    ...(suggested === null ? {} : { defaultDeviceName: suggested }),
    openSocket: services.openSocket,
    repository: services.repository,
    registry: services.registry,
    rememberName: (name) => services.settings.update({ deviceName: name }).then(() => undefined),
    clock: services.clock,
    scheduler: services.scheduler,
    nowIso: () => services.nowIso(),
  });
}

const PairingFlowContext = createContext<PairingFlow | null>(null);

type PairingProviderProps = {
  /** A controller made elsewhere (tests); default: one over the services. */
  readonly controller?: PairingController;
  readonly children: ReactNode;
};

/** Creates the pairing flow of the stack and disposes of it on unmount. */
export function PairingProvider({ controller, children }: PairingProviderProps) {
  const services = useServices();
  const [flow] = useState(() =>
    createPairingFlow(controller ?? createPairingControllerFromServices(services)),
  );

  useEffect(() => () => flow.dispose(), [flow]);

  // RF-1.5: a link held by the app shell (the root navigated here for it).
  useEffect(() => {
    const appShell = services.appShell;
    const takeLink = (): void => {
      if (appShell.store.getState().pendingPairingLink === null) {
        return;
      }
      const link = appShell.takePairingLink();
      if (link !== null) {
        flow.readUri(link);
      }
    };
    takeLink();
    return appShell.store.subscribe(takeLink);
  }, [flow, services]);

  return <PairingFlowContext.Provider value={flow}>{children}</PairingFlowContext.Provider>;
}

/** The pairing flow of the stack. Throws outside `PairingProvider` (a wiring bug). */
export function usePairingFlow(): PairingFlow {
  const flow = useContext(PairingFlowContext);
  if (flow === null) {
    throw new Error("usePairingFlow outside PairingProvider");
  }
  return flow;
}
