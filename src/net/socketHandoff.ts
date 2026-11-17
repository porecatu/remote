// SPDX-License-Identifier: GPL-3.0-or-later

// Socket handlers that can change hands (PRD-001 RF-1.10). `openRelaySocket`
// fixes its handlers when the socket opens, but the socket of a pairing is
// opened by the pairing controller and then handed to the session lifecycle,
// which goes on using it. The caller opens the socket with `handlers` of a
// switchable set and moves the events along with `setTarget`.
//
// While there is no target, the events wait in a queue and are delivered in
// order to the next target, synchronously inside `setTarget`. Nothing about the
// frames is looked at or logged.

import type { CloseInfo, RelaySocketHandlers } from "./relaySocket";

type QueuedEvent =
  | { readonly type: "open" }
  | { readonly type: "frame"; readonly frame: Uint8Array }
  | { readonly type: "close"; readonly info: CloseInfo };

export interface SwitchableHandlers {
  /** Pass these to `openRelaySocket`; they forward to the current target. */
  readonly handlers: RelaySocketHandlers;
  /**
   * Sends the events from now on to `next`, after the ones queued while there
   * was no target (in the order they came). `null` holds the events in the
   * queue until the next target.
   */
  setTarget(next: RelaySocketHandlers | null): void;
  /** Events waiting for a target. */
  queued(): number;
}

export function createSwitchableHandlers(
  initial: RelaySocketHandlers | null = null,
): SwitchableHandlers {
  let target: RelaySocketHandlers | null = initial;
  const queue: QueuedEvent[] = [];
  let draining = false;

  function deliver(to: RelaySocketHandlers, event: QueuedEvent): void {
    switch (event.type) {
      case "open":
        to.onOpen();
        return;
      case "frame":
        to.onFrame(event.frame);
        return;
      case "close":
        to.onClose(event.info);
        return;
    }
  }

  /** Delivers the queue to the current target; stops when the target goes away mid-way. */
  function drain(): void {
    if (draining) {
      return;
    }
    draining = true;
    try {
      while (target !== null) {
        const event = queue.shift();
        if (event === undefined) {
          return;
        }
        deliver(target, event);
      }
    } finally {
      draining = false;
    }
  }

  function push(event: QueuedEvent): void {
    queue.push(event);
    drain();
  }

  return {
    handlers: {
      onOpen: () => {
        push({ type: "open" });
      },
      onFrame: (frame) => {
        push({ type: "frame", frame });
      },
      onClose: (info) => {
        push({ type: "close", info });
      },
    },
    setTarget(next): void {
      target = next;
      drain();
    },
    queued: () => queue.length,
  };
}
