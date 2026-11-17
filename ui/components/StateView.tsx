// SPDX-License-Identifier: GPL-3.0-or-later
// The state screen and the empty state (anatomy §4.2, §4.3.4, §4.5.3, §4.14):
// a 48 icon (`icon.state`, `text.tertiary` or a semantic color), the title
// (`type.screen-title`, a header for the screen reader), the body
// (`type.body`, `text.secondary`) and the actions. The actions come from the
// screen as elements (its buttons); there is always a way out, a button or
// back.
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing, typeStyle, useTheme, type ColorToken } from "../theme";
import { Icon, type IconName } from "./Icon";

export type StateViewProps = {
  readonly icon: IconName;
  /** Icon color; default `textTertiary` (`error`, `warning`, `success` for results). */
  readonly iconColor?: ColorToken;
  /** Already translated title. */
  readonly title: string;
  /** Already translated body (up to four lines in the anatomy). */
  readonly body?: string;
  /** The screen's buttons, primary first. */
  readonly actions?: ReactNode;
  readonly testID?: string;
};

/** A centered state: icon, title, body and actions. */
export function StateView({
  icon,
  iconColor = "textTertiary",
  title,
  body,
  actions,
  testID,
}: StateViewProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.container} {...(testID === undefined ? {} : { testID })}>
      <Icon
        name={icon}
        role="state"
        color={iconColor}
        {...(testID === undefined ? {} : { testID: `${testID}-icon` })}
      />
      <View style={styles.text}>
        <Text
          accessibilityRole="header"
          style={[typeStyle("screenTitle"), styles.centered, { color: colors.textTitle }]}
        >
          {title}
        </Text>
        {body === undefined ? null : (
          <Text style={[typeStyle("body"), styles.centered, { color: colors.textSecondary }]}>
            {body}
          </Text>
        )}
      </View>
      {actions === undefined ? null : <View style={styles.actions}>{actions}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.statePaddingX,
    rowGap: spacing.stateBlockGap,
  },
  text: {
    alignItems: "center",
    rowGap: spacing.stateGap,
  },
  centered: {
    textAlign: "center",
  },
  actions: {
    alignItems: "center",
    rowGap: spacing.buttonGap,
  },
});
