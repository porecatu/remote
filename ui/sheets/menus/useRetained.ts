// SPDX-License-Identifier: GPL-3.0-or-later
// Keeps the last defined value of a selection: a menu whose item left the
// tree still draws what it showed while it closes (a sheet always renders,
// its exit animation needs it). The value must keep its identity while it
// does not change (`useStoreState` with `shallowEqual`).
import { useState } from "react";

/** `value`, or the last defined one when it became `undefined`. */
export function useRetained<T>(value: T | undefined): T | undefined {
  const [kept, setKept] = useState(value);
  if (value !== undefined && value !== kept) {
    setKept(value);
  }
  return value ?? kept;
}
