// SPDX-License-Identifier: GPL-3.0-or-later
// An icon in a touch target (anatomy §2.5 `target.min`, §5 items 1 and 2):
// 48 × 48 as a rule, 44 × 44 only in the key context. The screen reader
// label is mandatory, since the icon itself is hidden from it.
import type { Ref } from "react";
import { Pressable, type HostInstance, type StyleProp, type ViewStyle } from "react-native";

import { radius, size, useTheme, type ColorToken, type IconRole } from "../theme";
import { Icon, type IconName } from "./Icon";

/** `default`: the 48 target; `key`: the 44 floor, only in the key context (§4.8). */
export type IconButtonTarget = "default" | "key";

export type IconButtonProps = {
  readonly icon: IconName;
  /** What the screen reader says, already translated (mandatory, §5 item 2). */
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  /** Icon size and stroke by role (§2.7); default `bar` (24). */
  readonly role?: IconRole;
  /** Icon color token; default `textBody`. */
  readonly color?: ColorToken;
  readonly target?: IconButtonTarget;
  /** Chosen or on (`bg.selected`), announced as selected. */
  readonly selected?: boolean;
  /** Not pressable, `text.disabled` icon, announced as disabled. */
  readonly disabled?: boolean;
  readonly accessibilityHint?: string;
  readonly testID?: string;
  /** The button's element: the origin a sheet or dialog opened from it gives the focus back to. */
  readonly ref?: Ref<HostInstance>;
};

/** A labelled icon button with the minimum touch target. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  role = "bar",
  color = "textBody",
  target = "default",
  selected,
  disabled = false,
  accessibilityHint,
  testID,
  ref,
}: IconButtonProps) {
  const { colors } = useTheme();
  const side = target === "key" ? size.targetFloor : size.targetMin;

  return (
    <Pressable
      {...(ref === undefined ? {} : { ref })}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      {...(testID === undefined ? {} : { testID })}
      style={({ pressed }): StyleProp<ViewStyle> => [
        {
          width: side,
          height: side,
          borderRadius: radius.control,
          alignItems: "center",
          justifyContent: "center",
        },
        selected === true ? { backgroundColor: colors.bgSelected } : null,
        pressed && !disabled ? { backgroundColor: colors.bgPressed } : null,
      ]}
    >
      <Icon name={icon} role={role} color={disabled ? "textDisabled" : color} />
    </Pressable>
  );
}
