// SPDX-License-Identifier: GPL-3.0-or-later
// The minimal accessibility of the grid (anatomy §4.7, ADR-0002 debt): one
// element over the canvas whose value sums up the last non-empty lines of the
// live grid. Computed only while a screen reader is on, at most every 2 s,
// and never logged.
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

import type { GridModel } from "@/grid/gridModel";

import { lineText } from "./lineRecording";

/** Lines in the summary: the anatomy asks for the last 5 to 10 non-empty ones. */
export const A11Y_SUMMARY_LINES = 5;

/** The summary is refreshed at most this often (anatomy §4.7: "no máximo a cada 2 s"). */
export const A11Y_SUMMARY_INTERVAL_MS = 2000;

/** The last `count` non-empty lines of the live grid, top to bottom, one per line. */
export function gridSummary(grid: GridModel | null, count: number = A11Y_SUMMARY_LINES): string {
  if (grid === null) {
    return "";
  }
  const lines: string[] = [];
  for (let row = grid.rowsCount - 1; row >= 0 && lines.length < count; row -= 1) {
    const line = grid.lineAt(row);
    const text = line === undefined ? "" : lineText(line).trim();
    if (text.length > 0) {
      lines.push(text);
    }
  }
  return lines.reverse().join("\n");
}

/** Whether a screen reader (VoiceOver, TalkBack) is on, live. */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled().then(
      (value) => {
        if (active) {
          setEnabled(value);
        }
      },
      () => undefined,
    );
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", (value) => {
      setEnabled(value);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}
