// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Draws a QR matrix in a terminal. `modules` is what `toqr` returns: a square,
 * one byte per module, `1` for dark. Each text row carries two module rows
 * (upper half block, foreground = top, background = bottom), with a white quiet
 * zone, in explicit ANSI colors so it scans on a dark or a light terminal.
 */

const QUIET_ZONE = 2;
const BLACK_FG = "\u001b[30m";
const WHITE_FG = "\u001b[97m";
const BLACK_BG = "\u001b[40m";
const WHITE_BG = "\u001b[107m";
const RESET = "\u001b[0m";

export function renderQr(modules: Uint8Array): string {
  const size = Math.round(Math.sqrt(modules.length));
  if (size * size !== modules.length || size === 0) {
    throw new RangeError("not a square matrix");
  }
  const total = size + 2 * QUIET_ZONE;
  const dark = (row: number, col: number): boolean => {
    const r = row - QUIET_ZONE;
    const c = col - QUIET_ZONE;
    return r >= 0 && r < size && c >= 0 && c < size && modules[r * size + c] === 1;
  };
  const rows: string[] = [];
  for (let row = 0; row < total; row += 2) {
    let text = "";
    for (let col = 0; col < total; col++) {
      const top = dark(row, col);
      const bottom = dark(row + 1, col);
      text += `${top ? BLACK_FG : WHITE_FG}${bottom ? BLACK_BG : WHITE_BG}▀`;
    }
    rows.push(`${text}${RESET}`);
  }
  return rows.join("\n");
}
