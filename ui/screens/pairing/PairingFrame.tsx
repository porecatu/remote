// SPDX-License-Identifier: GPL-3.0-or-later
// The frame of the pairing screens: `bg.base` under the safe area. The bar of
// the wait and its results (§4.3.4: `x` and "Pair with Home") is the screen
// bar with its `x` (ui/components/ScreenBar.tsx).
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@ui/theme";

type PairingFrameProps = {
  readonly children: ReactNode;
  readonly testID?: string;
};

/** A pairing screen: `bg.base`, inside the safe area. */
export function PairingFrame({ children, testID }: PairingFrameProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bgBase,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
      {...(testID === undefined ? {} : { testID })}
    >
      {children}
    </View>
  );
}
