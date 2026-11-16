// SPDX-License-Identifier: GPL-3.0-or-later

// Pane tree helpers and the mini-layout of a tab (spec 03 section 4.1,
// PRD-002 RF-2.10). Pure: no React, no renderer. Rectangles are normalized to
// the unit square so the screen scales them to whatever box it draws.

import { type Pane, type PaneId, type PaneNode, SplitDir } from "../protocol";

/** The denominator of `split.ratio` (spec 03 section 4.1). */
export const RATIO_DENOMINATOR = 65536;

/** A pane of the tree placed in the unit square. */
export type PaneRect = {
  readonly pane: PaneId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** A leaf has the key `pane`; a split has `dir`. */
export function isPane(node: PaneNode): node is Pane {
  return "pane" in node;
}

/** The leaves of the tree, first child before second (reading order). */
export function leafPanes(node: PaneNode): readonly Pane[] {
  const out: Pane[] = [];
  const visit = (n: PaneNode): void => {
    if (isPane(n)) {
      out.push(n);
      return;
    }
    visit(n.first);
    visit(n.second);
  };
  visit(node);
  return out;
}

/** The pane with the given id, or `undefined` when the tree has none. */
export function findPane(node: PaneNode, id: PaneId): Pane | undefined {
  if (isPane(node)) {
    return node.pane === id ? node : undefined;
  }
  return findPane(node.first, id) ?? findPane(node.second, id);
}

/** Number of panes of the tree. */
export function paneCount(node: PaneNode): number {
  return isPane(node) ? 1 : paneCount(node.first) + paneCount(node.second);
}

/**
 * The rectangles of every leaf, in the unit square. `ratio / 65536` is the
 * fraction of the first child; `side-by-side` puts the first child on the
 * left and `stacked` on top. `gap` (in unit-square fractions of the whole)
 * is taken out of the split axis between the two children, so the mini-layout
 * can draw separators; it never makes a rectangle negative.
 */
export function layoutRects(node: PaneNode, gap = 0): readonly PaneRect[] {
  const out: PaneRect[] = [];
  const place = (n: PaneNode, x: number, y: number, w: number, h: number): void => {
    if (isPane(n)) {
      out.push({ pane: n.pane, x, y, width: w, height: h });
      return;
    }
    const ratio = n.ratio / RATIO_DENOMINATOR;
    if (n.dir === SplitDir.sideBySide) {
      const usable = Math.max(0, w - gap);
      const firstW = usable * ratio;
      place(n.first, x, y, firstW, h);
      place(n.second, x + firstW + (w - usable), y, usable - firstW, h);
    } else {
      const usable = Math.max(0, h - gap);
      const firstH = usable * ratio;
      place(n.first, x, y, w, firstH);
      place(n.second, x, y + firstH + (h - usable), w, usable - firstH);
    }
  };
  place(node, 0, 0, 1, 1);
  return out;
}

/** The pane under a point of the unit square (edges belong to the later pane). */
export function paneAtPoint(rects: readonly PaneRect[], x: number, y: number): PaneId | null {
  let hit: PaneId | null = null;
  for (const r of rects) {
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
      hit = r.pane;
    }
  }
  return hit;
}
