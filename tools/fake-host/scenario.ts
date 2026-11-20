// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The fake desktop's world (pure, no I/O, no clock): a synthetic workspace with
 * two windows, groups and tabs in every pane state, the `theme` and `profiles`
 * messages, and `LivePane`, a 200x60 pane that keeps producing output so the
 * app can be developed against a busy grid on a connected device.
 *
 * Everything is deterministic: the same number of `step()` calls always gives
 * the same screen (no `Math.random`, no wall clock), which is what lets the
 * tests compare a snapshot with a snapshot plus diffs.
 *
 * Only pane `LIVE_PANE` runs; the other panes are in the other states of
 * spec 03 §4.1 so the app can draw each of them. Subscribing to one of them
 * gives an empty snapshot (spec 03 §5.1, "not-started" pane).
 */
import {
  CursorShape,
  PaneState,
  ProfileKind,
  SplitDir,
  STYLE,
  type Color,
  type Cursor,
  type GridDiff,
  type GridSnapshot,
  type Group,
  type Line,
  type Pane,
  type PaneId,
  type PaneNode,
  type Profiles,
  type RequestId,
  type RowLine,
  type ScrollbackPage,
  type Span,
  type Style,
  type Tab,
  type TabId,
  type Theme,
  type WorkspaceMessage,
} from "../../src/protocol/index.ts";

/** The only pane that runs; its grid is {@link LIVE_PANE_COLS} x {@link LIVE_PANE_ROWS}. */
export const LIVE_PANE: PaneId = 1;
export const LIVE_PANE_COLS = 200;
export const LIVE_PANE_ROWS = 60;
/** Size of every other pane. */
export const IDLE_PANE_COLS = 80;
export const IDLE_PANE_ROWS = 24;

/** Rows 0..57 hold the scrolling log, then the prompt row and the status bar. */
const LOG_ROWS = 58;
const PROMPT_ROW = 58;
const STATUS_ROW = 59;
/** Lines kept above the screen; older ones are dropped (`dropped` grows). */
export const HISTORY_CAP = 2000;
/** The log scrolls by one line every this many frames (5 lines/s at 30 frames/s). */
const SCROLL_EVERY_FRAMES = 6;
/** Lines already printed when the simulation starts, so there is scrollback from the first snapshot. */
const WARMUP_LINES = 400;
/** The longest command line the prompt keeps. */
const MAX_TYPED_CODE_POINTS = 150;

// --- Styles ---

/** Indexes into {@link STYLES}. */
const S = {
  plain: 0,
  dim: 1,
  info: 2,
  warn: 3,
  error: 4,
  accent: 5,
  bar: 6,
  prompt: 7,
  progress: 8,
} as const;

const indexed = (n: number): Color => [0, n];
const direct = (rgb: number): Color => [1, rgb];

/** The style table every grid message of the fake host carries (a message may carry its whole table). */
export const STYLES: readonly Style[] = [
  [null, null, 0],
  [null, null, STYLE.dim],
  [indexed(2), null, 0],
  [indexed(3), null, 0],
  [indexed(1), null, STYLE.bold],
  [direct(0x4fc1ff), null, STYLE.italic],
  [null, null, STYLE.inverse],
  [indexed(12), null, STYLE.bold],
  [direct(0x23d18b), indexed(0), 0],
];

// --- Spans and lines ---

const codePoints = (text: string): number => [...text].length;

/** A plain span: one code point per cell, each one column wide. */
function narrow(col: number, style: number, text: string): Span {
  return [col, 1, style, text];
}

/** A plain span of double-width code points (CJK, emoji): each one takes two columns. */
function wide(col: number, style: number, text: string): Span {
  return [col, 2, style, text];
}

/** A grapheme of several code points in one cell of `width` columns (spec 03 §5.2). */
function grapheme(col: number, width: 1 | 2, style: number, text: string): Span {
  return [col, width, style, [text]];
}

const blank: Line = [false, []];

