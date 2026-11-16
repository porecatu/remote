// SPDX-License-Identifier: GPL-3.0-or-later

import { SplitDir } from "../protocol";
import {
  RATIO_DENOMINATOR,
  findPane,
  isPane,
  layoutRects,
  leafPanes,
  paneAtPoint,
  paneCount,
} from "./layout";
import { pane, roundTrip, split, tab, win, workspace } from "./testing";

describe("pane tree", () => {
  const tree = split(
    SplitDir.sideBySide,
    32768,
    pane(1),
    split(SplitDir.stacked, 16384, pane(2), pane(3)),
  );

  it("lists leaves in reading order", () => {
    expect(leafPanes(tree).map((p) => p.pane)).toEqual([1, 2, 3]);
    expect(paneCount(tree)).toBe(3);
  });

  it("tells a leaf from a split and finds a pane", () => {
    expect(isPane(pane(1))).toBe(true);
    expect(isPane(tree)).toBe(false);
    expect(findPane(tree, 3)?.pane).toBe(3);
    expect(findPane(tree, 9)).toBeUndefined();
  });

  it("survives the codec, so the fixture is a valid wire tree", () => {
    const ws = workspace([win(1, [tab(1, { layout: tree, focused: 1 })])]);
    expect(roundTrip(ws)).toEqual(ws);
  });
});

describe("layoutRects", () => {
  it("gives a single pane the whole square", () => {
    expect(layoutRects(pane(7))).toEqual([{ pane: 7, x: 0, y: 0, width: 1, height: 1 }]);
  });

  it("splits side by side with the first child on the left", () => {
    const rects = layoutRects(split(SplitDir.sideBySide, RATIO_DENOMINATOR / 4, pane(1), pane(2)));
    expect(rects).toEqual([
      { pane: 1, x: 0, y: 0, width: 0.25, height: 1 },
      { pane: 2, x: 0.25, y: 0, width: 0.75, height: 1 },
    ]);
  });

  it("splits stacked with the first child on top", () => {
    const rects = layoutRects(split(SplitDir.stacked, RATIO_DENOMINATOR / 2, pane(1), pane(2)));
    expect(rects).toEqual([
      { pane: 1, x: 0, y: 0, width: 1, height: 0.5 },
      { pane: 2, x: 0, y: 0.5, width: 1, height: 0.5 },
    ]);
  });

  it("nests splits inside the rectangle of their parent", () => {
    const tree = split(
      SplitDir.sideBySide,
      RATIO_DENOMINATOR / 2,
      pane(1),
      split(SplitDir.stacked, RATIO_DENOMINATOR / 2, pane(2), pane(3)),
    );
    expect(layoutRects(tree)).toEqual([
      { pane: 1, x: 0, y: 0, width: 0.5, height: 1 },
      { pane: 2, x: 0.5, y: 0, width: 0.5, height: 0.5 },
      { pane: 3, x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    ]);
  });

  it("takes the gap out of the split axis and keeps the total", () => {
    const rects = layoutRects(split(SplitDir.sideBySide, RATIO_DENOMINATOR / 2, pane(1), pane(2)), 0.1);
    const [a, b] = rects;
    expect(a?.width).toBeCloseTo(0.45);
    expect(b?.x).toBeCloseTo(0.55);
    expect((b?.x ?? 0) + (b?.width ?? 0)).toBeCloseTo(1);
  });

  it("covers the square exactly when there is no gap", () => {
    const tree = split(
      SplitDir.stacked,
      40000,
      split(SplitDir.sideBySide, 1000, pane(1), pane(2)),
      split(SplitDir.sideBySide, 65535, pane(3), pane(4)),
    );
    const area = layoutRects(tree).reduce((sum, r) => sum + r.width * r.height, 0);
    expect(area).toBeCloseTo(1);
  });
});

describe("paneAtPoint", () => {
  const rects = layoutRects(split(SplitDir.sideBySide, RATIO_DENOMINATOR / 2, pane(1), pane(2)));

  it("finds the pane under a point", () => {
    expect(paneAtPoint(rects, 0.1, 0.5)).toBe(1);
    expect(paneAtPoint(rects, 0.9, 0.5)).toBe(2);
  });

  it("gives an edge to the later pane and misses outside the square", () => {
    expect(paneAtPoint(rects, 0.5, 0.5)).toBe(2);
    expect(paneAtPoint(rects, 1.5, 0.5)).toBeNull();
  });
});
