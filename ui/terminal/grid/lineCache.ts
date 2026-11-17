// SPDX-License-Identifier: GPL-3.0-or-later
// Cache of line recordings (ADR-0002 item 2): one recording per line slot,
// kept while the line object in that slot is the same one. The grid model
// replaces the object of every line a diff touches, and a history line keeps
// its object while it stays cached, so identity is exactly "dirty": a clean
// line reuses its recording, only touched lines are recorded again. A change
// of font, theme or metrics drops everything (`clear`).
//
// Generic over the recording type, so it is testable without Skia.

/** Slot of a live row: `-(row + 1)`; a history line: its absolute index (≥ 0). */
export type LineSlot = number;

/** The slot of live row `row` (0 = top of the live screen). */
export function liveSlot(row: number): LineSlot {
  return -(row + 1);
}

export interface LineCache<T> {
  /**
   * The recording of `slot` for `source`: the cached one when the slot still
   * holds the same `source` object, else `record(source)` (and the old
   * recording is disposed).
   */
  get<S extends object>(slot: LineSlot, source: S, record: (source: S) => T): T;
  /** Disposes the recordings of the slots `keep` rejects (lines out of the drawn window). */
  retain(keep: (slot: LineSlot) => boolean): void;
  /** Disposes every recording (font, theme or metrics changed, or unmount). */
  clear(): void;
  readonly size: number;
}

interface Entry<T> {
  readonly source: object;
  readonly value: T;
}

/** Creates an empty cache; `dispose` releases a recording that leaves it. */
export function createLineCache<T>(dispose: (value: T) => void = () => undefined): LineCache<T> {
  const entries = new Map<LineSlot, Entry<T>>();
  return {
    get(slot, source, record) {
      const known = entries.get(slot);
      if (known !== undefined && known.source === source) {
        return known.value;
      }
      const value = record(source);
      if (known !== undefined) {
        dispose(known.value);
      }
      entries.set(slot, { source, value });
      return value;
    },
    retain(keep) {
      for (const [slot, entry] of entries) {
        if (!keep(slot)) {
          dispose(entry.value);
          entries.delete(slot);
        }
      }
    },
    clear() {
      for (const entry of entries.values()) {
        dispose(entry.value);
      }
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}