function line(spans: readonly Span[], wrapped = false): Line {
  return [wrapped, spans];
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** `HH:MM:SS`, counting from 10:00:00 and wrapping at a day. */
function clock(second: number): string {
  const total = (36_000 + second) % 86_400;
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor(total / 60) % 60)}:${pad2(total % 60)}`;
}

const PATHS = [
  "/api/v1/items",
  "/api/v1/items/42",
  "/healthz",
  "/api/v1/sessions",
  "/static/app.js",
  "/api/v1/users/me",
] as const;

/** Ten kinds of log line, so every span shape and style shows up regularly. */
function logLines(n: number): Line[] {
  const stamp = narrow(0, S.dim, clock(n));
  const path = PATHS[n % PATHS.length] ?? "/";
  const ms = 3 + ((n * 7) % 90);
  switch (n % 10) {
    case 5:
      return [
        line([
          stamp,
          narrow(9, S.warn, "WARN"),
          narrow(14, S.plain, `slow request path=${path} took ${ms * 10} ms`),
        ]),
      ];
    case 6:
      return [
        line([
          stamp,
          narrow(9, S.error, "ERROR"),
          narrow(15, S.plain, `connection reset by peer (attempt ${1 + (n % 5)})`),
        ]),
      ];
    case 7: {
      // Double-width code points in an ordinary span.
      const text = "日本語のログ出力";
      return [
        line([
          stamp,
          narrow(9, S.info, "INFO"),
          narrow(14, S.plain, "wide text:"),
          wide(25, S.accent, text),
          narrow(25 + 2 * codePoints(text) + 1, S.dim, `line ${n}`),
        ]),
      ];
    }
    case 8:
      // One grapheme per cell: a ZWJ emoji (2 columns) and a base with a combining mark (1 column).
      return [
        line([
          stamp,
          narrow(9, S.info, "INFO"),
          narrow(14, S.plain, "graphemes:"),
          grapheme(25, 2, S.plain, "\u{1F469}‍\u{1F4BB}"),
          grapheme(28, 1, S.accent, "é"),
          narrow(30, S.dim, `line ${n}`),
        ]),
      ];
    case 9: {
      // A soft-wrapped pair: a full 200-column line that continues on the next row.
      const head = `${clock(n)} DEBUG payload `;
      const filler = "0123456789abcdef".repeat(13);
      const first = `${head}${filler}`.slice(0, LIVE_PANE_COLS);
      return [line([narrow(0, S.dim, first)], true), line([narrow(0, S.dim, `end of payload ${n}`)])];
    }
    default:
      return [
        line([
          stamp,
          narrow(9, S.info, "INFO"),
          narrow(14, S.plain, `GET ${path} 200 in ${ms} ms`),
        ]),
      ];
  }
}

const SPINNER = ["|", "/", "-", "\\"] as const;

function statusLine(frame: number): Line {
  const filled = Math.floor(frame / 3) % 41;
  const bar = `${"#".repeat(filled)}${".".repeat(40 - filled)}`;
  const text = ` porecatu fake host  pane ${LIVE_PANE}  ${LIVE_PANE_COLS}x${LIVE_PANE_ROWS}  frame ${String(frame).padStart(8, "0")}  ${SPINNER[frame % 4] ?? "|"}  `;
  return line([
    narrow(0, S.bar, text.padEnd(LIVE_PANE_COLS - 44, " ")),
    narrow(LIVE_PANE_COLS - 44, S.progress, bar),
    narrow(LIVE_PANE_COLS - 4, S.bar, `${String(Math.floor((filled / 40) * 100)).padStart(3, " ")}%`),
  ]);
}

function promptLine(typed: string): Line {
  return line(typed.length === 0 ? [narrow(0, S.prompt, "$ ")] : [narrow(0, S.prompt, "$ "), narrow(2, S.plain, typed)]);
}

// --- The live pane ---

/** The 200x60 pane that never rests: a scrolling log, a prompt that echoes input and a status bar that changes every frame. */
export class LivePane {
  private readonly screen: Line[] = [];
  private readonly rowVersion: number[] = [];
  private readonly historyLines: Line[] = [];
  private droppedCount = 0;
  private frameCount = 0;
  private typed = "";
  private changes = 0;
  private logCounter = 0;

  constructor() {
    for (let row = 0; row < LIVE_PANE_ROWS; row++) {
      this.screen.push(blank);
      this.rowVersion.push(0);
    }
    for (let i = 0; i < WARMUP_LINES; i++) {
      this.appendLog(logLines(this.logCounter++));
    }
    this.setRow(PROMPT_ROW, promptLine(""));
    this.setRow(STATUS_ROW, statusLine(0));
  }

  /** Grows on every change; a subscription remembers the value it last sent. */
  get version(): number {
    return this.changes;
  }

  get history(): number {
    return this.historyLines.length;
  }

  get dropped(): number {
    return this.droppedCount;
  }

  get frame(): number {
    return this.frameCount;
  }

  get cursor(): Cursor {
    return { row: PROMPT_ROW, col: 2 + codePoints(this.typed), shape: CursorShape.block, visible: true };
  }

  /** Advances one frame (the host calls it 30 times a second). */
  step(): void {
    this.frameCount += 1;
    if (this.frameCount % SCROLL_EVERY_FRAMES === 0) {
      this.appendLog(logLines(this.logCounter++));
    }
    this.setRow(STATUS_ROW, statusLine(this.frameCount));
  }

  /** Text typed or pasted: it shows after the prompt. */
  type(text: string): void {
    const kept = [...(this.typed + text)].slice(0, MAX_TYPED_CODE_POINTS).join("");
    if (kept === this.typed) {
      return;
    }
    this.typed = kept;
    this.setRow(PROMPT_ROW, promptLine(this.typed));
  }

  backspace(): void {
    const points = [...this.typed];
    if (points.pop() === undefined) {
      return;
    }
    this.typed = points.join("");
    this.setRow(PROMPT_ROW, promptLine(this.typed));
  }

  /** Enter: the command line goes into the log, followed by a reply, and the prompt empties. */
  enter(): void {
    const command = this.typed;
    this.typed = "";
    this.appendLog([
      line([narrow(0, S.prompt, "$ "), narrow(2, S.plain, command)]),
      line([narrow(0, S.dim, "fake host: nothing is executed here")]),
    ]);
    this.setRow(PROMPT_ROW, promptLine(""));
  }

  snapshot(seq: number): GridSnapshot {
    return {
      type: "grid-snapshot",
      pane: LIVE_PANE,
      seq,
      cols: LIVE_PANE_COLS,
      rows: LIVE_PANE_ROWS,
      history: this.history,
      dropped: this.dropped,
      styles: STYLES,
      lines: this.screen.slice(),
      cursor: this.cursor,
      alt: false,
    };
  }

  /** The rows that changed after `sinceVersion`, as the spec's `grid-diff`. */
  diffSince(sinceVersion: number, seq: number): GridDiff {
    const lines: RowLine[] = [];
    for (let row = 0; row < LIVE_PANE_ROWS; row++) {
      if ((this.rowVersion[row] ?? 0) > sinceVersion) {
        lines.push([row, this.screen[row] ?? blank]);
      }
    }
    return {
      type: "grid-diff",
      pane: LIVE_PANE,
      seq,
      history: this.history,
      dropped: this.dropped,
      styles: STYLES,
      lines,
      cursor: this.cursor,
      alt: false,
    };
  }

  /**
   * A page of history (spec 03 §5.5): offset 0 is the line right above the top
   * of the screen, and the page lists lines from the top down, the last one
   * being the line at `offset`.
   */
  scrollbackPage(id: RequestId, offset: number, count: number): ScrollbackPage {
    const last = this.historyLines.length - 1;
    const lines: Line[] = [];
    for (let k = Math.min(offset + count, this.historyLines.length) - 1; k >= offset; k--) {
      lines.push(this.historyLines[last - k] ?? blank);
    }
    return {
      type: "scrollback-page",
      id,
      pane: LIVE_PANE,
      history: this.history,
      dropped: this.dropped,
      offset,
      styles: STYLES,
      lines,
    };
  }

  private setRow(row: number, value: Line): void {
    this.screen[row] = value;
    this.changes += 1;
    this.rowVersion[row] = this.changes;
  }

  /** Prints lines at the bottom of the log region, scrolling it up (the top row goes to the history). */
  private appendLog(lines: readonly Line[]): void {
    for (const next of lines) {
      const top = this.screen[0] ?? blank;
      this.historyLines.push(top);
      if (this.historyLines.length > HISTORY_CAP) {
        this.historyLines.shift();
        this.droppedCount += 1;
      }
      for (let row = 0; row < LOG_ROWS - 1; row++) {
        this.screen[row] = this.screen[row + 1] ?? blank;
      }
      this.screen[LOG_ROWS - 1] = next;
      this.changes += 1;
      for (let row = 0; row < LOG_ROWS; row++) {
        this.rowVersion[row] = this.changes;
      }
    }
  }
}

/** The grid of a pane nobody runs: `rows` blank lines, no cursor. */
export function emptySnapshot(pane: PaneId, seq: number, cols: number, rows: number): GridSnapshot {
  const lines: Line[] = [];
  for (let row = 0; row < rows; row++) {
    lines.push(blank);
  }
  return {
    type: "grid-snapshot",
    pane,
    seq,
    cols,
    rows,
    history: 0,
    dropped: 0,
    styles: [[null, null, 0]],
    lines,
    cursor: { row: 0, col: 0, shape: CursorShape.block, visible: false },
    alt: false,
  };
}

// --- Theme, profiles and workspace ---

export function buildTheme(): Theme {
  return {
    type: "theme",
    fg: 0xd4d4d4,
    bg: 0x1e1e1e,
    cursor: 0xffffff,
    selectionBg: 0x264f78,
    palette: [
      0x000000, 0xcd3131, 0x0dbc79, 0xe5e510, 0x2472c8, 0xbc3fbc, 0x11a8cd, 0xe5e5e5, 0x666666,
      0xf14c4c, 0x23d18b, 0xf5f543, 0x3b8eea, 0xd670d6, 0x29b8db, 0xffffff,
    ],
    groupColors: [0x2472c8, 0x0dbc79, 0xe5e510, 0xbc3fbc, 0xf14c4c, 0x29b8db],
  };
}

export function buildProfiles(): Profiles {
  return {
    type: "profiles",
    list: [
      { id: "default", name: "Default", kind: ProfileKind.local },
      { id: "wsl-ubuntu", name: "Ubuntu (WSL)", kind: ProfileKind.wsl },
      { id: "ssh-prod", name: "prod.example.com", kind: ProfileKind.ssh },
      { id: "ssh-lab", name: "lab", kind: ProfileKind.ssh },
    ],
    defaultProfile: "default",
  };
}

function pane(
  id: PaneId,
  title: string,
  state: Pane["state"],
  options: { cwd?: string; exit?: number; cols?: number; rows?: number } = {},
): Pane {
  return {
    pane: id,
    title,
    cwd: options.cwd ?? null,
    state,
    exit: options.exit ?? null,
    cols: options.cols ?? IDLE_PANE_COLS,
    rows: options.rows ?? IDLE_PANE_ROWS,
  };
}

function tab(
  id: number,
  title: string,
  layout: PaneNode,
  focused: PaneId,
  options: { profile?: string; remote?: string; activity?: boolean; bell?: boolean; custom?: boolean } = {},
): Tab {
  return {
    tab: id,
    title,
    custom: options.custom ?? false,
    profile: options.profile ?? "default",
    remote: options.remote ?? null,
    activity: options.activity ?? false,
    bell: options.bell ?? false,
    layout,
    focused,
  };
}

function group(id: number, name: string, color: number, collapsed: boolean, tabs: readonly Tab[]): Group {
  return { group: id, name, color, collapsed, tabs };
}

/**
 * Two windows. Window 1: a pinned SSH tab, the live tab, a group with an
 * exited pane and a split tab, a collapsed group and a loose tab. Window 2:
 * a loose tab and a group whose panes are connecting, reconnecting and waiting
 * for the desktop.
 */
export function buildWorkspace(rev = 1): WorkspaceMessage {
  const liveTab = tab(
    2,
    "bash",
    pane(LIVE_PANE, "bash", PaneState.running, {
      cwd: "/home/dev/porecatu",
      cols: LIVE_PANE_COLS,
      rows: LIVE_PANE_ROWS,
    }),
    LIVE_PANE,
    { activity: true },
  );
  const splitTab = tab(
    4,
    "tests",
    {
      dir: SplitDir.sideBySide,
      ratio: 32768,
      first: pane(3, "cargo test", PaneState.notStarted),
      second: {
        dir: SplitDir.stacked,
        ratio: 21845,
        first: pane(4, "git log", PaneState.exited, { exit: 0 }),
        second: pane(5, "htop", PaneState.exited, { exit: 130 }),
      },
    },
    3,
    { custom: true },
  );
  return {
    type: "workspace",
    rev,
    windows: [
      {
        id: 1,
        title: "porecatu",
        pinned: [
          tab(1, "prod", pane(6, "deploy@prod", PaneState.disconnected), 6, {
            profile: "ssh-prod",
            remote: "deploy@prod.example.com",
          }),
        ],
        items: [
          liveTab,
          group(1, "Build", 0x2472c8, false, [
            tab(3, "cargo watch", pane(7, "cargo watch", PaneState.exited, { exit: 0 }), 7, { bell: true }),
            splitTab,
          ]),
          group(2, "Docs", 0xbc3fbc, true, [
            tab(5, "mkdocs", pane(8, "mkdocs serve", PaneState.notStarted), 8),
          ]),
          tab(6, "wsl", pane(9, "ubuntu", PaneState.notStarted, { cwd: "/home/dev" }), 9, {
            profile: "wsl-ubuntu",
          }),
        ],
        active: 2,
      },
      {
        id: 2,
        title: "servers",
        pinned: [],
        items: [
          tab(7, "notes", pane(10, "vim notes.md", PaneState.notStarted), 10),
          group(3, "Prod", 0xf14c4c, false, [
            tab(8, "journal", pane(11, "journalctl", PaneState.connecting), 11, {
              profile: "ssh-prod",
              remote: "deploy@prod.example.com",
            }),
            tab(9, "metrics", pane(12, "lab", PaneState.reconnecting), 12, {
              profile: "ssh-lab",
              remote: "root@lab",
            }),
            tab(10, "shell", pane(13, "shell", PaneState.awaitingDesktop), 13, { profile: "ssh-lab" }),
          ]),
        ],
        active: 7,
      },
    ],
  };
}

/** Every tab id of a workspace (pinned, loose and in groups). */
export function collectTabs(workspace: WorkspaceMessage): Set<TabId> {
  const tabs = new Set<TabId>();
  for (const window of workspace.windows) {
    for (const item of [...window.pinned, ...window.items]) {
      if ("group" in item) {
        for (const member of item.tabs) {
          tabs.add(member.tab);
        }
      } else {
        tabs.add(item.tab);
      }
    }
  }
  return tabs;
}

/** Size and state of every pane of a workspace, by id. */
export function collectPanes(workspace: WorkspaceMessage): Map<PaneId, Pane> {
  const panes = new Map<PaneId, Pane>();
  const walk = (node: PaneNode): void => {
    if ("pane" in node) {
      panes.set(node.pane, node);
    } else {
      walk(node.first);
      walk(node.second);
    }
  };
  for (const window of workspace.windows) {
    for (const item of [...window.pinned, ...window.items]) {
      if ("group" in item) {
        for (const member of item.tabs) {
          walk(member.layout);
        }
      } else {
        walk(item.layout);
      }
    }
  }
  return panes;
}
