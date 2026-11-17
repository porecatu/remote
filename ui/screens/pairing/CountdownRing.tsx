// SPDX-License-Identifier: GPL-3.0-or-later
// The wait for the desktop's confirmation (anatomy §4.3.4; PRD-001 RF-1.9):
// a progress ring that empties over the 120 s and the time left ("1:42")
// under it. The ring takes the place of the state icon (`icon.state`: size
// and stroke); `border.row` track, `accent` arc. The time is announced by the
// wait screen (every 30 s and the last 10 s); here it is read on demand as
// "102 seconds left".
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useT } from "@ui/i18n/LocaleProvider";
import { icon, space, typeStyle, useTheme } from "@ui/theme";

import { timeLeftParams, waitProgress } from "./pairingModel";

export type CountdownRingProps = {
  /** Whole seconds left of the wait. */
  readonly secondsLeft: number;
  readonly testID?: string;
};

export function CountdownRing({ secondsLeft, testID = "countdown" }: CountdownRingProps) {
  const { t, tn } = useT();
  const { colors } = useTheme();
  const { size: side, strokeWidth } = icon.state;
  const radius = (side - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = waitProgress(secondsLeft);
  const center = side / 2;

  return (
    <View style={styles.container} testID={testID}>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ width: side, height: side }}
      >
        <Svg width={side} height={side}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.borderRow}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.accent}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - progress)}
            transform={`rotate(-90 ${center} ${center})`}
            testID={`${testID}-arc`}
          />
        </Svg>
      </View>
      <Text
        accessibilityLabel={tn("pairing.seconds_left", secondsLeft)}
        style={[typeStyle("body"), { color: colors.textBody }]}
        testID={`${testID}-time`}
      >
        {t("pairing.time_left", timeLeftParams(secondsLeft))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    rowGap: space.s,
  },
});
