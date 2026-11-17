// SPDX-License-Identifier: GPL-3.0-or-later
import { cellMetrics, createZoomMemory, fitWidthFontSize, terminalMetrics } from "@/terminal/viewport";

import { type Box, type EngineValues, type TerminalGridState, createGridEngine } from "./gridEngine";
import type { RenderSource, RowWindow } from "./gridRenderer";
import { type FakeGridOptions, createFakeGridSession } from "./testing";

const box = <T,>(value: T): Box<T> => ({ value });

function setup(options: FakeGridOptions = {}, view = { width: 360, height: 400 }) {
  const fake = createFakeGridSession(options);
  const values: EngineValues = {
    fontSize: box(0),
    scrollX: box(0),
    scrollTop: box(0),
    viewWidth: box(0),
    viewHeight: box(0),
    paddingTop: box(4),
    cols: box(0),
    liveRows: box(0),
    historyRows: box(0),
    following: box(false),
  };
  const frames: RowWindow[] = [];
  const renderer = {
    frame: (_source: RenderSource, window: RowWindow) => {
      frames.push(window);
      return "frame";
    },
    cursor: () => "cursor",
    missingHistory: (source: RenderSource, window: RowWindow) => {
      let missing = 0;
      for (let row = Math.max(0, window.first); row <= Math.min(source.historyRows - 1, window.last); row += 1) {
        if (source.scrollback?.lineAt(source.historyRows - 1 - row) === undefined) missing += 1;
      }
      return missing;
    },
  };
  const states: TerminalGridState[] = [];
  const memory = createZoomMemory();
  const key = { desktopId: "d", hostInstance: "00", tabId: 1 };
  const timers: (() => void)[] = [];
  const engine = createGridEngine<string>({
    session: fake,
    values,
    frame: box(""),
    cursor: box(""),
    zoomMemory: memory,
    zoomKey: () => key,
    zoomChipMs: 1000,
    publish: (state) => states.push(state),
    setTimer: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimer: () => undefined,
  });
  engine.setRenderer(renderer);
  engine.setViewport(view.width, view.height);
  engine.start();
  const lh = () => cellMetrics(values.fontSize.value).lineHeight;
  const bottom = () =>
    Math.max(0, (values.liveRows.value + values.historyRows.value) * lh() - values.viewHeight.value);
  return { fake, values, engine, frames, states, memory, key, timers, lh, bottom };
}

describe("grid engine: zoom", () => {
  it("opens an 80-column grid fitting the width (RF-3.7)", () => {
    const { values, engine } = setup({ cols: 80 });
    expect(values.fontSize.value).toBeCloseTo(fitWidthFontSize(80, 360));
    expect(engine.getState().isFit).toBe(true);
    expect(engine.getState().zoomPercent).toBe(100);
    expect(engine.getState().wide).toBe(false);
  });

  it("opens a 120-column grid at the reading size, wide", () => {
    const { values, engine } = setup({ cols: 120 });
    expect(values.fontSize.value).toBe(terminalMetrics.readFont);
    expect(engine.getState()).toMatchObject({ isFit: false, wide: true, zoomPercent: 200 });
  });

  it("fits the width on demand and remembers it for the tab (decision 7, RF-3.9)", () => {
    const { values, engine, memory, key } = setup({ cols: 120 });
    engine.fitWidth();
    expect(values.fontSize.value).toBeCloseTo(fitWidthFontSize(120, 360));
    expect(engine.getState()).toMatchObject({ isFit: true, wide: false, zoomPercent: 100 });
    expect(memory.get(key)).toBeCloseTo(fitWidthFontSize(120, 360));
  });

  it("opens with the remembered zoom of the tab", () => {
    const first = setup({ cols: 80 });
    first.memory.set(first.key, 18);
    const fake = createFakeGridSession({ cols: 80 });
    const values = {
      fontSize: box(0), scrollX: box(0), scrollTop: box(0), viewWidth: box(0), viewHeight: box(0),
      paddingTop: box(4), cols: box(0), liveRows: box(0), historyRows: box(0), following: box(false),
    };
    const engine = createGridEngine<string>({
      session: fake, values, frame: box(""), cursor: box(""), zoomMemory: first.memory,
      zoomKey: () => first.key, zoomChipMs: 1000, publish: () => undefined,
    });
    engine.setViewport(360, 400);
    engine.start();
    expect(values.fontSize.value).toBe(18);
    engine.dispose();
  });

  it("keeps the relative zoom when the view width changes (RF-3.10)", () => {
    const { values, engine } = setup({ cols: 80 });
    engine.setViewport(720, 400);
    expect(values.fontSize.value).toBeCloseTo(fitWidthFontSize(80, 720));
    expect(engine.getState().zoomPercent).toBe(100);
  });

  it("shows the zoom chip during a pinch and hides it after the chip duration", () => {
    const { engine, timers } = setup({ cols: 80 });
    engine.zoomed(120);
    expect(engine.getState().zoomChipVisible).toBe(true);
    engine.settled("pinch");
    expect(engine.getState().zoomChipVisible).toBe(true);
    timers.forEach((run) => run());
    expect(engine.getState().zoomChipVisible).toBe(false);
  });
});

