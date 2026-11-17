// SPDX-License-Identifier: GPL-3.0-or-later
// The floating buttons of the grid (anatomy §4.7; PRD-003 RF-3.7, RF-3.8,
// RF-3.12): `fab` 44 round buttons, `bg.bar` at `opacity.fab` with a
// `border.row` border and `shadow.fab`, stacked `fab.gap` apart in the bottom
// right corner of the grid, `fab.inset` from its right and bottom edges (the
// grid ends above the key bar). From top to bottom, each only when it applies:
//
// - `scan` "Fit the width": the zoom is not the fit one; it applies fit the
//   width (decision 7 of this implementation);
// - `locate-fixed` "Follow the cursor": the grid is wider than the screen; a
//   toggle, on in `bg.selected` with an `accent` border of `border.emphasis`;
// - `arrow-down-to-line` "Back to the end": the user is off the bottom.
//
// The drawn 44 gets its touch area widened to `target.min` (§5 item 1). Data
// and callbacks only: the screen reads them from the grid's state.
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Icon, type IconName } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { opacity, roundRadius, shadow, size, spacing, useTheme, withAlpha } from "@ui/theme";

export type FloatingButtonsProps = {
  /** The view is at the bottom of the live grid (`TerminalGridState.atBottom`). */
  readonly atBottom: boolean;
  /** The zoom is "fit the width" (`TerminalGridState.isFit`). */
  readonly isFit: boolean;
  /** The grid is wider than the screen (`TerminalGridState.wide`). */
  readonly wide: boolean;
  /** "Follow the cursor" is on (`TerminalGridState.followingCursor`). */
  readonly followingCursor: boolean;
  readonly onFitWidth: () => void;
  /** Receives the new state of the toggle. */
  readonly onFollowCursor: (on: boolean) => void;
  readonly onScrollToBottom: () => void;
  /** Default `fab`; the buttons get `-fit`, `-follow`, `-bottom`. */
  readonly testID?: string;
};

/** Widens the 44 drawn button to the 48 target (§5 item 1). */
const fabSlop = (size.targetMin - size.fab) / 2;

type FabProps = {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  /** Present on a toggle: its state. */
  readonly on?: boolean;
  readonly testID: string;
};

function Fab({ icon, label, onPress, on, testID }: FabProps) {
  const { colors } = useTheme();
  const toggle = on !== undefined;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={fabSlop}
      accessibilityRole={toggle ? "togglebutton" : "button"}
      accessibilityLabel={label}
      {...(toggle ? { accessibilityState: { checked: on } } : {})}
      testID={testID}
      style={({ pressed }): StyleProp<ViewStyle> => [
        styles.fab,
        on === true
          ? { backgroundColor: colors.bgSelected, borderColor: colors.accent, borderWidth: size.borderEmphasis }
          : { backgroundColor: withAlpha(colors.bgBar, opacity.fab), borderColor: colors.borderRow },
        pressed ? { backgroundColor: colors.bgPressed } : null,
      ]}
    >
      <Icon name={icon} role="fab" color="textBody" />
    </Pressable>
  );
}

/** The stack of floating buttons over the bottom right corner of the grid. */
export function FloatingButtons({
  atBottom,
  isFit,
  wide,
  followingCursor,
  onFitWidth,
  onFollowCursor,
  onScrollToBottom,
  testID = "fab",
}: FloatingButtonsProps) {
  const { t } = useT();
  if (isFit && !wide && atBottom) {
    return null;
  }
  return (
    <View style={styles.stack} pointerEvents="box-none" testID={testID}>
      {isFit ? null : (
        <Fab icon="scan" label={t("terminal.fit_width")} onPress={onFitWidth} testID={`${testID}-fit`} />
      )}
      {wide ? (
        <Fab
          icon="locate-fixed"
          label={t("terminal.follow_cursor")}
          on={followingCursor}
          onPress={() => {
            onFollowCursor(!followingCursor);
          }}
          testID={`${testID}-follow`}
        />
      ) : null}
      {atBottom ? null : (
        <Fab
          icon="arrow-down-to-line"
          label={t("terminal.scroll_to_bottom")}
          onPress={onScrollToBottom}
          testID={`${testID}-bottom`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    right: spacing.fabInset,
    bottom: spacing.fabInset,
    rowGap: spacing.fabGap,
  },
  fab: {
    width: size.fab,
    height: size.fab,
    borderRadius: roundRadius(size.fab),
    borderWidth: size.borderWidth,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: [shadow.fab],
  },
});
