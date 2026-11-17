// SPDX-License-Identifier: GPL-3.0-or-later
// The pressable list row (anatomy §2.5 `row.single`/`row.double`, §2.6, §4.2,
// §4.4.1, §4.5.2). For the screen reader the whole row is one element with a
// composed label, and its secondary actions are custom actions: long press is
// only a shortcut, never the only way (§5 item 2). A row with a pending action
// is dimmed to `opacity.pending` and takes no touch until the result (RF-4.9).
import type { ReactNode, Ref } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type AccessibilityState,
  type HostInstance,
} from "react-native";

import { useT } from "../i18n/LocaleProvider";
import { opacity, size, spacing, typeStyle, useTheme, type ColorToken } from "../theme";

/** A screen reader custom action of a row ("Rename", "Remove"). */
export type ListRowAction<A extends string = string> = {
  readonly name: A;
  /** Already translated label, read by the screen reader. */
  readonly label: string;
};

export type ListRowProps<A extends string = string> = {
  /** Line 1: one line, ellipsized. */
  readonly title: string;
  /** `row`: `type.row-title` (desktop, tab); `body`: `type.body` (settings, choices). */
  readonly titleVariant?: "row" | "body";
  /** Right after the title on line 1 (profile badge). */
  readonly titleAccessory?: ReactNode;
  /** At the end of line 1 (status label, "active on the desktop" icon, panes chip). */
  readonly titleEnd?: ReactNode;
  /** Line 2; with it the row is `row.double`, without it `row.single`. */
  readonly subtitle?: string;
  /** `mono` for `user@host`, `cwd` (`type.mono-secondary`). */
  readonly subtitleFont?: "system" | "mono";
  /** Color of line 2; default `textSecondary`. */
  readonly subtitleColor?: ColorToken;
  /** Line 2 wraps instead of ending in an ellipsis (settings description). */
  readonly wrapSubtitle?: boolean;
  /** At the end of line 2 (state chips). */
  readonly subtitleEnd?: ReactNode;
  /** Left of the text: an icon or the indicator slot. */
  readonly leading?: ReactNode;
  /** Right of the text: chevron, switch, menu button, spinner. */
  readonly trailing?: ReactNode;
  /** `tab`: tab row paddings (`tab-row.padding-x`, `tab-row.gap`). */
  readonly density?: "default" | "tab";
  /** Composed label of the whole row ("Casa, online, relay …"). */
  readonly accessibilityLabel: string;
  /** What the default action does ("Open"). */
  readonly accessibilityHint?: string;
  readonly accessibilityRole?: "button" | "switch" | "radio";
  /** State of a `switch` or `radio` row. */
  readonly checked?: boolean;
  readonly accessibilityActions?: readonly ListRowAction<A>[];
  readonly onAccessibilityAction?: (name: A) => void;
  readonly onPress?: () => void;
  /** A shortcut to what the custom actions or a visible button already offer. */
  readonly onLongPress?: () => void;
  readonly disabled?: boolean;
  /** An action on this item awaits its result: dimmed, no touch, no actions. */
  readonly pending?: boolean;
  /** `bg.selected`: chosen item, tab active on the desktop. */
  readonly selected?: boolean;
  readonly testID?: string;
  /** The row's element: the origin a sheet or dialog opened from it gives the focus back to. */
  readonly ref?: Ref<HostInstance>;
};

/** A list row of one or two lines, one element for the screen reader. */
export function ListRow<A extends string = string>({
  title,
  titleVariant = "row",
  titleAccessory,
  titleEnd,
  subtitle,
  subtitleFont = "system",
  subtitleColor = "textSecondary",
  wrapSubtitle = false,
  subtitleEnd,
  leading,
  trailing,
  density = "default",
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = "button",
  checked,
  accessibilityActions,
  onAccessibilityAction,
  onPress,
  onLongPress,
  disabled = false,
  pending = false,
  selected = false,
  testID,
  ref,
}: ListRowProps<A>) {
  const { t } = useT();
  const { colors } = useTheme();
  const inactive = disabled || pending;
  const label = pending
    ? `${accessibilityLabel}${t("a11y.separator")}${t("a11y.pending")}`
    : accessibilityLabel;
  const state: AccessibilityState = {
    disabled: inactive,
    ...(pending ? { busy: true } : {}),
    ...(accessibilityRole !== "button" && checked !== undefined ? { checked } : {}),
  };
  const actions = pending ? undefined : accessibilityActions;
  const handleAction =
    actions === undefined || actions.length === 0 || onAccessibilityAction === undefined
      ? undefined
      : (event: AccessibilityActionEvent) => {
          const action = actions.find((candidate) => candidate.name === event.nativeEvent.actionName);
          if (action !== undefined) {
            onAccessibilityAction(action.name);
          }
        };
  const titleColor = disabled
    ? colors.textDisabled
    : titleVariant === "row"
      ? colors.textTitle
      : colors.textBody;
  const lineTwoColor = disabled ? colors.textDisabled : colors[subtitleColor];
  const hasSubtitle = subtitle !== undefined;
  const tab = density === "tab";

  return (
    <Pressable
      {...(ref === undefined ? {} : { ref })}
      accessible
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      accessibilityState={state}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      {...(actions === undefined || actions.length === 0
        ? {}
        : { accessibilityActions: actions.map(({ name, label: actionLabel }) => ({ name, label: actionLabel })) })}
      {...(handleAction === undefined ? {} : { onAccessibilityAction: handleAction })}
      {...(onPress === undefined ? {} : { onPress })}
      {...(onLongPress === undefined ? {} : { onLongPress })}
      disabled={inactive}
      style={({ pressed }) => [
        styles.row,
        tab ? styles.rowTab : styles.rowDefault,
        hasSubtitle ? styles.double : styles.single,
        {
          backgroundColor: pressed
            ? colors.bgPressed
            : selected
              ? colors.bgSelected
              : "transparent",
        },
        pending ? styles.pending : null,
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      {leading === undefined ? null : <View>{leading}</View>}
      <View style={styles.content}>
        <View style={styles.line}>
          <View style={styles.lineStart}>
            <Text
              numberOfLines={1}
              style={[
                typeStyle(titleVariant === "row" ? "rowTitle" : "body"),
                styles.shrink,
                { color: titleColor },
              ]}
            >
              {title}
            </Text>
            {titleAccessory}
          </View>
          {titleEnd}
        </View>
        {hasSubtitle ? (
          <View style={styles.line}>
            <View style={styles.lineStart}>
              <Text
                {...(wrapSubtitle ? {} : { numberOfLines: 1 })}
                style={[
                  typeStyle(subtitleFont === "mono" ? "monoSecondary" : "secondary"),
                  styles.shrink,
                  { color: lineTwoColor },
                ]}
              >
                {subtitle}
              </Text>
            </View>
            {subtitleEnd}
          </View>
        ) : null}
      </View>
      {trailing === undefined ? null : <View>{trailing}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.rowPaddingY,
  },
  rowDefault: {
    paddingHorizontal: spacing.rowPaddingX,
    columnGap: spacing.rowIconGap,
  },
  rowTab: {
    paddingHorizontal: spacing.tabRowPaddingX,
    columnGap: spacing.tabRowGap,
  },
  single: {
    minHeight: size.rowSingle,
  },
  double: {
    minHeight: size.rowDouble,
  },
  pending: {
    opacity: opacity.pending,
  },
  content: {
    flex: 1,
    rowGap: spacing.rowLineGap,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.rowInlineGap,
  },
  lineStart: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.rowInlineGap,
  },
  shrink: {
    flexShrink: 1,
  },
});
