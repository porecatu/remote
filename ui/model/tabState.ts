// SPDX-License-Identifier: GPL-3.0-or-later
// The state of a pane as the chrome shows it (anatomy §4.5.2): the words of
// the state, for the composed labels, and the chip at the end of a line. The
// tree's tab rows, the terminal bar and the pane picker share it, so it lives
// outside the screens. Pure: no React.
import type { Translator } from "@/i18n/catalog";
import { type PaneState, PaneState as PaneStates } from "@/protocol";
import type { IconName } from "@ui/components";
import type { ColorToken } from "@ui/theme";

/** How the state chip of a tab looks; `running` has none. */
export type TabStateChip = {
  readonly label: string;
  /** An icon, or the spinner of `connecting`/`reconnecting`. */
  readonly leading:
    | { readonly kind: "icon"; readonly name: IconName; readonly color: ColorToken }
    | { readonly kind: "spinner" };
  /** Text color. */
  readonly color: ColorToken;
};

/**
 * The words of a pane state, for the composed label and the chip ("exited 0",
 * "not started"). `running` is only read by the screen reader.
 */
export function tabStateText(state: PaneState, exit: number | null, tr: Translator): string {
  switch (state) {
    case PaneStates.running:
      return tr.t("workspace.tab_state.running");
    case PaneStates.exited:
      // The desktop always sends the code of an exited pane; without one the
      // chip says only that it ended.
      return exit === null ? tr.t("pane_state.exited") : tr.t("workspace.tab_state.exited", { code: exit });
    case PaneStates.notStarted:
      return tr.t("workspace.tab_state.not_started");
    case PaneStates.connecting:
    case PaneStates.reconnecting:
      // Anatomy §4.5.2: both read "connecting…" with the spinner.
      return tr.t("workspace.tab_state.connecting");
    case PaneStates.disconnected:
      return tr.t("workspace.tab_state.disconnected");
    case PaneStates.awaitingDesktop:
      return tr.t("workspace.tab_state.awaiting_desktop");
  }
}

/** The chip at the end of line 2 for the state of the focused pane (§4.5.2). */
export function tabStateChip(state: PaneState, exit: number | null, tr: Translator): TabStateChip | null {
  const label = tabStateText(state, exit, tr);
  switch (state) {
    case PaneStates.running:
      return null;
    case PaneStates.exited:
      return exit === 0
        ? { label, leading: { kind: "icon", name: "circle-check", color: "textSecondary" }, color: "textSecondary" }
        : { label, leading: { kind: "icon", name: "circle-x", color: "error" }, color: "errorText" };
    case PaneStates.notStarted:
      return { label, leading: { kind: "icon", name: "circle-dashed", color: "textSecondary" }, color: "textSecondary" };
    case PaneStates.connecting:
    case PaneStates.reconnecting:
      return { label, leading: { kind: "spinner" }, color: "textSecondary" };
    case PaneStates.disconnected:
      return { label, leading: { kind: "icon", name: "unplug", color: "textSecondary" }, color: "textSecondary" };
    case PaneStates.awaitingDesktop:
      return { label, leading: { kind: "icon", name: "monitor", color: "warning" }, color: "warningText" };
  }
}
