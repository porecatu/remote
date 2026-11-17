// SPDX-License-Identifier: GPL-3.0-or-later
// The wait indicator of the chrome (anatomy §2.7 `icon.spinner`, §2.9
// `duration.spinner`): `loader-circle` turning once per second, linear. The
// anatomy keeps spinners running with "reduce motion" on (§2.9, §5 item 6):
// only transitions stop, a spinner is the information that something waits.
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { duration, icon as iconTokens, type ColorToken, type IconRole } from "../theme";
import { Icon } from "./Icon";

/** One full turn, in degrees. */
const fullTurn = 360;

export type SpinnerProps = {
  /** A chrome color token; the anatomy spinner is `accent` (§2.7). */
  readonly color?: ColorToken;
  /** Size and stroke by icon role; the anatomy spinner is `spinner` (16). */
  readonly role?: IconRole;
  /**
   * What the screen reader says ("Connecting…"). Without it the spinner is
   * decorative: the text next to it already says what waits.
   */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
};

/** A `loader-circle` turning once per second while something waits. */
export function Spinner({ color = "accent", role = "spinner", accessibilityLabel, testID }: SpinnerProps) {
  const rotation = useSharedValue(0);
  const side = iconTokens[role].size;

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(fullTurn, {
        duration: duration.spinner,
        easing: Easing.linear,
        // Reanimated would otherwise jump to the end with the system setting on.
        reduceMotion: ReduceMotion.Never,
      }),
      -1,
      false,
      undefined,
      ReduceMotion.Never,
    );
    return () => {
      cancelAnimation(rotation);
    };
  }, [rotation]);

  const turning = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const a11y =
    accessibilityLabel === undefined
      ? ({ accessible: false, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const)
      : ({
          accessible: true,
          accessibilityRole: "progressbar",
          accessibilityLabel,
          accessibilityState: { busy: true },
        } as const);

  return (
    <View {...a11y} style={{ width: side, height: side }} {...(testID === undefined ? {} : { testID })}>
      <Animated.View
        style={[{ width: side, height: side }, turning]}
        {...(testID === undefined ? {} : { testID: `${testID}-rotor` })}
      >
        <Icon
          name="loader-circle"
          role={role}
          color={color}
          {...(testID === undefined ? {} : { testID: `${testID}-icon` })}
        />
      </Animated.View>
    </View>
  );
}
