// SPDX-License-Identifier: GPL-3.0-or-later
// The miniature of a tab's pane layout (anatomy §4.9, §2.5 `thumbnail.ratio`,
// §2.6 `thumbnail.padding`; PRD-002 RF-2.10): the `layout` (splits, `dir`,
// `ratio`) drawn in a 16:10 box, each pane a rectangle with a `border.row`
// border. The pane on screen gets `bg.selected`, the others the terminal
// background; the pane focused on the desktop gets a `border.emphasis`
// `accent` border and a `monitor` (`icon.thumb`) in its corner. Each
// rectangle holds the pane title (`type.secondary`, cut) after a status dot.
//
// Decorative for the screen reader (hidden on both platforms): the pane list
// of the picker carries the same information and is the guaranteed control,
// since a pane with a small `ratio` can be smaller than a touch target here.
// A touch on a rectangle still picks its pane.
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { Translator } from "@/i18n/catalog";
import { type Pane, type PaneId, type PaneNode, type PaneState, PaneState as PaneStates } from "@/protocol";
import { layoutRects, leafPanes } from "@/workspace/layout";
import { Icon, StatusDot } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { size, spacing, thumbnailAspectRatio, typeStyle, useTheme, type ColorToken } from "@ui/theme";

/** The title of a pane, or "Pane N" (its 1-based reading position) when it has none. */
export function paneTitle(pane: Pick<Pane, "title">, index: number, tr: Translator): string {
  return pane.title.trim().length > 0 ? pane.title : tr.t("panes.untitled", { index });
}

/**
 * The color of a pane's status dot: `success` while it runs, the colors of
 * the tree's state chips otherwise (§4.5.2): `error` for a non-zero exit,
 * `warning` while it waits for the desktop, `accent` while it connects.
 */
export function paneStateDotColor(state: PaneState, exit: number | null): ColorToken {
  switch (state) {
    case PaneStates.running:
      return "success";
    case PaneStates.exited:
      return exit === null || exit === 0 ? "textTertiary" : "error";
    case PaneStates.connecting:
    case PaneStates.reconnecting:
      return "accent";
    case PaneStates.awaitingDesktop:
      return "warning";
    case PaneStates.notStarted:
    case PaneStates.disconnected:
      return "textTertiary";
  }
}

export type PaneLayoutThumbnailProps = {
  /** The pane tree of the tab. */
  readonly layout: PaneNode;
  /** The pane on screen in the app. */
  readonly viewedPaneId: PaneId | null;
  /** The pane focused on the desktop (the app never changes it). */
  readonly focusedPaneId: PaneId | null;
  readonly onSelect: (pane: PaneId) => void;
  /** Background of the panes not on screen: the desktop theme's `bg`; default the `bg.terminal` fallback. */
  readonly terminalBackground?: string;
  /** Default `pane-thumbnail`; each pane gets `-<pane id>`, and `-<pane id>-focused` for the monitor. */
  readonly testID?: string;
};

/** The 16:10 miniature of the pane layout, hidden from the screen reader. */
export function PaneLayoutThumbnail({
  layout,
  viewedPaneId,
  focusedPaneId,
  onSelect,
  terminalBackground,
  testID = "pane-thumbnail",
}: PaneLayoutThumbnailProps) {
  const tr = useT();
  const { colors } = useTheme();
  const panes = leafPanes(layout);
  const rects = layoutRects(layout);
  const background = terminalBackground ?? colors.bgTerminal;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      testID={testID}
      style={styles.box}
    >
      {rects.map((rect) => {
        const index = panes.findIndex((pane) => pane.pane === rect.pane);
        const pane = panes[index];
        if (pane === undefined) {
          return null;
        }
        const viewed = pane.pane === viewedPaneId;
        const focused = pane.pane === focusedPaneId;
        return (
          <Pressable
            key={pane.pane}
            onPress={() => {
              onSelect(pane.pane);
            }}
            testID={`${testID}-${pane.pane}`}
            style={({ pressed }): StyleProp<ViewStyle> => [
              styles.pane,
              {
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
                backgroundColor: pressed ? colors.bgPressed : viewed ? colors.bgSelected : background,
              },
              focused
                ? { borderWidth: size.borderEmphasis, borderColor: colors.accent }
                : { borderWidth: size.borderWidth, borderColor: colors.borderRow },
            ]}
          >
            {focused ? (
              <View style={styles.corner}>
                <Icon name="monitor" role="thumb" color="accent" testID={`${testID}-${pane.pane}-focused`} />
              </View>
            ) : null}
            <View style={styles.label}>
              <StatusDot color={paneStateDotColor(pane.state, pane.exit)} />
              <Text numberOfLines={1} style={[typeStyle("secondary"), styles.title, { color: colors.textTitle }]}>
                {paneTitle(pane, index + 1, tr)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: "100%",
    aspectRatio: thumbnailAspectRatio,
    overflow: "hidden",
  },
  pane: {
    position: "absolute",
    padding: spacing.thumbnailPadding,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    top: spacing.thumbnailPadding,
    right: spacing.thumbnailPadding,
  },
  label: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.chipGap,
  },
  title: {
    flex: 1,
    minWidth: 0,
  },
});
