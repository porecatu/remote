// SPDX-License-Identifier: GPL-3.0-or-later

import type { Line } from "../../src/protocol/index.ts";
import {
  HISTORY_CAP,
  LIVE_PANE,
  LIVE_PANE_COLS,
  LIVE_PANE_ROWS,
  LivePane,
  STYLES,
  buildProfiles,
  buildTheme,
  buildWorkspace,
  collectPanes,
  emptySnapshot,
} from "../../tools/fake-host/scenario.ts";

/** Columns a span covers: a grapheme span is one cell of `width` columns, plain text is a code point per `width`. */
function spanColumns(span: Line[1][number]): number {
  const [, width, , text] = span;
  return typeof text === "string" ? [...text].length * width : width;
}

function expectWellFormed(lines: readonly Line[], cols: number): void {
  for (const [, spans] of lines) {
    let next = 0;
    for (const span of spans) {
      expect(span[0]).toBeGreaterThanOrEqual(next);
      expect(span[3]).not.toHaveLength(0);
      next = span[0] + spanColumns(span);
      expect(next).toBeLessThanOrEqual(cols);
      expect(span[2]).toBeLessThan(STYLES.length);
    }
  }
}

describe("workspace", () => {
  const workspace = buildWorkspace();
  const panes = collectPanes(workspace);

  it("has two windows, with groups and pinned and loose tabs", () => {
    expect(workspace.windows).toHaveLength(2);
    expect(workspace.windows[0]?.pinned).toHaveLength(1);
    const kinds = workspace.windows.flatMap((w) => w.items.map((item) => ("group" in item ? "group" : "tab")));
    expect(kinds).toEqual(["tab", "group", "group", "tab", "tab", "group"]);
  });

  it("has unique tab, group and pane ids, and an active tab per window that exists", () => {
    const tabs: number[] = [];
    const groups: number[] = [];
    for (const window of workspace.windows) {
      const own: number[] = [];
      for (const item of [...window.pinned, ...window.items]) {
        if ("group" in item) {
          groups.push(item.group);
          own.push(...item.tabs.map((t) => t.tab));
        } else {
          own.push(item.tab);
        }
      }
      expect(own).toContain(window.active);
      tabs.push(...own);
    }
    expect(new Set(tabs).size).toBe(tabs.length);
    expect(new Set(groups).size).toBe(groups.length);
    expect(panes.size).toBe(12);
  });

  it("runs only the live pane, at 200x60", () => {
    const running = [...panes.values()].filter((p) => p.state === 0);
    expect(running.map((p) => p.pane)).toEqual([LIVE_PANE]);
    expect(panes.get(LIVE_PANE)).toMatchObject({ cols: 200, rows: 60 });
  });

  it("has a theme with 16 palette colors and profiles that include the default", () => {
    expect(buildTheme().palette).toHaveLength(16);
    const profiles = buildProfiles();
    expect(profiles.list.map((p) => p.id)).toContain(profiles.defaultProfile);
  });
});

