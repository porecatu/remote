// SPDX-License-Identifier: GPL-3.0-or-later
// The group color pieces of the form sheets (anatomy §2.2 "group color",
// §2.5 `swatch` and `swatch.small`, §4.12.4, §4.12.6, §4.12.7, §5 item 1):
// - `SwatchRow`: the single choice of a group color, swatches of `swatch`
//   (40) drawn in a `target.min` (48) touch target, `target.gap` apart; the
//   chosen one takes the `border.emphasis` ring in `text.title` and the
//   `check` icon, so the choice never depends on the color (§5 item 4). Each
//   swatch reads "Color 3 of 6" (the theme only sends RGB). Optionally led by
//   the "Automatic" choice (the desktop picks the color, §4.12.6).
// - `SmallSwatch`: the `swatch.small` (16) dot of the "Move to group" lines.
// The group color is never text (§2.2): only the swatch fill.
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { Rgb } from "@/protocol";
import { Icon } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { rgbToCss, roundRadius, size, spacing, typeStyle, useTheme } from "@ui/theme";

/** The choice of a {@link SwatchRow}: a palette index, or `auto` (the desktop picks). */
export type SwatchValue = number | "auto";

export type SwatchRowProps = {
  /** The group palette (`groupPalette`); the index is what the action sends. */
  readonly palette: readonly Rgb[];
  /** The chosen swatch; an index out of the palette marks none. */
  readonly value: SwatchValue;
  readonly onChange: (value: SwatchValue) => void;
  /** Lead with the "Automatic" choice (New group). */
  readonly withAuto?: boolean;
  /** Already translated name of the choice, for the screen reader ("Color"). */
  readonly accessibilityLabel: string;
  /** The parts get `-auto` and `-<index>`. */
  readonly testID?: string;
};

/** A single choice of group color, one radio per swatch. */
export function SwatchRow({
  palette,
  value,
  onChange,
  withAuto = false,
  accessibilityLabel,
  testID = "swatches",
}: SwatchRowProps) {
  const { colors } = useTheme();
  const { t } = useT();
  const pressedStyle = (pressed: boolean): StyleProp<ViewStyle> =>
    pressed ? { backgroundColor: colors.bgPressed } : null;

  // A container, not an accessibility element, so each swatch stays its own
  // radio for the screen reader (see `RadioGroup`).
  return (
    <View
      accessible={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={styles.row}
      testID={testID}
    >
      {withAuto ? (
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel={t("new_group.auto_color")}
          accessibilityState={{ checked: value === "auto" }}
          onPress={() => onChange("auto")}
          style={({ pressed }) => [styles.autoTarget, pressedStyle(pressed)]}
          testID={`${testID}-auto`}
        >
          <View
            style={[
              styles.auto,
              value === "auto"
                ? { borderWidth: size.borderEmphasis, borderColor: colors.textTitle }
                : { borderWidth: size.borderWidth, borderColor: colors.borderField },
            ]}
          >
            {value === "auto" ? <Icon name="check" role="inline" color="textTitle" /> : null}
            <Text style={[typeStyle("body"), { color: colors.textBody }]}>{t("new_group.auto_color")}</Text>
          </View>
        </Pressable>
      ) : null}
      {palette.map((rgb, index) => {
        const chosen = value === index;
        return (
          <Pressable
            key={index}
            accessibilityRole="radio"
            accessibilityLabel={t("group_color.swatch", { index: index + 1, total: palette.length })}
            accessibilityState={{ checked: chosen }}
            onPress={() => onChange(index)}
            style={({ pressed }) => [styles.target, pressedStyle(pressed)]}
            testID={`${testID}-${index}`}
          >
            <View
              style={[
                styles.swatch,
                { backgroundColor: rgbToCss(rgb) },
                chosen ? { borderWidth: size.borderEmphasis, borderColor: colors.textTitle } : null,
              ]}
            >
              {chosen ? (
                <Icon name="check" role="inline" color="textTitle" testID={`${testID}-${index}-check`} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export type SmallSwatchProps = {
  /** A group color; `null` paints the `ungrouped` color ("No group"). */
  readonly rgb: Rgb | null;
  readonly testID?: string;
};

/** The 16 color dot of a group line; decorative. */
export function SmallSwatch({ rgb, testID }: SmallSwatchProps) {
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.small, { backgroundColor: rgb === null ? colors.ungrouped : rgbToCss(rgb) }]}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: size.targetGap,
    rowGap: size.targetGap,
  },
  target: {
    width: size.targetMin,
    height: size.targetMin,
    borderRadius: roundRadius(size.targetMin),
    alignItems: "center",
    justifyContent: "center",
  },
  swatch: {
    width: size.swatch,
    height: size.swatch,
    borderRadius: roundRadius(size.swatch),
    alignItems: "center",
    justifyContent: "center",
  },
  autoTarget: {
    minHeight: size.targetMin,
    borderRadius: roundRadius(size.targetMin),
    justifyContent: "center",
  },
  auto: {
    minHeight: size.swatch,
    borderRadius: roundRadius(size.swatch),
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.chipGap,
    paddingHorizontal: spacing.chipPaddingX,
  },
  small: {
    width: size.swatchSmall,
    height: size.swatchSmall,
    borderRadius: roundRadius(size.swatchSmall),
  },
});
