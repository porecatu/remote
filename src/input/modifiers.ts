// SPDX-License-Identifier: GPL-3.0-or-later

// Modifier state machine of the special-keys bar (PRD-003 RF-3.16): a tap arms
// the modifier for the next key ("once"), a second tap locks it, a tap on a
// locked modifier turns it off. No timers: the sequence of taps alone decides,
// so the machine is pure and needs no clock.

export type Modifier = "ctrl" | "alt" | "shift" | "meta";

export type ModifierState = "off" | "once" | "locked";

/** Modifier bits of the `key` message (spec 03, section 6). */
export const MODIFIER_BITS: Readonly<Record<Modifier, number>> = {
  ctrl: 0x01,
  alt: 0x02,
  shift: 0x04,
  meta: 0x08,
};

export const MODIFIERS: readonly Modifier[] = ["ctrl", "alt", "shift", "meta"];

export type ModifiersSnapshot = Readonly<Record<Modifier, ModifierState>>;

export const MODIFIERS_OFF: ModifiersSnapshot = {
  ctrl: "off",
  alt: "off",
  shift: "off",
  meta: "off",
};

/** Next state of one modifier after a tap: off -> once -> locked -> off. */
export function nextOnTap(state: ModifierState): ModifierState {
  switch (state) {
    case "off":
      return "once";
    case "once":
      return "locked";
    case "locked":
      return "off";
  }
}

/** Bit mask of every modifier that is armed ("once") or locked. */
export function maskOf(snapshot: ModifiersSnapshot): number {
  let mask = 0;
  for (const modifier of MODIFIERS) {
    if (snapshot[modifier] !== "off") {
      mask |= MODIFIER_BITS[modifier];
    }
  }
  return mask;
}

/** The state after a key was sent: "once" modifiers drop, locked ones stay. */
export function afterConsume(snapshot: ModifiersSnapshot): ModifiersSnapshot {
  const next: Record<Modifier, ModifierState> = { ...snapshot };
  for (const modifier of MODIFIERS) {
    if (next[modifier] === "once") {
      next[modifier] = "off";
    }
  }
  return next;
}

export type ModifierKeys = {
  /** Applies a tap on the bar button of `modifier`. */
  tap(modifier: Modifier): void;
  /** Turns `modifier` off, armed or locked (the pinned key of the bar, anatomy §4.8). */
  release(modifier: Modifier): void;
  state(modifier: Modifier): ModifierState;
  snapshot(): ModifiersSnapshot;
  /** Current mask without changing anything (for display or text input). */
  peek(): number;
  /** Mask for the key being sent now; clears the "once" modifiers. */
  consume(): number;
  /** Turns everything off (pane change, keyboard dismissed). */
  reset(): void;
  /** Notified after every change; returns the unsubscribe function. */
  subscribe(listener: (snapshot: ModifiersSnapshot) => void): () => void;
};

export function createModifierKeys(): ModifierKeys {
  let current: ModifiersSnapshot = MODIFIERS_OFF;
  const listeners = new Set<(snapshot: ModifiersSnapshot) => void>();

  const set = (next: ModifiersSnapshot): void => {
    if (MODIFIERS.every((m) => next[m] === current[m])) {
      return;
    }
    current = next;
    for (const listener of [...listeners]) {
      listener(current);
    }
  };

  return {
    tap(modifier) {
      set({ ...current, [modifier]: nextOnTap(current[modifier]) });
    },
    release(modifier) {
      set({ ...current, [modifier]: "off" });
    },
    state: (modifier) => current[modifier],
    snapshot: () => current,
    peek: () => maskOf(current),
    consume() {
      const mask = maskOf(current);
      set(afterConsume(current));
      return mask;
    },
    reset() {
      set(MODIFIERS_OFF);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