describe("LivePane", () => {
  it("starts with a full snapshot of 60 well-formed lines and scrollback", () => {
    const pane = new LivePane();
    const snapshot = pane.snapshot(0);
    expect(snapshot).toMatchObject({ pane: LIVE_PANE, seq: 0, cols: LIVE_PANE_COLS, rows: LIVE_PANE_ROWS, alt: false });
    expect(snapshot.lines).toHaveLength(LIVE_PANE_ROWS);
    expect(snapshot.history).toBeGreaterThan(300);
    expectWellFormed(snapshot.lines, LIVE_PANE_COLS);
    expect(snapshot.cursor).toEqual({ row: 58, col: 2, shape: 0, visible: true });
  });

  it("is deterministic", () => {
    const a = new LivePane();
    const b = new LivePane();
    for (let i = 0; i < 100; i++) {
      a.step();
      b.step();
    }
    expect(a.snapshot(0)).toEqual(b.snapshot(0));
  });

  it("changes the status bar every frame and sends only that row in a quiet frame", () => {
    const pane = new LivePane();
    const before = pane.version;
    pane.step();
    const diff = pane.diffSince(before, 1);
    expect(diff.lines.map(([row]) => row)).toEqual([59]);
    expectWellFormed(diff.lines.map(([, l]) => l), LIVE_PANE_COLS);
  });

  it("scrolls the log region every few frames and moves a line into the history", () => {
    const pane = new LivePane();
    const history = pane.history;
    const before = pane.version;
    for (let i = 0; i < 6; i++) {
      pane.step();
    }
    expect(pane.history).toBe(history + 1);
    const rows = pane.diffSince(before, 1).lines.map(([row]) => row);
    expect(rows).toEqual(Array.from({ length: 58 }, (_, i) => i).concat(59));
  });

  it("returns an empty diff when nothing changed since the version", () => {
    const pane = new LivePane();
    expect(pane.diffSince(pane.version, 1).lines).toEqual([]);
  });

  it("applies a snapshot plus diffs to the same screen as a fresh snapshot", () => {
    const pane = new LivePane();
    const screen = pane.snapshot(0).lines.slice() as Line[];
    let version = pane.version;
    for (let i = 0; i < 200; i++) {
      pane.step();
      for (const [row, next] of pane.diffSince(version, 1).lines) {
        screen[row] = next;
      }
      version = pane.version;
    }
    expect(screen).toEqual(pane.snapshot(0).lines);
  });

  it("echoes typed text, backspace and enter", () => {
    const pane = new LivePane();
    const before = pane.version;
    pane.type("ls é");
    expect(pane.cursor.col).toBe(2 + 4);
    expect(pane.snapshot(0).lines[58]).toEqual([false, [[0, 1, 7, "$ "], [2, 1, 0, "ls é"]]]);
    pane.backspace();
    expect(pane.cursor.col).toBe(2 + 3);
    const history = pane.history;
    pane.enter();
    expect(pane.cursor.col).toBe(2);
    expect(pane.history).toBe(history + 2);
    expect(pane.version).toBeGreaterThan(before);
    pane.backspace();
    expect(pane.cursor.col).toBe(2);
  });

  it("uses every span shape: wide, grapheme and soft-wrapped lines appear in the log", () => {
    const pane = new LivePane();
    const lines = pane.snapshot(0).lines;
    const spans = lines.flatMap(([, s]) => s);
    expect(spans.some((s) => s[1] === 2 && typeof s[3] === "string")).toBe(true);
    expect(spans.some((s) => typeof s[3] !== "string")).toBe(true);
    expect(lines.some(([wrapped]) => wrapped)).toBe(true);
  });

  describe("scrollback", () => {
    it("lists lines top down, the last being the one at the offset", () => {
      const pane = new LivePane();
      const { history } = pane;
      const one = pane.scrollbackPage(5, 0, 1);
      expect(one).toMatchObject({ type: "scrollback-page", id: 5, pane: LIVE_PANE, offset: 0, history, dropped: 0 });
      expect(one.lines).toHaveLength(1);
      const page = pane.scrollbackPage(6, 0, 3);
      expect(page.lines).toHaveLength(3);
      expect(page.lines[2]).toEqual(one.lines[0]);
      const second = pane.scrollbackPage(7, 1, 1);
      expect(second.lines[0]).toEqual(page.lines[1]);
    });

    it("clips at the oldest line and is empty beyond it", () => {
      const pane = new LivePane();
      expect(pane.scrollbackPage(1, pane.history - 2, 10).lines).toHaveLength(2);
      expect(pane.scrollbackPage(1, pane.history, 10).lines).toEqual([]);
    });

    it("keeps absolute indexes stable while the history is capped and lines are dropped", () => {
      const pane = new LivePane();
      // The line at absolute index i is the same before and after more output.
      const absolute = (offset: number): number => pane.dropped + (pane.history - 1 - offset);
      const target = absolute(0);
      const text = JSON.stringify(pane.scrollbackPage(1, 0, 1).lines[0]);
      for (let i = 0; i < 6 * 1800; i++) {
        pane.step();
      }
      expect(pane.history).toBe(HISTORY_CAP);
      expect(pane.dropped).toBeGreaterThan(0);
      expect(target).toBeGreaterThanOrEqual(pane.dropped);
      const offset = pane.dropped + (pane.history - 1) - target;
      expect(JSON.stringify(pane.scrollbackPage(2, offset, 1).lines[0])).toBe(text);
      expect(pane.scrollbackPage(3, 0, 500).lines).toHaveLength(500);
    });
  });
});

describe("emptySnapshot", () => {
  it("has exactly `rows` blank lines", () => {
    const snapshot = emptySnapshot(7, 0, 80, 24);
    expect(snapshot.lines).toHaveLength(24);
    expect(snapshot.lines.every(([wrapped, spans]) => !wrapped && spans.length === 0)).toBe(true);
    expect(snapshot).toMatchObject({ pane: 7, cols: 80, rows: 24, history: 0, dropped: 0 });
  });
});
