// SPDX-License-Identifier: GPL-3.0-or-later
// Paste with a preview (anatomy §4.11, §4.14; PRD-003 RF-3.17, RF-3.24,
// RF-3.25). Text with no line break goes straight as `paste`; text with any
// line break, a single trailing one included, waits for a central dialog:
//
// - title "Paste N lines?";
// - the preview in mono 12 on a `bg.field` card: the first 5 lines, each cut
//   at 120 characters with an ellipsis; control characters shown in caret
//   notation (`^[`), so an escape sequence cannot hide; a line of more than
//   1000 characters carries the "line too long" warning;
// - "and N more lines · M characters" under it;
// - Cancel (initial focus) and Paste (primary). Paste is disabled while the
//   pane is not `running`;
// - the screen reader hears the title, the summary ("12 lines, 412
//   characters") and the preview lines as plain text.
//
// An empty clipboard is a snackbar; a refused input (too large, invalid
// text, pane not running) is a snackbar from the catalog
// (`useInputRefusalToasts`). The pasted text is never logged: it lives in
// the terminal controller's closure and in this dialog while it is open.
// The dialog is live (`openDialog({ useProps })`): Paste follows the pane, the
// texts follow the language, and it closes when the controller drops the paste.
import { useCallback, useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { OverlayOwner } from "@/controllers/overlay";
import type { PasteRequestResult, TerminalSession, TerminalState } from "@/controllers/terminalSession";
import type { MessageKey, Translator } from "@/i18n/catalog";
import { type PasteAnalysis, DEFAULT_PREVIEW_LINE_CHARS, analyzePaste } from "@/input/paste";
import type { InputRefusal } from "@/input/send";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useT } from "@ui/i18n/LocaleProvider";
import {
  overlayApi,
  useOverlay,
  useOverlayController,
  type AppOverlayController,
  type DialogProps,
  type FocusOrigin,
  type OverlayControls,
} from "@ui/overlay";
import { useOverlayFrame } from "@ui/overlay/OverlayProvider";
import { useServices } from "@ui/services/ServicesContext";
import { radius, spacing, type as typeTokens, typeStyle, useTheme } from "@ui/theme";

/** A preview line over this many characters carries the "line too long" warning (§4.11). */
export const LONG_LINE_CHARS = 1000;

const LINE_BREAK = /\r\n|\r|\n/;

/** One line of the preview, ready to show. */
export type PastePreviewLine = {
  /** The line as shown: cut, control characters in caret notation. */
  readonly text: string;
  /** The line was longer than the preview shows: an ellipsis follows it. */
  readonly cut: boolean;
  /** The line has more than `LONG_LINE_CHARS` characters. */
  readonly tooLong: boolean;
};

/** What the paste dialog shows. Lives only in the screen's memory. */
export type PastePreview = {
  readonly totalLines: number;
  readonly totalChars: number;
  /** Lines the preview leaves out. */
  readonly hiddenLines: number;
  readonly lines: readonly PastePreviewLine[];
};

/**
 * Shows the control characters of a line in caret notation: C0 as `^@`…`^_`
 * (ESC is `^[`), DEL as `^?`, and C1 as the escape it stands for (CSI, 0x9b,
 * is `^[[`). The tab stays: it is visible as space and hides nothing.
 */
export function showControlCharacters(line: string): string {
  let out = "";
  for (const char of line) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x09) {
      out += char;
    } else if (code < 0x20) {
      out += `^${String.fromCharCode(code + 0x40)}`;
    } else if (code === 0x7f) {
      out += "^?";
    } else if (code >= 0x80 && code <= 0x9f) {
      out += `^[${String.fromCharCode(code - 0x40)}`;
    } else {
      out += char;
    }
  }
  return out;
}

/**
 * The preview of a paste: `analysis` (the controller's, or computed here)
 * gives the counts and the cut lines; the text gives which lines were cut
 * and which are too long.
 */
export function pastePreview(text: string, analysis: PasteAnalysis = analyzePaste(text)): PastePreview {
  const source = text.split(LINE_BREAK);
  return {
    totalLines: analysis.totalLines,
    totalChars: analysis.totalChars,
    hiddenLines: analysis.hiddenLines,
    lines: analysis.previewLines.map((line, index) => {
      const length = Array.from(source[index] ?? line).length;
      return {
        text: showControlCharacters(line),
        cut: length > DEFAULT_PREVIEW_LINE_CHARS,
        tooLong: length > LONG_LINE_CHARS,
      };
    }),
  };
}

