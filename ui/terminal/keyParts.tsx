// SPDX-License-Identifier: GPL-3.0-or-later
// Parts the key bar and the arrow pad share (anatomy §4.7, §4.8): the haptic
// tick of every key touch, and a key that repeats while it is held.
import { useCallback } from "react";

import type { IconName } from "../components/Icon";
import { useStoreState } from "../hooks/useStoreState";
import { useServices } from "../services/ServicesContext";
import { KeyBarKey } from "./KeyBarKey";
import { useKeyRepeat } from "./useKeyRepeat";

/** A light tick per touch, only when the vibration setting is on. */
export function useKeyTick(): () => void {
  const { haptics, settings } = useServices();
  const enabled = useStoreState(settings.store, (state) => state.settings.bellVibration);
  return useCallback(() => {
    if (enabled) {
      haptics.impactLight();
    }
  }, [enabled, haptics]);
}

export type RepeatKeyProps = {
  readonly icon: IconName;
  readonly accessibilityLabel: string;
  /** `repeat` is false for the touch itself, true for every repeat. */
  readonly onFire: (repeat: boolean) => void;
  readonly testID: string;
};

/** An arrow key: fires at the touch, then repeats while held (400 ms, then every 80 ms). */
export function RepeatKey({ icon, accessibilityLabel, onFire, testID }: RepeatKeyProps) {
  const handlers = useKeyRepeat(onFire);
  return (
    <KeyBarKey
      icon={icon}
      accessibilityLabel={accessibilityLabel}
      onPress={handlers.onPress}
      onPressIn={handlers.onPressIn}
      onPressOut={handlers.onPressOut}
      testID={testID}
    />
  );
}
