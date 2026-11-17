// SPDX-License-Identifier: GPL-3.0-or-later
// The chrome button (anatomy §2.2, §2.3 `type.button`, §2.5 `button.height`,
// §2.6 `button.padding-x`, §4.13). The label arrives ready, already
// translated by the screen. Variants:
// - `primary`: `primary` background, `on.accent` label;
// - `secondary`: no background, `border.row` border, `text.body` label (the
//   dialog's Cancel, §4.13);
// - `text`: no background nor border, `accent.text` label;
// - `destructive`: the `secondary` shape with the `destructive` label;
// - `destructiveText`: the `text` shape with the `destructive` label (the
//   dialog's destructive button, "no background", §4.13).
// Pressing paints `bg.pressed` (`destructive.pressed` on the destructive
// variants); the anatomy has no pressed token for `primary`, which keeps its
// fill. The button grows with the system font (no cap: it is not a bar).
// The screen reader reads the label, unless `accessibilityLabel` says more
// than the visible text (the lock's "Unlock the app", §4.1).
import type { ComponentRef, Ref } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { radius, size, spacing, typeStyle, useTheme, type ColorToken } from "../theme";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "text" | "destructive" | "destructiveText";

/**
 * Width of the button: its content (`auto`), the whole container (`full`),
 * `button.wide` (240, empty and state screens) or `lock.button` (280, §4.1).
 */
export type ButtonWidth = "auto" | "full" | "wide" | "lock";

export type ButtonProps = {
  /** The label, already translated. */
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly width?: ButtonWidth;
  /** Not pressable, and announced as disabled. */
  readonly disabled?: boolean;
  /** A spinner in place of the label, keeping the width; not pressable, announced as busy. */
  readonly loading?: boolean;
  /** What the screen reader says instead of the label, already translated (default: the label). */
  readonly accessibilityLabel?: string;
  /** Extra screen reader hint (e.g. "destructive action", §4.12.9). */
  readonly accessibilityHint?: string;
  /** The pressable, to move the screen reader focus to it. */
  readonly ref?: Ref<ComponentRef<typeof Pressable>>;
  readonly testID?: string;
};

type Look = {
  readonly label: ColorToken;
  readonly background?: ColorToken;
  readonly border?: ColorToken;
  /** Background while pressed; the primary has no pressed token (§2.2). */
  readonly pressed?: ColorToken;
};

const looks: Record<ButtonVariant, Look> = {
  primary: { label: "onAccent", background: "primary" },
  secondary: { label: "textBody", border: "borderRow", pressed: "bgPressed" },
  text: { label: "accentText", pressed: "bgPressed" },
  destructive: { label: "destructive", border: "borderRow", pressed: "destructivePressed" },
  destructiveText: { label: "destructive", pressed: "destructivePressed" },
};

const widths: Record<ButtonWidth, ViewStyle> = {
  auto: {},
  full: { alignSelf: "stretch" },
  wide: { width: size.buttonWide },
  lock: { width: size.lockButton },
};

/** A chrome button with a ready label. */
export function Button({
  label,
  onPress,
  variant = "primary",
  width = "auto",
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityHint,
  ref,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const look = looks[variant];
  const inactive = disabled || loading;
  // A disabled primary loses its fill: `bg.pressed` under a `text.disabled` label.
  const background = disabled && variant === "primary" ? "bgPressed" : look.background;
  const labelColor = disabled ? "textDisabled" : look.label;

  return (
    <Pressable
      {...(ref === undefined ? {} : { ref })}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      {...(testID === undefined ? {} : { testID })}
      style={({ pressed }): StyleProp<ViewStyle> => [
        {
          minHeight: size.buttonHeight,
          paddingHorizontal: spacing.buttonPaddingX,
          borderRadius: radius.control,
          alignItems: "center",
          justifyContent: "center",
        },
        widths[width],
        background === undefined ? null : { backgroundColor: colors[background] },
        look.border === undefined ? null : { borderWidth: size.borderWidth, borderColor: colors[look.border] },
        pressed && !inactive && look.pressed !== undefined ? { backgroundColor: colors[look.pressed] } : null,
      ]}
    >
      {/* The label keeps its place while loading, so the width does not jump. */}
      <Text
        style={[
          typeStyle("button"),
          { color: colors[labelColor], textAlign: "center" },
          loading ? { opacity: 0 } : null,
        ]}
      >
        {label}
      </Text>
      {loading ? (
        <View
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" }}
        >
          <Spinner
            color={variant === "primary" ? "onAccent" : "accent"}
            {...(testID === undefined ? {} : { testID: `${testID}-spinner` })}
          />
        </View>
      ) : null}
    </Pressable>
  );
}
