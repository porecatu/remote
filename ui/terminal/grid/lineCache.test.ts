// SPDX-License-Identifier: GPL-3.0-or-later
import { Skia, type SkPicture } from "@shopify/react-native-skia";

import { createGridRenderer } from "./gridRenderer";
import { createLineCache, liveSlot } from "./lineCache";
import { createGridPainter } from "./skiaPainter";
import { TEST_GRID_THEME, createFakeGridSession } from "./testing";

describe("createLineCache", () => {
  it("records a slot once while it holds the same line object", () => {
    const cache = createLineCache<string>();
    const line = {};
    const record = jest.fn(() => "picture");
    expect(cache.get(liveSlot(0), line, record)).toBe("picture");
    expect(cache.get(liveSlot(0), line, record)).toBe("picture");
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("records again only the slot whose line object changed, disposing the old recording", () => {
    const disposed: string[] = [];
    const cache = createLineCache<string>((value) => disposed.push(value));
    const a = {};
    const b = {};
    let n = 0;
    const record = jest.fn(() => `p${String((n += 1))}`);
    cache.get(liveSlot(0), a, record);
    cache.get(liveSlot(1), b, record);
    const changed = {};
    expect(cache.get(liveSlot(0), changed, record)).toBe("p3");
    expect(cache.get(liveSlot(1), b, record)).toBe("p2");
    expect(record).toHaveBeenCalledTimes(3);
    expect(disposed).toEqual(["p1"]);
  });

  it("keeps live rows and history lines apart", () => {
    expect(liveSlot(0)).toBe(-1);
    expect(liveSlot(5)).toBe(-6);
    const cache = createLineCache<number>();
    const line = {};
    cache.get(liveSlot(0), line, () => 1);
    cache.get(0, line, () => 2);
    expect(cache.size).toBe(2);
  });

  it("drops the slots out of the drawn window, and everything on clear", () => {
    const disposed: number[] = [];
    const cache = createLineCache<number>((value) => disposed.push(value));
    for (let slot = 0; slot < 5; slot += 1) {
      cache.get(slot, {}, () => slot);
    }
    cache.retain((slot) => slot >= 3);
    expect(cache.size).toBe(2);
    expect(disposed).toEqual([0, 1, 2]);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(disposed).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("createGridRenderer with the line cache", () => {
  function setup() {
    const fake = createFakeGridSession({ cols: 10, rows: 4, lines: ["one", "two", "─┼─", "four"] });
    const painter = createGridPainter({ regular: null, medium: null });
    const record = jest.spyOn(painter, "record");
    const renderer = createGridRenderer(painter, TEST_GRID_THEME);
    const source = () => ({ grid: fake.model, scrollback: null, historyRows: 0, dropped: 0 });
    return { fake, record, renderer, source };
  }

  it("records every line once, then only the lines a diff touched", () => {
    const { fake, record, renderer, source } = setup();
    const first: SkPicture = renderer.frame(source(), { first: 0, last: 3 });
    expect(first.serialize()?.byteLength).toBeGreaterThan(0);
    expect(record).toHaveBeenCalledTimes(4);

    renderer.frame(source(), { first: 0, last: 3 });
    expect(record).toHaveBeenCalledTimes(4);

    fake.diff([[1, "TWO"]]);
    renderer.frame(source(), { first: 0, last: 3 });
    expect(record).toHaveBeenCalledTimes(5);
    expect(renderer.cachedLines).toBe(4);
  });

  it("lets go of lines out of the window", () => {
    const { renderer, source } = setup();
    renderer.frame(source(), { first: 0, last: 3 });
    renderer.frame(source(), { first: 2, last: 3 });
    expect(renderer.cachedLines).toBe(2);
  });

  it("draws history lines from the cache and counts the missing ones", () => {
    const fake = createFakeGridSession({ cols: 10, rows: 2, history: 6 });
    const painter = createGridPainter({ regular: null, medium: null });
    const record = jest.spyOn(painter, "record");
    const renderer = createGridRenderer(painter, TEST_GRID_THEME);
    const source = () => ({ grid: fake.model, scrollback: fake.history, historyRows: 6, dropped: 0 });
    expect(renderer.missingHistory(source(), { first: 0, last: 7 })).toBe(6);
    fake.requestHistory(2, 3);
    fake.answer();
    expect(renderer.missingHistory(source(), { first: 0, last: 7 })).toBe(3);
    renderer.frame(source(), { first: 0, last: 7 });
    // 3 history lines (offsets 0..2 = rows 3..5) and 2 live rows.
    expect(record).toHaveBeenCalledTimes(5);
  });

  it("draws the cursor layer only for a visible cursor", () => {
    const visible = createFakeGridSession({ cols: 10, rows: 2, cursor: { row: 1, col: 3 } });
    const hidden = createFakeGridSession({ cols: 10, rows: 2, cursor: { visible: false } });
    const renderer = createGridRenderer(createGridPainter({ regular: null, medium: null }), TEST_GRID_THEME);
    const of = (fake: typeof visible) =>
      renderer.cursor({ grid: fake.model, scrollback: null, historyRows: 0, dropped: 0 }).serialize()?.byteLength ?? 0;
    expect(of(visible)).toBeGreaterThan(of(hidden));
  });

  it("paints a recording through Skia without a loaded font", () => {
    const painter = createGridPainter({ regular: null, medium: null });
    expect(painter.hasFont).toBe(false);
    const picture = painter.record(
      [
        { kind: "rect", x: 0, y: 0, width: 6, height: 15.6, color: 0xff0000 },
        { kind: "line", x1: 0, y1: 0, x2: 6, y2: 15.6, thickness: 1, color: 0xffffff },
        { kind: "arc", cx: 6, cy: 6, radius: 3, startAngle: 180, sweepAngle: 90, thickness: 1, color: 0xffffff },
        { kind: "text", cells: ["a"], xs: [0], boxWidth: 6, baseline: 12, color: 0xffffff, bold: false, italic: false },
      ],
      6,
    );
    expect(picture.serialize()?.byteLength).toBeGreaterThan(0);
    expect(Skia.PictureRecorder).toBeDefined();
  });
});