/** The catalog message of an input refusal (RF-3.25), or null when it says nothing (empty text). */
export function inputRefusalMessageKey(code: InputRefusal): MessageKey | null {
  switch (code) {
    case "too-large":
      return "toast.input_too_large";
    case "invalid-text":
      return "toast.input_invalid";
    case "not-running":
    case "not-subscribed":
      return "error.pane-not-running";
    case "empty":
      return null;
  }
}

/** "and N more lines · M characters", or only "M characters" when nothing is left out. */
export function pasteFooterText(preview: PastePreview, tr: Translator): string {
  const chars = tr.tn("paste.char_count", preview.totalChars);
  if (preview.hiddenLines === 0) {
    return chars;
  }
  return tr.t("paste.footer", { more: tr.tn("paste.more_lines", preview.hiddenLines), chars });
}

/** What the screen reader hears for the preview: the summary, then the lines as plain text. */
export function pasteAccessibilityText(preview: PastePreview, tr: Translator): string {
  const parts = [tr.tn("paste.summary", preview.totalLines, { chars: preview.totalChars })];
  for (const line of preview.lines) {
    parts.push(line.tooLong ? tr.t("a11y.label_value", { label: line.text, value: tr.t("paste.line_too_long") }) : line.text);
  }
  return parts.join(tr.t("a11y.separator"));
}

export type PasteDialogOptions = {
  readonly preview: PastePreview;
  /** The pane is `running` and subscribed (`canType`); otherwise Paste is disabled. */
  readonly canPaste: boolean;
  readonly onPaste: () => void;
  readonly onCancel: () => void;
  /** Default `paste-dialog`; buttons get `-cancel` and `-paste`, the preview `-preview`. */
  readonly testID?: string;
};

