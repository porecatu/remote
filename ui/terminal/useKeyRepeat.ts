// SPDX-License-Identifier: GPL-3.0-or-later
// Auto-repeat of a held key of the key bar (anatomy §4.8, ADR-0010 item 4):
// the key fires as the finger lands, again after `duration.keyRepeatDelay`
// and then every `duration.keyRepeatInterval` until the finger lifts. The
// timer runs on the JS thread, because every repeat is one `key` message; the
// touch only marks the start and the end.
//
// A screen reader activates a button with a click and no touch (`onPress`
// alone), so `onPress` fires the key when no touch already did.
import { useCallback, useEffect, useMemo, useRef } from "react";

import { duration } from "../theme";

export interface KeyRepeatTiming {
  /** Until the first repeat, in milliseconds. */
  readonly delay: number;
  /** Between repeats, in milliseconds. */
  readonly interval: number;
}

/** §2.9 `duration.key-repeat-delay` and `duration.key-repeat-interval`. */
export const KEY_REPEAT_TIMING: KeyRepeatTiming = {
  delay: duration.keyRepeatDelay,
  interval: duration.keyRepeatInterval,
};

/** The handlers of a `Pressable` that repeats. */
export interface KeyRepeatHandlers {
  readonly onPressIn: () => void;
  readonly onPressOut: () => void;
  readonly onPress: () => void;
}

/**
 * `fire(false)` once per touch (or screen-reader activation), then
 * `fire(true)` for every repeat while the key is held. Unmounting stops it.
 */
export function useKeyRepeat(
  fire: (repeat: boolean) => void,
  timing: KeyRepeatTiming = KEY_REPEAT_TIMING,
): KeyRepeatHandlers {
  const fireRef = useRef(fire);
  useEffect(() => {
    fireRef.current = fire;
  }, [fire]);

  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // A touch is in progress or just ended: its `onPress` must not fire again.
  const touching = useRef(false);

  const stop = useCallback(() => {
    if (delayTimer.current !== null) {
      clearTimeout(delayTimer.current);
      delayTimer.current = null;
    }
    if (repeatTimer.current !== null) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const { delay, interval } = timing;
  return useMemo<KeyRepeatHandlers>(
    () => ({
      onPressIn() {
        stop();
        touching.current = true;
        fireRef.current(false);
        delayTimer.current = setTimeout(() => {
          delayTimer.current = null;
          fireRef.current(true);
          repeatTimer.current = setInterval(() => {
            fireRef.current(true);
          }, interval);
        }, delay);
      },
      onPressOut() {
        stop();
        // `onPress` comes right after a release (or before a delayed
        // `onPressOut`); a touch that slid off gets no `onPress` at all, so
        // the mark is dropped once the current event is over.
        setTimeout(() => {
          if (delayTimer.current === null && repeatTimer.current === null) {
            touching.current = false;
          }
        }, 0);
      },
      onPress() {
        if (touching.current) {
          touching.current = false;
          return;
        }
        fireRef.current(false);
      },
    }),
    [delay, interval, stop],
  );
}
