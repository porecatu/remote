// SPDX-License-Identifier: GPL-3.0-or-later
// The arrow pad (anatomy §4.7, PRD-003 RF-3.15): the four arrows as an
// inverted T (↑ over ← ↓ →), an opaque panel stuck to the top edge of the key
// bar at its right, so it reads as an extension of the bar. In landscape, where
// the bar is a single row, the arrows are one row of four (← ↓ ↑ →).
//
// The panel is `bg.bar` with a `border.row` on its top and left, the top left
// corner rounded, keys of 44 with a margin of 4 and a gap of 6. Each arrow
// fires at the touch and repeats while held (the same repeat as the bar had).
// It goes inside the grid area, not inside the bar: on Android a touch outside
// the parent's bounds never reaches the child.
//
// The pad sends nothing itself: keys go to `onKey` (the terminal controller
// adds the armed modifiers).
import { StyleSheet, View } from "react-native";

import type { MessageKey } from "@/i18n/catalog";
import { ARROW_PAD_LAYOUT, type KeyBarKeyId } from "@/input/keyBar";

import type { IconName } from "../components/Icon";
import { useT } from "../i18n/LocaleProvider";
import { radius, size, spacing, useTheme } from "../theme";
import { RepeatKey, useKeyTick } from "./keyParts";

export type ArrowPadProps = {
  readonly onKey: (id: KeyBarKeyId) => void;
  /** Landscape: one row of four instead of the T. */
  readonly landscape?: boolean;
  /** Default `arrowpad`; the arrows get `-up`, `-left`, `-down`, `-right`. */
  readonly testID?: string;
};

type ArrowId = "left" | "down" | "up" | "right";

const ARROWS: Readonly<Record<ArrowId, { readonly icon: IconName; readonly a11y: MessageKey }>> = {
  left: { icon: "arrow-left", a11y: "keybar.a11y.left" },
  down: { icon: "arrow-down", a11y: "keybar.a11y.down" },
  up: { icon: "arrow-up", a11y: "keybar.a11y.up" },
  right: { icon: "arrow-right", a11y: "keybar.a11y.right" },
};

/** The arrows of the pad. */
export function ArrowPad({ onKey, landscape = false, testID = "arrowpad" }: ArrowPadProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const tick = useKeyTick();

  const fire = (id: ArrowId) => (repeat: boolean) => {
    if (!repeat) {
      tick();
    }
    onKey(id);
  };
  const arrow = (id: ArrowId) => (
    <RepeatKey
      key={id}
      icon={ARROWS[id].icon}
      accessibilityLabel={t(ARROWS[id].a11y)}
      onFire={fire(id)}
      testID={`${testID}-${id}`}
    />
  );

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={t("keybar.arrows_group")}
      testID={testID}
      style={[
        styles.pad,
        {
          backgroundColor: colors.bgBar,
          borderColor: colors.borderRow,
        },
      ]}
    >
      {landscape ? (
        <View style={styles.row}>{(["left", "down", "up", "right"] as const).map(arrow)}</View>
      ) : (
        <>
          <View style={[styles.row, styles.top]}>{arrow(ARROW_PAD_LAYOUT.top)}</View>
          <View style={styles.row}>{ARROW_PAD_LAYOUT.bottom.map(arrow)}</View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    position: "absolute",
    right: 0,
    bottom: 0,
    padding: spacing.keyMargin,
    rowGap: spacing.keyGap,
    borderTopWidth: size.borderWidth,
    borderLeftWidth: size.borderWidth,
    borderTopLeftRadius: radius.control,
  },
  row: {
    flexDirection: "row",
    columnGap: spacing.keyGap,
  },
  // The top arrow sits over the middle key of the bottom row.
  top: {
    justifyContent: "center",
  },
});