/** The preview card and the summary under it. */
function PasteBody({ preview, testID }: { readonly preview: PastePreview; readonly testID: string }) {
  const tr = useT();
  const { colors } = useTheme();
  return (
    <View style={styles.body}>
      <View
        accessible
        accessibilityLabel={pasteAccessibilityText(preview, tr)}
        testID={`${testID}-preview`}
        style={[styles.preview, { backgroundColor: colors.bgField }]}
      >
        {preview.lines.map((line, index) => (
          <View key={index}>
            <Text style={[typeStyle("monoSecondary"), styles.line, { color: colors.textBody }]}>
              {line.cut ? tr.t("paste.line_cut", { line: line.text }) : line.text}
            </Text>
            {line.tooLong ? (
              <Text style={[typeStyle("secondary"), { color: colors.warningText }]}>
                {tr.t("paste.line_too_long")}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      <Text
        accessible={false}
        importantForAccessibility="no"
        accessibilityElementsHidden
        testID={`${testID}-footer`}
        style={[typeStyle("secondary"), { color: colors.textSecondary }]}
      >
        {pasteFooterText(preview, tr)}
      </Text>
    </View>
  );
}

/** The props of the paste confirmation dialog in a language. */
export function pasteDialogProps(
  { preview, canPaste, onPaste, onCancel, testID = "paste-dialog" }: PasteDialogOptions,
  tr: Translator,
): DialogProps {
  return {
    title: tr.tn("paste.title", preview.totalLines),
    body: <PasteBody preview={preview} testID={testID} />,
    buttons: [
      { label: tr.t("common.cancel"), role: "cancel", onPress: onCancel, testID: `${testID}-cancel` },
      {
        label: tr.t("common.paste"),
        variant: "primary",
        onPress: onPaste,
        disabled: !canPaste,
        testID: `${testID}-paste`,
      },
    ],
    testID,
  };
}

/** What the paste flow reads and calls on the terminal controller. */
export type PasteTerminal = Pick<TerminalSession, "store" | "pasteRequest" | "pasteConfirm" | "pasteCancel">;

export type OpenPasteDialogOptions = {
  readonly terminal: Pick<PasteTerminal, "store" | "pasteConfirm" | "pasteCancel">;
  readonly preview: PastePreview;
  /** The session's owner (`sessionOwner(desktopId)`), so the dialog closes with the session. */
  readonly owner?: OverlayOwner;
  /** The element that started the paste: it gets the screen reader focus back. */
  readonly origin?: FocusOrigin;
};

const selectCanType = (state: TerminalState): boolean => state.canType;
const selectWaiting = (state: TerminalState): boolean => state.paste !== null;

/** The dialog's props, read at every render: the pane, the language, the waiting paste. */
function usePasteDialogProps(
  { terminal, preview }: Pick<OpenPasteDialogOptions, "terminal" | "preview">,
  { close }: OverlayControls,
): DialogProps {
  const tr = useT();
  const canPaste = useStoreState(terminal.store, selectCanType);
  const waiting = useStoreState(terminal.store, selectWaiting);
  const { closing } = useOverlayFrame();
  // The controller dropped the paste (another pane, the tab closed): nothing to confirm.
  useEffect(() => {
    if (!waiting && !closing) {
      close();
    }
  }, [waiting, closing, close]);
  return pasteDialogProps(
    {
      preview,
      canPaste,
      onPaste: () => {
        terminal.pasteConfirm();
      },
      onCancel: () => {
        terminal.pasteCancel();
      },
    },
    tr,
  );
}

/**
 * Opens the paste dialog over a terminal controller with a paste waiting
 * (`pasteRequest` answered `needsConfirmation`). Paste follows the
 * controller's `canType` while open; Paste calls `pasteConfirm`, and Cancel,
 * the back button or the end of the session call `pasteCancel`. Returns the
 * dialog id.
 */
export function openPasteDialog(controller: AppOverlayController, options: OpenPasteDialogOptions): string {
  const { terminal, preview, owner, origin } = options;
  return overlayApi(controller).openDialog({
    // Cancel and the back button call `pasteCancel` through the Cancel button.
    useProps: (controls) => usePasteDialogProps({ terminal, preview }, controls),
    ...(owner === undefined ? {} : { owner }),
    ...(origin === undefined ? {} : { origin }),
    onClose: (reason) => {
      if (reason === "owner") {
        terminal.pasteCancel();
      }
    },
  });
}

export type PasteFlowOptions = {
  readonly owner?: OverlayOwner;
  readonly origin?: FocusOrigin;
};

export type PasteFlow = {
  /** Pastes `text`: straight away without a line break, else after the dialog. */
  paste(text: string): PasteRequestResult;
  /** Reads the clipboard and pastes it; an empty clipboard is a snackbar. */
  pasteFromClipboard(): Promise<void>;
};

/** The paste of the terminal screen: the key bar's Paste, the system paste menu. */
export function usePasteFlow(terminal: PasteTerminal, options: PasteFlowOptions = {}): PasteFlow {
  const { clipboard } = useServices();
  const controller = useOverlayController();
  const overlay = useOverlay();
  const { t } = useT();
  const { owner, origin } = options;

  const paste = useCallback(
    (text: string): PasteRequestResult => {
      const result = terminal.pasteRequest(text);
      if (result.needsConfirmation) {
        openPasteDialog(controller, {
          terminal,
          preview: pastePreview(text, result.analysis),
          ...(owner === undefined ? {} : { owner }),
          ...(origin === undefined ? {} : { origin }),
        });
      }
      return result;
    },
    [terminal, controller, owner, origin],
  );

  const pasteFromClipboard = useCallback(async (): Promise<void> => {
    let text = "";
    try {
      text = await clipboard.getString();
    } catch {
      // An unreadable clipboard has nothing to paste, for the user as for the app.
      text = "";
    }
    if (text.length === 0) {
      overlay.showToast(t("paste.clipboard_empty"));
      return;
    }
    paste(text);
  }, [clipboard, overlay, t, paste]);

  return useMemo(() => ({ paste, pasteFromClipboard }), [paste, pasteFromClipboard]);
}

/**
 * Turns every `input-refused` event of the terminal controller (typing, keys,
 * paste) into a snackbar from the catalog (RF-3.25). Empty text says nothing.
 */
export function useInputRefusalToasts(terminal: Pick<TerminalSession, "onEvent">): void {
  const overlay = useOverlay();
  const { t } = useT();
  useEffect(
    () =>
      terminal.onEvent((event) => {
        if (event.type !== "input-refused") {
          return;
        }
        const key = inputRefusalMessageKey(event.code);
        if (key !== null) {
          overlay.showToast(t(key), { severity: "error" });
        }
      }),
    [terminal, overlay, t],
  );
}

const styles = StyleSheet.create({
  body: {
    rowGap: spacing.formGap,
  },
  preview: {
    padding: spacing.cardPadding,
    borderRadius: radius.card,
  },
  line: {
    // An empty line keeps its height.
    minHeight: typeTokens.monoSecondary.lineHeight,
  },
});
