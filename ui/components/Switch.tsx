// SPDX-License-Identifier: GPL-3.0-or-later
// The settings switch (anatomy §4.4.1): track `primary` on and `border.field`
// off, thumb `switch.thumb`. It is the platform switch colored by tokens, so
// its size and motion are the system's. The component only asks for a change
// (`onValueChange` with the wanted value): a screen that must confirm first
// (turning the app lock off asks for unlock, RF-1.18) keeps `value` until it
// is allowed, and the switch stays where it was.
import { Switch as NativeSwitch } from "react-native";

import { useTheme } from "../theme";
import { ListRow } from "./ListRow";

export type SwitchProps = {
  readonly value: boolean;
  /** The wanted value; the screen decides whether `value` follows. */
  readonly onValueChange: (next: boolean) => void;
  /** Already translated name of what the switch turns on. */
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  /** Inside a row the row is the element the screen reader reads. */
  readonly decorative?: boolean;
  readonly testID?: string;
};

/** A token-colored on/off switch, announced as a switch with its state. */
export function Switch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
  decorative = false,
  testID,
}: SwitchProps) {
  const { colors } = useTheme();
  return (
    <NativeSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: colors.borderField, true: colors.primary }}
      thumbColor={colors.switchThumb}
      ios_backgroundColor={colors.borderField}
      {...(decorative
        ? {
            accessible: false,
            importantForAccessibility: "no-hide-descendants" as const,
            accessibilityElementsHidden: true,
          }
        : {
            accessibilityRole: "switch" as const,
            accessibilityLabel,
            accessibilityState: { checked: value, disabled },
          })}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}

export type SwitchRowProps = {
  /** Name of the setting (`type.body`). */
  readonly title: string;
  /** Description under the name (`type.secondary`, `text.secondary`). */
  readonly description?: string;
  readonly value: boolean;
  /** The wanted value; the screen decides whether `value` follows. */
  readonly onValueChange: (next: boolean) => void;
  readonly disabled?: boolean;
  readonly testID?: string;
};

/**
 * A settings row with a switch at the right. The whole row is one switch for
 * the screen reader (name, description as hint, on/off state), and a touch
 * anywhere on it asks for the opposite value.
 */
export function SwitchRow({
  title,
  description,
  value,
  onValueChange,
  disabled = false,
  testID,
}: SwitchRowProps) {
  return (
    <ListRow
      title={title}
      titleVariant="body"
      {...(description === undefined
        ? {}
        : { subtitle: description, wrapSubtitle: true, accessibilityHint: description })}
      accessibilityLabel={title}
      accessibilityRole="switch"
      checked={value}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      trailing={
        <Switch
          value={value}
          onValueChange={onValueChange}
          accessibilityLabel={title}
          disabled={disabled}
          decorative
        />
      }
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