describe("grid engine: history", () => {
  it("starts at the bottom and prefetches the history right above the screen", () => {
    const { fake, values, bottom, engine } = setup({ cols: 80, rows: 24, history: 1000 });
    expect(values.historyRows.value).toBe(1000);
    expect(values.scrollTop.value).toBeCloseTo(bottom());
    expect(engine.getState().atBottom).toBe(true);
    expect(fake.historyCalls.length).toBeGreaterThan(0);
    const [top, count] = fake.historyCalls[0] ?? [0, 0];
    // The window ends at offset 0 (the line right above the live screen).
    expect(top - count + 1).toBe(0);
  });

  it("asks for the history near the top when the user scrolls there (RF-3.11)", () => {
    const { fake, values, engine } = setup({ cols: 80, rows: 24, history: 1000 });
    fake.historyCalls.length = 0;
    values.scrollTop.value = 0;
    engine.viewChanged();
    expect(fake.historyCalls).toHaveLength(1);
    expect(fake.historyCalls[0]?.[0]).toBe(999);
    expect(engine.getState().atBottom).toBe(false);
  });

  it("shows the history spinner only while rows on screen wait for a page", () => {
    const { fake, values, engine } = setup({ cols: 80, rows: 24, history: 1000 });
    values.scrollTop.value = 0;
    engine.viewChanged();
    expect(engine.getState().loadingHistory).toBe(true);
    while (fake.pending.length > 0) fake.answer();
    expect(engine.getState().loadingHistory).toBe(false);
  });

  it("keeps the text read in place when lines drop off the top (RF-3.12)", () => {
    const { fake, values, engine, lh } = setup({ cols: 80, rows: 24, history: 1000, dropped: 0 });
    values.scrollTop.value = 100 * lh();
    engine.viewChanged();
    fake.diff([[0, "new"]], { history: 1000, dropped: 5 });
    expect(values.scrollTop.value).toBeCloseTo(95 * lh());
  });

  it("does not move the text read when output pushes lines into the history", () => {
    const { fake, values, engine, lh } = setup({ cols: 80, rows: 24, history: 100 });
    values.scrollTop.value = 10 * lh();
    engine.viewChanged();
    fake.diff([[23, "more"]], { history: 103 });
    expect(values.scrollTop.value).toBeCloseTo(10 * lh());
  });

  it("stays at the bottom while the history grows, and goes back to it on demand", () => {
    const { fake, values, bottom, engine } = setup({ cols: 80, rows: 24, history: 100 });
    fake.diff([[23, "x"]], { history: 110 });
    expect(values.scrollTop.value).toBeCloseTo(bottom());
    values.scrollTop.value = 0;
    engine.viewChanged();
    engine.scrollToBottom();
    expect(values.scrollTop.value).toBeCloseTo(bottom());
    expect(engine.getState().atBottom).toBe(true);
  });

  it("has no history on the alternate screen (RF-3.13)", () => {
    const { fake, values } = setup({ cols: 80, rows: 24, history: 100, alt: true });
    expect(values.historyRows.value).toBe(0);
    expect(fake.historyCalls).toHaveLength(0);
  });

  it("composes only a window around the view", () => {
    const { frames, values, engine, lh } = setup({ cols: 80, rows: 24, history: 5000 });
    const last = frames[frames.length - 1];
    expect(last?.last).toBe(5000 + 24 - 1);
    expect((last?.last ?? 0) - (last?.first ?? 0)).toBeLessThan(200);
    const count = frames.length;
    values.scrollTop.value -= lh();
    engine.viewChanged();
    expect(frames.length).toBe(count);
    values.scrollTop.value = 0;
    engine.viewChanged();
    expect(frames.length).toBe(count + 1);
    expect(frames[frames.length - 1]?.first).toBe(0);
  });
});

describe("grid engine: follow the cursor (RF-3.8)", () => {
  it("frames the cursor column and follows it while on", () => {
    const { fake, values, engine } = setup({ cols: 200, rows: 24, cursor: { col: 150 } });
    expect(values.scrollX.value).toBe(0);
    engine.setFollowCursor(true);
    expect(engine.getState().followingCursor).toBe(true);
    const cw = cellMetrics(values.fontSize.value).cellWidth;
    expect(values.scrollX.value).toBeGreaterThan(140 * cw - 360);
    fake.diff([[0, "x"]], { cursor: { col: 10 } });
    expect(values.scrollX.value).toBeLessThanOrEqual(9 * cw);
    engine.followStopped();
    expect(engine.getState().followingCursor).toBe(false);
  });
});
