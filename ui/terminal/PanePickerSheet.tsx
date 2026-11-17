// SPDX-License-Identifier: GPL-3.0-or-later
// The pane picker (anatomy §4.9; PRD-002 RF-2.10, PRD-003 RF-3.3): a bottom
// sheet titled "Panes of <tab>", with the subtitle "N panes · the desktop
// focus does not change", the 16:10 miniature of the layout and the list of
// the panes in the tree's reading order. Each list row (`row.single`, or
// `row.double` with the `cwd`) shows the pane's position (`type.body`,
// `text.secondary`), its title, its `cwd` in mono, the state chip of the
// tree (§4.5.2) and, in words, "focused on the desktop" (with a `monitor`)
// and "viewed here". The list is the guaranteed control; the miniature is
// decorative for the screen reader.
//
// A touch on a row or a rectangle picks the pane (the screen subscribes it,
// cancelling the old subscription, RF-3.3) and closes the sheet. The desktop
// focus never changes (spec §7).
//
// `PanePickerSheet` takes data and callbacks; `openPanePicker` opens it over
// a terminal controller, following its state while open.
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { OverlayOwner } from "@/controllers/overlay";
import type { TerminalSession, TerminalState } from "@/controllers/terminalSession";
import type { Translator } from "@/i18n/catalog";
import type { Pane, PaneId, PaneNode } from "@/protocol";
import { leafPanes } from "@/workspace/layout";
import { Chip, Icon, ListRow, Spinner } from "@ui/components";
import { shallowEqual, useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import { Sheet, type FocusOrigin, type OverlayApi } from "@ui/overlay";
import { tabStateChip, tabStateText } from "@ui/model/tabState";
import { space, spacing, typeStyle, useTheme } from "@ui/theme";

import { PaneLayoutThumbnail, paneTitle } from "./PaneLayoutThumbnail";

export type PanePickerSheetProps = {
  /** The tab title, for the sheet title. */
  readonly tabTitle: string;
  /** The pane tree of the tab (`TerminalState.layout`). */
  readonly layout: PaneNode;
  /** The pane on screen (`TerminalState.paneId`). */
  readonly viewedPaneId: PaneId | null;
  /** The pane focused on the desktop (`TerminalState.focusedPaneId`). */
  readonly focusedPaneId: PaneId | null;
  /** A pane was picked; the sheet closes right after. */
  readonly onSelect: (pane: PaneId) => void;
  /** Closes the sheet (from `openSheet`'s controls). */
  readonly close: () => void;
  /** The desktop theme's `bg`, for the panes of the miniature not on screen. */
  readonly terminalBackground?: string;
  /** Default `pane-picker`; rows get `-row-<pane id>`, the miniature `-thumbnail`. */
  readonly testID?: string;
};

/** The composed label of a pane row: title, state, `cwd`, then the marks. */
export function paneRowAccessibilityLabel(
  pane: Pane,
  index: number,
  marks: { readonly viewed: boolean; readonly focused: boolean },
  tr: Translator,
): string {
  const parts = [paneTitle(pane, index, tr), tabStateText(pane.state, pane.exit, tr)];
  if (pane.cwd !== null && pane.cwd.length > 0) {
    parts.push(pane.cwd);
  }
  if (marks.focused) {
    parts.push(tr.t("panes.focused_on_desktop"));
  }
  if (marks.viewed) {
    parts.push(tr.t("panes.viewed_here"));
  }
  return parts.join(tr.t("a11y.separator"));
}

/** The marks at the end of a pane row, in words (never only color, §1 principle 3). */
function PaneMarks({ viewed, focused, testID }: { viewed: boolean; focused: boolean; testID: string }) {
  const { t } = useT();
  const { colors } = useTheme();
  if (!viewed && !focused) {
    return null;
  }
  const text = [typeStyle("chip"), { color: colors.textSecondary }];
  return (
    <View style={styles.marks}>
      {focused ? (
        <View style={styles.mark} testID={`${testID}-focused`}>
          <Icon name="monitor" role="chip" color="accent" />
          <Text style={text}>{t("panes.focused_on_desktop")}</Text>
        </View>
      ) : null}
      {viewed ? (
        <Text style={text} testID={`${testID}-viewed`}>
          {t("panes.viewed_here")}
        </Text>
      ) : null}
    </View>
  );
}

/** The sheet that switches the pane on screen. */
export function PanePickerSheet({
  tabTitle,
  layout,
  viewedPaneId,
  focusedPaneId,
  onSelect,
  close,
  terminalBackground,
  testID = "pane-picker",
}: PanePickerSheetProps) {
  const tr = useT();
  const { colors } = useTheme();
  const panes = leafPanes(layout);
  const pick = (pane: PaneId) => {
    close();
    onSelect(pane);
  };

  return (
    <Sheet
      title={tr.t("panes.title", { title: tabTitle })}
      subtitle={tr.tn("panes.subtitle", panes.length)}
      testID={testID}
    >
      <View style={styles.thumbnail}>
        <PaneLayoutThumbnail
          layout={layout}
          viewedPaneId={viewedPaneId}
          focusedPaneId={focusedPaneId}
          onSelect={pick}
          {...(terminalBackground === undefined ? {} : { terminalBackground })}
          testID={`${testID}-thumbnail`}
        />
      </View>
      {panes.map((pane, position) => {
        const index = position + 1;
        const viewed = pane.pane === viewedPaneId;
        const focused = pane.pane === focusedPaneId;
        const chip = tabStateChip(pane.state, pane.exit, tr);
        const rowID = `${testID}-row-${pane.pane}`;
        const hasCwd = pane.cwd !== null && pane.cwd.length > 0;
        return (
          <ListRow
            key={pane.pane}
            title={paneTitle(pane, index, tr)}
            {...(hasCwd && pane.cwd !== null ? { subtitle: pane.cwd, subtitleFont: "mono" as const } : {})}
            leading={
              <Text style={[typeStyle("body"), { color: colors.textSecondary }]}>{String(index)}</Text>
            }
            {...(chip === null
              ? {}
              : {
                  subtitleEnd: (
                    <Chip
                      label={chip.label}
                      color={chip.color}
                      leading={
                        chip.leading.kind === "spinner"
                          ? { kind: "node", node: <Spinner /> }
                          : chip.leading
                      }
                      testID={`${rowID}-state`}
                    />
                  ),
                })}
            trailing={<PaneMarks viewed={viewed} focused={focused} testID={rowID} />}
            selected={viewed}
            accessibilityLabel={paneRowAccessibilityLabel(pane, index, { viewed, focused }, tr)}
            onPress={() => {
              pick(pane.pane);
            }}
            testID={rowID}
          />
        );
      })}
    </Sheet>
  );
}

/** What `openPanePicker` reads and calls on the terminal controller. */
export type PanePickerTerminal = Pick<TerminalSession, "store" | "selectPane">;

export type OpenPanePickerOptions = {
  readonly terminal: PanePickerTerminal;
  /** The tab title, for the sheet title. */
  readonly tabTitle: string;
  /** The session's owner (`sessionOwner(desktopId)`), so the sheet closes with the session. */
  readonly owner?: OverlayOwner;
  /** The pane chip of the bar: it gets the screen reader focus back. */
  readonly origin?: FocusOrigin;
  readonly terminalBackground?: string;
};

type LiveSelection = Pick<TerminalState, "layout" | "paneId" | "focusedPaneId" | "tabGone">;

const selectLive = (state: TerminalState): LiveSelection => ({
  layout: state.layout,
  paneId: state.paneId,
  focusedPaneId: state.focusedPaneId,
  tabGone: state.tabGone,
});

type LivePanePickerProps = Omit<OpenPanePickerOptions, "owner" | "origin"> & { readonly close: () => void };

function LivePanePicker({ terminal, tabTitle, terminalBackground, close }: LivePanePickerProps) {
  const live = useStoreState(terminal.store, selectLive, shallowEqual);
  // The tab went away under the sheet: nothing to pick, the sheet closes.
  const layout = live.tabGone === null ? live.layout : null;
  const gone = layout === null;
  useEffect(() => {
    if (gone) {
      close();
    }
  }, [gone, close]);
  if (layout === null) {
    return <Sheet title={tabTitle} testID="pane-picker" />;
  }
  return (
    <PanePickerSheet
      tabTitle={tabTitle}
      layout={layout}
      viewedPaneId={live.paneId}
      focusedPaneId={live.focusedPaneId}
      onSelect={(pane) => {
        terminal.selectPane(pane);
      }}
      close={close}
      {...(terminalBackground === undefined ? {} : { terminalBackground })}
    />
  );
}

/**
 * Opens the pane picker over a terminal controller: the sheet follows the
 * controller's panes and their states while it is open, and a pick calls
 * `selectPane`. Returns the sheet id.
 */
export function openPanePicker(overlay: OverlayApi, options: OpenPanePickerOptions): string {
  const { owner, origin, ...props } = options;
  return overlay.openSheet(({ close }) => <LivePanePicker {...props} close={close} />, {
    ...(owner === undefined ? {} : { owner }),
    ...(origin === undefined ? {} : { origin }),
  });
}

const styles = StyleSheet.create({
  thumbnail: {
    paddingHorizontal: spacing.sheetPaddingX,
    // The design's 12 between the miniature and the list: one `space.scale` step.
    paddingBottom: space.m,
  },
  marks: {
    alignItems: "flex-end",
    rowGap: spacing.rowLineGap,
  },
  mark: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.chipGap,
  },
});
