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
  /** Set on `Shift`, `Ctrl` and `Alt` only: the look of the state (§4.8). */
  readonly modifierState?: ModifierState;
  /** Set on `Fn` only: the F keys are open. Looks armed (without the underline) and says "expanded". */
  readonly open?: boolean;
  /** Takes an equal share of the row instead of a fixed 44 width (row 1 of the bar, §4.8). */
  readonly grow?: boolean;
  readonly onPress: () => void;
  /** Touch start and end, for the keys that repeat while held. */
  readonly onPressIn?: () => void;
  readonly onPressOut?: () => void;
  readonly testID?: string;
};

/** A key of the special-keys bar. */
export function KeyBarKey(props: KeyBarKeyProps) {
  const { accessibilityLabel, modifierState, open, grow = false, onPress, onPressIn, onPressOut, testID } = props;
  const { colors } = useTheme();
  const armed = modifierState === "once" || modifierState === "locked";
  const engaged = armed || open === true;

  return (
    <Pressable
      onPress={onPress}
      {...(onPressIn === undefined ? {} : { onPressIn })}
      {...(onPressOut === undefined ? {} : { onPressOut })}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      {...(open === undefined ? {} : { accessibilityState: { expanded: open } })}
      {...(testID === undefined ? {} : { testID })}
      style={({ pressed }): StyleProp<ViewStyle> => [
        {
          // A growing key shares the row; it may be narrower than 44 on a
          // narrow phone, and its padding gives way to the label.
          ...(grow ? { flex: 1, minWidth: 0 } : { minWidth: size.key }),
          height: size.key,
          paddingHorizontal: grow ? spacing.keyPaddingXGrow : spacing.keyPaddingX,
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
            armed ? { textDecorationLine: "underline" } : null,
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
