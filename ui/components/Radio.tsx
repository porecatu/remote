// SPDX-License-Identifier: GPL-3.0-or-later
// Single choice (anatomy §2.5 `radio`, §4.4.1 Language, §4.12.8 New tab): a
// group with the `radiogroup` role and rows with the `radio` role. The ring is
// `border.emphasis`, `accent` when chosen and `border.field` when not, with an
// `accent` dot; the chosen row also takes `bg.selected`. Exactly one row is
// checked: the one whose value is the group's value.
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { roundRadius, size, useTheme } from "../theme";
import { ListRow } from "./ListRow";

export type RadioProps = {
  readonly checked: boolean;
  readonly testID?: string;
};

/** The drawn radio: ring and, when checked, the inner dot. Not focusable. */
export function Radio({ checked, testID }: RadioProps) {
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.ring, { borderColor: checked ? colors.accent : colors.borderField }]}
      {...(testID === undefined ? {} : { testID })}
    >
      {checked ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
    </View>
  );
}

/** One choice of a {@link RadioGroup}. */
export type RadioOption<V extends string> = {
  readonly value: V;
  /** Already translated name of the choice (`type.row-title`). */
  readonly title: string;
  readonly subtitle?: string;
  /** Right after the title (profile type chip). */
  readonly titleAccessory?: ReactNode;
  /** End of line 1 (the "Default" mark). */
  readonly titleEnd?: ReactNode;
  /** Label for the screen reader; default: the title. */
  readonly accessibilityLabel?: string;
  readonly disabled?: boolean;
  readonly testID?: string;
};

export type RadioGroupProps<V extends string> = {
  /** Already translated name of the group ("Profile", "Language"). */
  readonly accessibilityLabel: string;
  readonly options: readonly RadioOption<V>[];
  /** The chosen value; `null` when nothing is chosen yet. */
  readonly value: V | null;
  readonly onChange: (value: V) => void;
  readonly testID?: string;
};

/**
 * A single choice list: a `radiogroup` of `radio` rows.
 *
 * The group carries the role and its name but is deliberately **not** an
 * accessibility element (`accessible={false}`): an accessible view is a leaf
 * for VoiceOver, which would read the group as one element and hide its
 * radios. Each radio is reached on its own, with its role and checked state.
 */
export function RadioGroup<V extends string>({
  accessibilityLabel,
  options,
  value,
  onChange,
  testID,
}: RadioGroupProps<V>) {
  return (
    <View
      accessible={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      {...(testID === undefined ? {} : { testID })}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <ListRow
            key={option.value}
            title={option.title}
            {...(option.subtitle === undefined ? {} : { subtitle: option.subtitle })}
            {...(option.titleAccessory === undefined ? {} : { titleAccessory: option.titleAccessory })}
            {...(option.titleEnd === undefined ? {} : { titleEnd: option.titleEnd })}
            leading={<Radio checked={checked} />}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.title}
            checked={checked}
            selected={checked}
            disabled={option.disabled ?? false}
            onPress={() => {
              if (!checked) {
                onChange(option.value);
              }
            }}
            {...(option.testID === undefined ? {} : { testID: option.testID })}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: size.radio,
    height: size.radio,
    borderRadius: roundRadius(size.radio),
    borderWidth: size.borderEmphasis,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: size.radioDot,
    height: size.radioDot,
    borderRadius: roundRadius(size.radioDot),
  },
});
