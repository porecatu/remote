// SPDX-License-Identifier: GPL-3.0-or-later
// The temporary zoom chip (anatomy §4.7, §2.5 `zoom-chip.height`, §2.6
// `zoom-chip.padding-x` and `zoom-chip.top`, §2.9 `opacity.zoom-chip`): "120%"
// centered at the top of the grid while the pinch goes on and for
// `duration.zoom-chip` after it (the grid's `zoomChipVisible` keeps the
// time). Round, `bg.sheet` at `opacity.zoom-chip` with a `border.sheet`
// border, `type.chip` text. A polite live region: the screen reader hears the
// new zoom without losing its place. 100% is the "fit the width" zoom.
import { StyleSheet, Text, View } from "react-native";

import { useT } from "@ui/i18n/LocaleProvider";
import { barMaxFontScale, opacity, roundRadius, size, spacing, typeStyle, useTheme, withAlpha } from "@ui/theme";

export type ZoomChipProps = {
  /** `TerminalGridState.zoomChipVisible`. */
  readonly visible: boolean;
  /** `TerminalGridState.zoomPercent` (100 = fit the width). */
  readonly percent: number;
  /** Default `zoom-chip`. */
  readonly testID?: string;
};

/** The zoom percentage over the top of the grid, while it is visible. */
export function ZoomChip({ visible, percent, testID = "zoom-chip" }: ZoomChipProps) {
  const { t } = useT();
  const { colors } = useTheme();
  if (!visible) {
    return null;
  }
  return (
    <View style={styles.frame} pointerEvents="none">
      <View
        accessibilityLiveRegion="polite"
        testID={testID}
        style={[
          styles.chip,
          { backgroundColor: withAlpha(colors.bgSheet, opacity.zoomChip), borderColor: colors.borderSheet },
        ]}
      >
        <Text maxFontSizeMultiplier={barMaxFontScale} style={[typeStyle("chip"), { color: colors.textBody }]}>
          {t("terminal.zoom", { percent: Math.round(percent) })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "absolute",
    top: spacing.zoomChipTop,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  chip: {
    height: size.zoomChipHeight,
    paddingHorizontal: spacing.zoomChipPaddingX,
    borderRadius: roundRadius(size.zoomChipHeight),
    borderWidth: size.borderWidth,
    justifyContent: "center",
  },
});
