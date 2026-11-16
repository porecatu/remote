// SPDX-License-Identifier: GPL-3.0-or-later

// Paste confirmation (PRD-003 RF-3.17; spec 03 section 6: the host never asks,
// so the client decides before sending). Pure analysis of the text; the text
// itself must never reach the log.

export const DEFAULT_PREVIEW_LINES = 5;
export const DEFAULT_PREVIEW_LINE_CHARS = 120;

export type PasteOptions = {
  /** How many lines the preview shows. */
  previewLines?: number;
  /** Longer preview lines are cut to this many characters. */
  previewLineChars?: number;
};

export type PasteAnalysis = {
  /** True when the text has a line break: the app must confirm before sending. */
  needsConfirmation: boolean;
  /** Lines in the text; a single trailing break does not add an empty line. */
  totalLines: number;
  /** Characters (Unicode scalar values) in the whole text. */
  totalChars: number;
  /** First lines for the confirmation dialog, long ones cut. */
  previewLines: string[];
  /** Lines that the preview leaves out. */
  hiddenLines: number;
};

const LINE_BREAK = /\r\n|\r|\n/;

function cutChars(line: string, max: number): string {
  const chars = Array.from(line);
  return chars.length <= max ? line : chars.slice(0, max).join("");
}

/**
 * Confirmation is required whenever the text contains a line break, trailing
 * one included: "ls\n" would run the command the moment it is pasted.
 */
export function analyzePaste(text: string, options: PasteOptions = {}): PasteAnalysis {
  const previewCount = Math.max(0, options.previewLines ?? DEFAULT_PREVIEW_LINES);
  const lineChars = Math.max(1, options.previewLineChars ?? DEFAULT_PREVIEW_LINE_CHARS);

  const parts = text.split(LINE_BREAK);
  const needsConfirmation = parts.length > 1;
  if (needsConfirmation && parts[parts.length - 1] === "") {
    parts.pop();
  }

  const shown = parts.slice(0, previewCount).map((line) => cutChars(line, lineChars));
  const totalChars = Array.from(text).length;

  return {
    needsConfirmation,
    totalLines: parts.length,
    totalChars,
    previewLines: shown,
    hiddenLines: parts.length - shown.length,
  };
}
