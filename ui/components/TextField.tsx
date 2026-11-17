// SPDX-License-Identifier: GPL-3.0-or-later
// The text field (anatomy §2.5 `field.height`, §2.6 `field.padding-x` and
// `form.gap`, §4.3.3, §4.12.3): label, a 48 field on `bg.field` with the
// `border.field` border (`border.focus` when focused, `error` on error), and a
// help line that holds the help text or the error, and the counter ("52/64")
// once the length reaches the threshold. Reaching the threshold is announced
// to the screen reader once (§4.3.3).
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ReturnKeyTypeOptions,
} from "react-native";

import { t } from "@/i18n/catalog";

import { radius, size, spacing, typeStyle, useTheme } from "../theme";

export type TextFieldProps = {
  /** Already translated name of the field; also its screen reader label. */
  readonly label: string;
  /** Show the label above the field (`type.section`); default true. */
  readonly labelVisible?: boolean;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder?: string;
  /** Help line under the field (`type.secondary`). */
  readonly helper?: string;
  /** Error under the field, in place of the help line. */
  readonly error?: string;
  /** Maximum length, enforced by the field. */
  readonly maxLength?: number;
  /** Length from which the counter shows (needs `maxLength`). */
  readonly counterThreshold?: number;
  readonly autoCorrect?: boolean;
  readonly autoCapitalize?: "none" | "sentences" | "words" | "characters";
  readonly autoFocus?: boolean;
  /** Select the whole text when focused (rename starts with the text selected). */
  readonly selectTextOnFocus?: boolean;
  readonly editable?: boolean;
  readonly returnKeyType?: ReturnKeyTypeOptions;
  readonly onSubmitEditing?: () => void;
  readonly testID?: string;
};

/** Whether the counter shows for this length. */
export function counterVisible(
  length: number,
  maxLength: number | undefined,
  threshold: number | undefined,
): boolean {
  return maxLength !== undefined && threshold !== undefined && length >= threshold;
}

/** A labeled text field with help line, error and length counter. */
export function TextField({
  label,
  labelVisible = true,
  value,
  onChangeText,
  placeholder,
  helper,
  error,
  maxLength,
  counterThreshold,
  autoCorrect,
  autoCapitalize,
  autoFocus,
  selectTextOnFocus,
  editable = true,
  returnKeyType,
  onSubmitEditing,
  testID,
}: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const showCounter = counterVisible(value.length, maxLength, counterThreshold);
  const counterParams = { count: value.length, max: maxLength ?? 0 };
  const counterA11y = t("field.counter_a11y", counterParams);

  // Announce the counter once when the length reaches the threshold.
  const wasShown = useRef(showCounter);
  useEffect(() => {
    if (showCounter && !wasShown.current) {
      AccessibilityInfo.announceForAccessibility(counterA11y);
    }
    wasShown.current = showCounter;
  }, [showCounter, counterA11y]);

  const supportText = error ?? helper;
  const borderColor =
    error !== undefined ? colors.error : focused ? colors.borderFocus : colors.borderField;
  const hint = [supportText, showCounter ? counterA11y : undefined]
    .filter((part): part is string => part !== undefined)
    .join(t("a11y.separator"));

  return (
    <View style={styles.container} {...(testID === undefined ? {} : { testID })}>
      {labelVisible ? (
        <Text
          accessible={false}
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={[typeStyle("section"), { color: colors.textSection }]}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        {...(hint === "" ? {} : { accessibilityHint: hint })}
        accessibilityState={{ disabled: !editable }}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={editable}
        {...(placeholder === undefined ? {} : { placeholder })}
        placeholderTextColor={colors.textTertiary}
        {...(maxLength === undefined ? {} : { maxLength })}
        {...(autoCorrect === undefined ? {} : { autoCorrect })}
        {...(autoCapitalize === undefined ? {} : { autoCapitalize })}
        {...(autoFocus === undefined ? {} : { autoFocus })}
        {...(selectTextOnFocus === undefined ? {} : { selectTextOnFocus })}
        {...(returnKeyType === undefined ? {} : { returnKeyType })}
        {...(onSubmitEditing === undefined ? {} : { onSubmitEditing: () => onSubmitEditing() })}
        selectionColor={colors.accent}
        style={[
          typeStyle("body"),
          styles.input,
          {
            backgroundColor: colors.bgField,
            borderColor,
            color: editable ? colors.textBody : colors.textDisabled,
          },
        ]}
        {...(testID === undefined ? {} : { testID: `${testID}-input` })}
      />
      {supportText !== undefined || showCounter ? (
        <View style={styles.support}>
          {supportText === undefined ? (
            <View style={styles.supportText} />
          ) : (
            <Text
              accessibilityLiveRegion={error === undefined ? "none" : "polite"}
              style={[
                typeStyle("secondary"),
                styles.supportText,
                { color: error === undefined ? colors.textSecondary : colors.errorText },
              ]}
            >
              {supportText}
            </Text>
          )}
          {showCounter ? (
            <Text
              accessibilityLabel={counterA11y}
              style={[typeStyle("chip"), { color: colors.textSecondary }]}
              {...(testID === undefined ? {} : { testID: `${testID}-counter` })}
            >
              {t("field.counter", counterParams)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    rowGap: spacing.formGap,
  },
  input: {
    minHeight: size.fieldHeight,
    paddingHorizontal: spacing.fieldPaddingX,
    borderWidth: size.borderWidth,
    borderRadius: radius.control,
  },
  support: {
    flexDirection: "row",
    alignItems: "flex-start",
    columnGap: spacing.formGap,
  },
  supportText: {
    flex: 1,
  },
});
