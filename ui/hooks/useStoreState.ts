// SPDX-License-Identifier: GPL-3.0-or-later
// Binds a `zustand/vanilla` store (the controllers of `src/`) to React. The
// component re-renders only when the selected value changes by `equality`
// (`Object.is` by default), and the selector may be an inline function: the
// last value handed out is kept while the new one is equal, so a selector that
// builds an object or array stays stable with `shallowEqual`.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { StoreApi } from "zustand/vanilla";

export type Equality<T> = (a: T, b: T) => boolean;

/** Same keys with `Object.is` values (objects) or same items (arrays). */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  return keysA.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(recordA[key], recordB[key]),
  );
}

/** The value last committed by the component; written only from an effect. */
type Committed<U> = { current: { hasValue: false } | { hasValue: true; value: U } };

function commit<U>(committed: Committed<U>, value: U): void {
  committed.current = { hasValue: true, value };
}

/**
 * The snapshot function of `useSyncExternalStore`: the selection of the
 * current state, the same reference while the state is the same, and the
 * previous value while the new one is equal to it (also the value committed
 * before the selector changed, so an inline selector stays stable).
 */
function createSelection<S, U>(
  store: StoreApi<S>,
  selector: (state: S) => U,
  equality: Equality<U>,
  committed: Committed<U>,
): () => U {
  let memo: { state: S; selected: U } | null = null;
  return () => {
    const state = store.getState();
    if (memo !== null && Object.is(memo.state, state)) {
      return memo.selected;
    }
    const next = selector(state);
    const last = committed.current;
    let selected = next;
    if (memo !== null) {
      selected = equality(memo.selected, next) ? memo.selected : next;
    } else if (last.hasValue && equality(last.value, next)) {
      selected = last.value;
    }
    memo = { state, selected };
    return selected;
  };
}

export function useStoreState<S, U>(
  store: StoreApi<S>,
  selector: (state: S) => U,
  equality: Equality<U> = Object.is,
): U {
  const [committed] = useState<Committed<U>>(() => ({ current: { hasValue: false } }));
  const getSelection = useMemo(
    () => createSelection(store, selector, equality, committed),
    [store, selector, equality, committed],
  );
  const value = useSyncExternalStore(store.subscribe, getSelection, getSelection);
  useEffect(() => {
    commit(committed, value);
  }, [committed, value]);
  return value;
}
