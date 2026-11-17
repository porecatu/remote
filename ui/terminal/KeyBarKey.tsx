// SPDX-License-Identifier: GPL-3.0-or-later
// One key of the special-keys bar (anatomy §4.8): a 44 × 44 button (the
// `target.min` floor, for lack of height), mono 13/500 label or an 18 icon,
// `bg.key`, `bg.key.pressed` while pressed. A modifier shows its three states
// without relying on color: armed has `bg.selected`, a 2 `accent` border and
// an underlined label; locked adds the 10 `lock` in the corner.
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { ModifierState } from "@/input/modifiers";

import { Icon, type IconName } from "../components/Icon";
import { barMaxFontScale, radius, size, spacing, typeStyle, useTheme } from "../theme";

/** What the key shows: a mono label or a key icon. */
export type KeyBarKeyFace = { readonly label: string } | { readonly icon: IconName };

export type KeyBarKeyProps = KeyBarKeyFace & {
  /** What the screen reader says, already translated (with the state of a modifier). */
  readonly accessibilityLabel: string;
  /** Set on `Ctrl` and `Alt` only: the look of the state (§4.8). */
  readonly modifierState?: ModifierState;
  readonly onPress: () => void;
  /** Touch start and end, for the keys that repeat while held. */
  readonly onPressIn?: () => void;
  readonly onPressOut?: () => void;
  readonly testID?: string;
};

/** A key of the special-keys bar. */
export function KeyBarKey(props: KeyBarKeyProps) {
  const { accessibilityLabel, modifierState, onPress, onPressIn, onPressOut, testID } = props;
  const { colors } = useTheme();
  const engaged = modifierState === "once" || modifierState === "locked";

  return (
    <Pressable
      onPress={onPress}
      {...(onPressIn === undefined ? {} : { onPressIn })}
      {...(onPressOut === undefined ? {} : { onPressOut })}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      {...(testID === undefined ? {} : { testID })}
      style={({ pressed }): StyleProp<ViewStyle> => [
        {
          minWidth: size.key,
          height: size.key,
          paddingHorizontal: spacing.keyPaddingX,
          borderRadius: radius.control,
          // The border is always there (transparent when released), so arming
          // a modifier does not move its label.
          borderWidth: size.borderEmphasis,
          borderColor: engaged ? colors.accent : "transparent",
          backgroundColor: engaged ? colors.bgSelected : colors.bgKey,
          alignItems: "center",
          justifyContent: "center",
        },
        pressed ? { backgroundColor: colors.bgKeyPressed } : null,
      ]}
    >
      {"label" in props ? (
        <Text
          maxFontSizeMultiplier={barMaxFontScale}
          numberOfLines={1}
          style={[
            typeStyle("key"),
            { color: engaged ? colors.textTitle : colors.textBody },
            engaged ? { textDecorationLine: "underline" } : null,
          ]}
        >
          {props.label}
        </Text>
      ) : (
        <Icon name={props.icon} role="key" color="textBody" />
      )}
      {modifierState === "locked" ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 0, right: 0 }}
          testID={testID === undefined ? undefined : `${testID}-lock`}
        >
          <Icon name="lock" role="lock" color="textTitle" />
        </View>
      ) : null}
    </Pressable>
  );
}
