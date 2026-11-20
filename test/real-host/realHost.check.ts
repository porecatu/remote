// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Verification of the app's logic against a real Porecatu desktop and a real
 * Porecatu Relay (roadmap, "Contra um Porecatu real"). The app is put together
 * as in production, minus the screens: `createServices` (through
 * `createTestServices`, with the real clock, scheduler, WebSocket and HTTP),
 * the pairing controller the pairing screens use, the desktops controller, the
 * session store and the terminal controller. Only the secure store is in
 * memory, loaded from and saved to `app-state.json` so later runs reuse the
 * pairing.
 *
 * Run with `pnpm real-host`; see test/real-host/README.md for the setup (the
 * desktop's session, its config and the relay). It reports steps and ids,
 * never screen content.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { WebSocket } from "ws";
import { type TerminalSession, createTerminalSession } from "@/controllers/terminalSession";
import type { GridModel } from "@/grid/gridModel";
import type { FetchLike } from "@/net/presence";
import { type WebSocketConstructor, openRelaySocket } from "@/net/relaySocket";
import {
  type Action,
  ConfirmKind,
  ErrorCode,
  type Group,
  NamedKey,
  type Pane,
  type PaneNode,
  PaneState,
  type RequestId,
  type Tab,
  type WindowId,
  type WorkspaceMessage,
} from "@/protocol";
import {
  closePane,
  closeTab,
  collapseGroup,
  moveGroupToWindow,
  moveTabToGroup,
  moveTabToWindow,
  newGroup,
  newTab,
  renameGroup,
  renameTab,
  setGroupColor,
  startPane,
  ungroup,
} from "@/session/actions";
import { realClock, realScheduler } from "@/session/clock";
import type { OpenSocket } from "@/session/lifecycle";
import type { ActionOutcome } from "@/session/requests";
import type { SessionStore } from "@/session/sessionStore";
import type { SecureStoreKey } from "@/storage/secureStore";
import { createPairingControllerFromServices } from "@ui/screens/pairing/PairingContext";
import { type TestServices, createTestServices } from "@ui/services/testing";

// ----------------------------------------------------------------- setup

const DIR = process.env.PORECATU_REAL_HOST_DIR;
if (DIR === undefined) {
  throw new Error("PORECATU_REAL_HOST_DIR is not set (test/real-host/README.md)");
}
const STATE_FILE = join(DIR, "app-state.json");
const URI_FILE = join(DIR, "pairing-uri.txt");
const REPORT_FILE = join(DIR, "report.json");
const DESKTOP_PID = Number(process.env.PORECATU_DESKTOP_PID ?? "0");
const STORE_KEYS: readonly SecureStoreKey[] = ["device.static_key", "desktops.v1", "settings.v1"];

const openSocket: OpenSocket = (url, handlers) =>
  openRelaySocket(url, handlers, WebSocket as unknown as WebSocketConstructor);

/** Presence over plain HTTP: the relay is on loopback (`ws://`). */
const nodeFetch: FetchLike = (url, init) =>
  new Promise((resolve, reject) => {
    const req = request(url, { method: init?.method ?? "GET" }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    init?.signal?.addEventListener("abort", () => req.destroy());
    req.on("error", reject);
    req.end();
  });

interface Step {
  readonly step: string;
  readonly ok: boolean;
  readonly detail?: string;
}
const report: Step[] = [];
function record(step: string, ok: boolean, detail?: string): void {
  report.push(detail === undefined ? { step, ok } : { step, ok, detail });
  process.stdout.write(`[real-host] ${ok ? "ok  " : "FAIL"} ${step}${detail === undefined ? "" : ` (${detail})`}\n`);
}

async function waitFor<T>(probe: () => T | null | undefined | false, label: string, timeoutMs = 10_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = probe();
    if (value !== null && value !== undefined && value !== false) {
      return value;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface Foreground {
  readonly hwnd: string;
  readonly pid: number;
  readonly title: string;
}

/** The foreground window (Windows only), to see the desktop never raises a window (spec 03 §7). */
function foreground(): Foreground | null {
  if (process.platform !== "win32") {
    return null;
  }
  const script = [
    "Add-Type -Name W -Namespace U -MemberDefinition '",
    '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();',
    '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint p);',
    '[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);',
    "'; $h = [U.W]::GetForegroundWindow(); $p = 0; [void][U.W]::GetWindowThreadProcessId($h, [ref]$p);",
    "$s = New-Object System.Text.StringBuilder 512; [void][U.W]::GetWindowText($h, $s, 512);",
    '"$h|$p|$($s.ToString())"',
  ].join(" ");
  try {
    const [hwnd = "", pid = "0", ...title] = execFileSync("powershell", ["-NoProfile", "-Command", script], {
      encoding: "utf8",
    })
      .trim()
      .split("|");
    return { hwnd, pid: Number(pid), title: title.join("|") };
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------- workspace helpers

interface TabPlace {
  readonly tab: Tab;
  readonly window: WindowId;
  readonly group: Group | null;
  readonly pinned: boolean;
}

function places(ws: WorkspaceMessage): TabPlace[] {
  const out: TabPlace[] = [];
  for (const window of ws.windows) {
    for (const tab of window.pinned) {
      out.push({ tab, window: window.id, group: null, pinned: true });
    }
    for (const item of window.items) {
      if ("group" in item) {
        for (const tab of item.tabs) {
          out.push({ tab, window: window.id, group: item, pinned: false });
        }
      } else {
        out.push({ tab: item, window: window.id, group: null, pinned: false });
      }
    }
  }
  return out;
}

function groups(ws: WorkspaceMessage): { group: Group; window: WindowId }[] {
  return ws.windows.flatMap((window) =>
    window.items.filter((item): item is Group => "group" in item).map((group) => ({ group, window: window.id })),
  );
}

function panesOf(node: PaneNode): Pane[] {
  return "pane" in node ? [node] : [...panesOf(node.first), ...panesOf(node.second)];
}

/** Text of a grid row, spans placed at their columns. */
function rowText(grid: GridModel, row: number): string {
  const line = grid.lineAt(row);
  if (line === undefined) {
    return "";
  }
  let text = "";
  for (const span of line.spans) {
    text = text.padEnd(span.col, " ") + span.text;
  }
  return text;
}

function screenRowsContaining(grid: GridModel | null, marker: string): number {
  if (grid === null) {
    return 0;
  }
  let count = 0;
  for (let row = 0; row < grid.rowsCount; row++) {
    if (rowText(grid, row).includes(marker)) {
      count++;
    }
  }
  return count;
}

function marker(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `${prefix}${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// ----------------------------------------------------------------- shared state

let services: TestServices;
let session: SessionStore;
let desktopId: string;
let powershell = true;

const ws = (): WorkspaceMessage => {
  const value = session.getState().workspace;
  if (value === null) {
    throw new Error("no workspace");
  }
  return value;
};
const tabByTitle = (title: string): TabPlace | undefined => places(ws()).find((p) => p.tab.title === title);
const tabById = (id: number): TabPlace | undefined => places(ws()).find((p) => p.tab.tab === id);
const groupByName = (name: string) => groups(ws()).find((g) => g.group.name === name);
const windowOf = (id: WindowId) => ws().windows.find((w) => w.id === id);
const focusedByTab = (): Map<number, number> => new Map(places(ws()).map((p) => [p.tab.tab, p.tab.focused]));

/** Sends an action through the session store and waits for its outcome. */
function act(build: (id: RequestId) => Action, label: string, timeoutMs = 15_000): Promise<ActionOutcome> {
  return new Promise((resolve, reject) => {
    let id: RequestId | null = null;
    const timer = setTimeout(() => {
      off();
      reject(new Error(`${label}: no action-result in ${timeoutMs} ms`));
    }, timeoutMs);
    const off = session.onEvent((event) => {
      if (event.type === "action-outcome" && id !== null && event.outcome.request.id === id) {
        clearTimeout(timer);
        off();
        resolve(event.outcome);
      }
    });
    const sent = session.sendAction(build);
    if (!sent.ok) {
      clearTimeout(timer);
      off();
      reject(new Error(`${label}: not sent (${sent.reason})`));
      return;
    }
    id = sent.id;
  });
}

function failureCode(outcome: ActionOutcome): number | null {
  return outcome.status === "failed" ? outcome.failure.code : null;
}

/** Runs an action that must succeed, checks the focused pane of every tab stayed put (spec 03 §7). */
async function actOk(build: (id: RequestId) => Action, label: string): Promise<ActionOutcome> {
  const before = focusedByTab();
  const outcome = await act(build, label);
  const ok = outcome.status !== "failed";
  // The workspace after the result may lag up to 250 ms (4 per second).
  await pause(400);
  const after = focusedByTab();
  const moved = [...before].filter(([tab, pane]) => after.has(tab) && after.get(tab) !== pane);
  record(label, ok && moved.length === 0, ok ? (moved.length === 0 ? undefined : "focused pane changed") : `error ${failureCode(outcome)}`);
  expect(outcome.status).not.toBe("failed");
  expect(moved).toEqual([]);
  return outcome;
}

async function actFails(build: (id: RequestId) => Action, label: string, code: number): Promise<void> {
  const outcome = await act(build, label);
  const got = failureCode(outcome);
  record(label, got === code, `error ${got}`);
  expect(got).toBe(code);
}

function openTerminal(tabId: number): TerminalSession {
  const terminal = createTerminalSession({
    session,
    tabId,
    clock: realClock,
    scheduler: realScheduler,
    bellVibrationEnabled: () => false,
  });
  terminal.open();
  return terminal;
}

async function runCommand(terminal: TerminalSession, command: string): Promise<void> {
  expect(terminal.typeText(command)).toBe(true);
  expect(terminal.pressNamedKey(NamedKey.enter)).toBe(true);
}

// ----------------------------------------------------------------- the run

beforeAll(async () => {
  const items: Partial<Record<SecureStoreKey, string>> = existsSync(STATE_FILE)
    ? (JSON.parse(readFileSync(STATE_FILE, "utf8")) as Partial<Record<SecureStoreKey, string>>)
    : {};
  services = createTestServices({
    items,
    appVersion: "0.0.0-real-host",
    deviceModel: "Node real-host",
    deps: { clock: realClock, scheduler: realScheduler, openSocket, fetch: nodeFetch },
  });
  await services.start();
  await services.desktops.load();
});

afterAll(async () => {
  const saved: Partial<Record<SecureStoreKey, string>> = {};
  for (const key of STORE_KEYS) {
    const value = await services.fakes.secureStore.get(key);
    if (value !== null) {
      saved[key] = value;
    }
  }
  writeFileSync(STATE_FILE, JSON.stringify(saved, null, 2));
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  services.desktops.dispose();
  services.registry.closeAll();
  await pause(300);
});

describe("against a real Porecatu and relay", () => {
  test("pairs (first run) or connects to the paired desktop", async () => {
    const paired = services.desktops.store.getState().desktops;
    if (paired.length === 0) {
      const uri = (process.env.PORECATU_PAIRING_URI ?? (existsSync(URI_FILE) ? readFileSync(URI_FILE, "utf8") : "")).trim();
      expect(uri).not.toBe("");
      const controller = createPairingControllerFromServices(services);
      controller.readUri(uri);
      await waitFor(() => controller.store.getState().step === "naming", "the name step");
      controller.submitName("Verificacao Node");
      const fingerprint = controller.store.getState().deviceFingerprint;
      process.stdout.write(`[real-host] accept on the desktop; the device fingerprint is ${fingerprint}\n`);
      writeFileSync(join(DIR, "fingerprint.txt"), fingerprint);
      await waitFor(() => controller.store.getState().step === "awaiting-confirmation", "the desktop to ask", 20_000);
      record("pairing: handshake XX with the QR token, desktop asks the user", true);
      const state = await waitFor(
        () => {
          const s = controller.store.getState();
          return s.step === "paired" || s.step === "failed" ? s : null;
        },
        "the user's answer",
        130_000,
      );
      record("pairing: accepted on the desktop and saved", state.step === "paired", state.failure?.kind);
      expect(state.step).toBe("paired");
      desktopId = state.pairedDesktopId ?? "";
      const adopted = services.registry.get(desktopId);
      expect(adopted).toBeDefined();
      session = adopted as SessionStore;
      controller.dispose();
      await services.desktops.reload();
    } else {
      desktopId = paired[0]?.id ?? "";
      const opened = services.desktops.open(desktopId);
      expect(opened).toBeDefined();
      session = opened as SessionStore;
    }
    await waitFor(() => session.getState().connection.state === "ready", "ready", 20_000);
    const welcome = session.getState().connection.welcome;
    record("session ready after welcome", true, `porecatu ${welcome?.porecatuVersion}, max_subscriptions ${welcome?.maxSubscriptions}`);
    expect(welcome?.porecatuVersion).toBe("0.10.0");
  });

  test("receives theme, profiles and the restored workspace", async () => {
    await waitFor(() => session.getState().workspace, "workspace");
    const state = session.getState();
    expect(state.theme?.palette).toHaveLength(16);
    expect(state.theme?.groupColors.length).toBeGreaterThan(0);
    const profiles = state.profiles;
    expect(profiles?.list.map((p) => p.id)).toContain(profiles?.defaultProfile);
    const defaultProfile = profiles?.list.find((p) => p.id === profiles.defaultProfile);
    powershell = /powershell|pwsh/i.test(defaultProfile?.name ?? "");
    const workspace = ws();
    expect(workspace.windows).toHaveLength(2);
    expect(groupByName("Build")).toBeDefined();
    const split = tabByTitle("Dividida");
    expect(split !== undefined && panesOf(split.tab.layout).length).toBe(2);
    expect(tabByTitle("Solta")?.tab.layout).toMatchObject({ state: PaneState.notStarted });
    record("theme, profiles and workspace", true, `${state.profiles?.list.length} profiles, default ${powershell ? "PowerShell" : "other shell"}`);
  });

  test("terminal: subscribes, shows the tab, live grid, input and paste", async () => {
    const principal = tabByTitle("Principal");
    expect(principal).toBeDefined();
    const terminal = openTerminal(principal?.tab.tab ?? 0);
    await waitFor(() => terminal.getState().status === "live", "live grid", 15_000);
    const st = terminal.getState();
    record("grid-snapshot received and acked", true, `${st.cols}x${st.rows}`);

    const typed = marker("pr-typed-");
    await runCommand(terminal, `echo ${typed}`);
    await waitFor(() => screenRowsContaining(terminal.grid(), typed) >= 2, "typed command and its output", 10_000);
    record("text-input + key enter reach the shell (grid-diff applied)", true);

    const pasted = marker("pr-pasted-");
    const paste = terminal.pasteRequest(`echo ${pasted}`);
    expect(paste).toEqual({ needsConfirmation: false, sent: true });
    terminal.pressNamedKey(NamedKey.enter);
    await waitFor(() => screenRowsContaining(terminal.grid(), pasted) >= 2, "pasted command output", 10_000);
    record("paste reaches the shell", true);

    // Ctrl+C from the key bar's modifier interrupts a running command.
    await runCommand(terminal, "ping -t 127.0.0.1");
    await pause(2500);
    terminal.tapModifier("ctrl");
    expect(terminal.typeText("c")).toBe(true);
    await pause(800);
    const after = marker("pr-after-ctrl-c-");
    await runCommand(terminal, `echo ${after}`);
    await waitFor(() => screenRowsContaining(terminal.grid(), after) >= 2, "prompt back after ctrl+c", 10_000);
    record("ctrl modifier + c interrupts the foreground process", true);

    // History: output longer than the screen, then a page of scrollback.
    const lines = powershell ? "1..150 | ForEach-Object { \"linha $_\" }" : "for /L %i in (1,1,150) do @echo linha %i";
    await runCommand(terminal, lines);
    await waitFor(() => terminal.getState().history.lines >= 100, "history to grow", 15_000);
    // The viewport's top line is offset 99 and it shows 100 lines down to offset 0.
    expect(terminal.requestHistory(99, 100)).toBe(true);
    await waitFor(() => terminal.getState().history.loadingPages === 0 && terminal.scrollback()?.hasRange(0, 100), "scrollback page", 10_000);
    record("scrollback-request answered with a page", true, `history ${terminal.getState().history.lines} lines`);

    if (powershell) {
      let rang = false;
      const off = terminal.onEvent((event) => {
        if (event.type === "bell") {
          rang = true;
        }
      });
      await runCommand(terminal, 'Write-Host -NoNewline "`a"');
      await waitFor(() => rang, "bell", 10_000).catch(() => false);
      off();
      record("bell in the subscribed pane", rang);
    }
    terminal.close();
  });

  test("opening a tab does not change the active one; start-pane starts a not-started tab", async () => {
    const solta = tabByTitle("Solta");
    expect(solta?.tab.layout).toMatchObject({ state: PaneState.notStarted });
    const activeBefore = windowOf(solta?.window ?? 0)?.active;
    expect(activeBefore).not.toBe(solta?.tab.tab);
    // The app shows the tab (`view-tab`): the desktop only marks it, the `workspace` that follows keeps `active`.
    const viewing = openTerminal(solta?.tab.tab ?? 0);
    await waitFor(() => viewing.getState().paneId !== null, "the terminal to pick the pane");
    await pause(800);
    expect(windowOf(solta?.window ?? 0)?.active).toBe(activeBefore);
    const soltaPane = solta === undefined ? 0 : (panesOf(solta.tab.layout)[0]?.pane ?? 0);
    await actOk((id) => startPane(id, soltaPane), "start-pane (tab being shown)");
    await waitFor(() => (tabByTitle("Solta")?.tab.layout as Pane | undefined)?.state === PaneState.running, "the tab to start");
    expect(windowOf(solta?.window ?? 0)?.active).toBe(activeBefore);
    viewing.close();
    record("opening a tab does not change the active tab of the desktop", windowOf(solta?.window ?? 0)?.active === activeBefore);

    const outra = tabByTitle("Outra solta");
    const outraActive = windowOf(outra?.window ?? 0)?.active;
    const pane = outra === undefined ? 0 : (panesOf(outra.tab.layout)[0]?.pane ?? 0);
    await actOk((id) => startPane(id, pane), "start-pane");
    await waitFor(() => (tabByTitle("Outra solta")?.tab.layout as Pane | undefined)?.state === PaneState.running, "pane running");
    expect(windowOf(outra?.window ?? 0)?.active).toBe(outraActive);
    await actFails((id) => startPane(id, pane), "start-pane on a running pane: invalid-argument", ErrorCode.invalidArgument);
  });

  test("actions: rename-tab, new-tab, groups", async () => {
    const principal = tabByTitle("Principal");
    const tabId = principal?.tab.tab ?? 0;
    await actOk((id) => renameTab(id, tabId, "Renomeada"), "rename-tab");
    await waitFor(() => tabById(tabId)?.tab.title === "Renomeada" && tabById(tabId)?.tab.custom, "new title");

    const window = principal?.window ?? 0;
    const activeBeforeNewTab = windowOf(window)?.active;
    const created = await actOk((id) => newTab(id, window), "new-tab");
    const newId = created.status === "created-tab" || created.status === "waiting-tab" ? created.tab : 0;
    await waitFor(() => tabById(newId), "the new tab in the workspace");
    // No remote action activates a tab (spec 0.5): the new tab is born inactive.
    expect(windowOf(window)?.active).toBe(activeBeforeNewTab);

    const build = groupByName("Build");
    const inGroup = await actOk((id) => newTab(id, window, { group: build?.group.group ?? 0 }), "new-tab in a group");
    const inGroupId = inGroup.status === "created-tab" || inGroup.status === "waiting-tab" ? inGroup.tab : 0;
    await waitFor(() => tabById(inGroupId)?.group?.name === "Build", "the tab inside Build");

    await actOk((id) => newGroup(id, [newId], "Grupo novo", 2), "new-group");
    const fresh = await waitFor(() => groupByName("Grupo novo"), "the new group");
    expect(fresh.group.color).toBe(2);
    const groupId = fresh.group.group;
    await actOk((id) => renameGroup(id, groupId, "Grupo renomeado"), "rename-group");
    await waitFor(() => groupByName("Grupo renomeado"), "renamed group");
    await actOk((id) => setGroupColor(id, groupId, 4), "set-group-color");
    await waitFor(() => groupByName("Grupo renomeado")?.group.color === 4, "group color");
    await actOk((id) => collapseGroup(id, groupId, true), "collapse-group (collapse)");
    await waitFor(() => groupByName("Grupo renomeado")?.group.collapsed === true, "collapsed");
    await actOk((id) => collapseGroup(id, groupId, false), "collapse-group (expand)");
    await waitFor(() => groupByName("Grupo renomeado")?.group.collapsed === false, "expanded");

    const solta = tabByTitle("Solta")?.tab.tab ?? 0;
    await actOk((id) => moveTabToGroup(id, solta, build?.group.group ?? 0), "move-tab-to-group");
    await waitFor(() => tabById(solta)?.group?.name === "Build", "Solta in Build");
    await actOk((id) => moveTabToGroup(id, solta, null), "move-tab-to-group (out)");
    await waitFor(() => tabById(solta)?.group === null, "Solta out of the group");

    await actOk((id) => ungroup(id, groupId), "ungroup");
    await waitFor(() => groupByName("Grupo renomeado") === undefined && tabById(newId) !== undefined, "group gone, tab kept");
    await actOk((id) => renameTab(id, tabId, null), "rename-tab (clear)");
    await waitFor(() => tabById(tabId)?.tab.custom === false, "custom title cleared");
  });

  test("actions: move to another window without raising a system window", async () => {
    // Move into the window that is NOT in front, so raising it would show.
    const before = foreground();
    const front = before?.pid === DESKTOP_PID ? ws().windows.find((w) => w.title === before.title) : undefined;
    const target = ws().windows.find((w) => w.id !== front?.id) ?? ws().windows[0];
    const source = ws().windows.find((w) => w.id !== target?.id);
    const created = await act((id) => newTab(id, source?.id ?? 0), "new-tab to move");
    const moved = created.status === "created-tab" || created.status === "waiting-tab" ? created.tab : 0;
    await waitFor(() => tabById(moved), "the tab to move");

    const targetActive = windowOf(target?.id ?? 0)?.active;
    await actOk((id) => moveTabToWindow(id, moved, target?.id ?? 0), "move-tab-to-window");
    await waitFor(() => tabById(moved)?.window === target?.id, "the tab in the other window");
    expect(windowOf(target?.id ?? 0)?.active).toBe(targetActive);
    await actFails((id) => moveTabToWindow(id, moved, target?.id ?? 0), "move-tab-to-window to its own window: invalid-argument", ErrorCode.invalidArgument);

    const build = groupByName("Build");
    const other = ws().windows.find((w) => w.id !== build?.window);
    await actOk((id) => moveGroupToWindow(id, build?.group.group ?? 0, other?.id ?? 0), "move-group-to-window");
    await waitFor(() => groupByName("Build")?.window === other?.id, "Build in the other window");

    const after = foreground();
    if (before !== null && after !== null) {
      const same = before.hwnd === after.hwnd;
      record(
        "no system window raised (foreground window unchanged)",
        same,
        `front: ${before.pid === DESKTOP_PID ? "test desktop window" : "another app"}; target window ${front === undefined ? "any" : "behind"}`,
      );
      expect(after.hwnd).toBe(before.hwnd);
    }
  });

  test("actions: close-pane, close-tab, and close-tab with confirmation", async () => {
    const split = tabByTitle("Dividida");
    const second = split === undefined ? undefined : panesOf(split.tab.layout)[1];
    await actOk((id) => closePane(id, second?.pane ?? 0), "close-pane");
    await waitFor(() => "pane" in (tabByTitle("Dividida")?.tab.layout ?? {}), "one pane left");

    const destino = tabByTitle("Destino")?.tab.tab ?? 0;
    await actOk((id) => closeTab(id, destino), "close-tab (nothing running)");
    await waitFor(() => tabById(destino) === undefined, "Destino closed");

    // A tab with a foreground process: the desktop asks the app, not the user at the desk.
    const window = ws().windows[0]?.id ?? 0;
    const created = await act((id) => newTab(id, window), "new-tab for the confirmation");
    const busyTab = created.status === "created-tab" || created.status === "waiting-tab" ? created.tab : 0;
    await waitFor(() => tabById(busyTab), "the tab");
    const terminal = openTerminal(busyTab);
    await waitFor(() => terminal.getState().status === "live", "live grid", 15_000);
    await pause(1500);
    await runCommand(terminal, "ping -t 127.0.0.1");
    await pause(2500);

    const declined = act((id) => closeTab(id, busyTab), "close-tab (declined)");
    const ask = await waitFor(() => session.getState().confirms[0], "confirm-request");
    record("confirm-request for a running process", ask.kind === ConfirmKind.runningProcess, `${ask.processes.length} process(es)`);
    expect(ask.kind).toBe(ConfirmKind.runningProcess);
    expect(session.answerConfirm(ask.id, false)).toBe(true);
    const declinedOutcome = await declined;
    record("confirm declined: cancelled", failureCode(declinedOutcome) === ErrorCode.cancelled);
    expect(failureCode(declinedOutcome)).toBe(ErrorCode.cancelled);
    expect(tabById(busyTab)).toBeDefined();

    const accepted = act((id) => closeTab(id, busyTab), "close-tab (accepted)");
    const ask2 = await waitFor(() => session.getState().confirms[0], "confirm-request");
    expect(session.answerConfirm(ask2.id, true)).toBe(true);
    const acceptedOutcome = await accepted;
    record("confirm accepted: tab closed", acceptedOutcome.status === "done");
    await waitFor(() => tabById(busyTab) === undefined, "tab closed");
    await waitFor(() => terminal.getState().tabGone === "closed", "the terminal sees the tab gone");
    terminal.close();
  });

  test("actions: errors come back as codes", async () => {
    // `view-tab` is not an action: an unknown tab answers with an `error` that has no request id.
    const refused = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        off();
        resolve(false);
      }, 5_000);
      const off = session.onMessage((message) => {
        if (message.type === "error" && message.code === ErrorCode.unknownTab && message.id === undefined) {
          clearTimeout(timer);
          off();
          resolve(true);
        }
      });
    });
    expect(session.send({ type: "view-tab", tab: 4_000_000 })).toBe(true);
    const gotUnknownTab = await refused;
    record("view-tab unknown: unknown-tab", gotUnknownTab);
    expect(gotUnknownTab).toBe(true);
    const window = ws().windows[0]?.id ?? 0;
    await actFails((id) => newTab(id, window, { profile: "no-such-profile" }), "new-tab unknown profile: unknown-profile", ErrorCode.unknownProfile);
    const build = groupByName("Build");
    const loose = places(ws()).find((p) => p.window !== build?.window && !p.pinned);
    expect(build !== undefined && loose !== undefined).toBe(true);
    await actFails(
      (id) => moveTabToGroup(id, loose?.tab.tab ?? 0, build?.group.group ?? 0),
      "move-tab-to-group to another window's group: unknown-group",
      ErrorCode.unknownGroup,
    );
  });

  test("leaves and comes back: presence, reconnection, same host instance", async () => {
    services.desktops.setVisible(true);
    await services.desktops.refresh();
    const presence = services.desktops.store.getState().presence[desktopId];
    record("presence: online", presence === "online", presence);
    expect(presence).toBe("online");

    const instance = session.getState().connection.welcome?.hostInstance;
    session.close();
    await waitFor(() => session.getState().connection.state === "closed", "closed");
    const again = services.desktops.open(desktopId);
    expect(again).toBeDefined();
    session = again as SessionStore;
    await waitFor(() => session.getState().connection.state === "ready", "ready again", 20_000);
    const welcome = session.getState().connection.welcome;
    record("reconnected, same host_instance", welcome?.hostInstance === instance && welcome?.instanceChanged === false);
    expect(welcome?.hostInstance).toBe(instance);
    await waitFor(() => session.getState().workspace, "workspace again");
    session.close();
    await waitFor(() => session.getState().connection.state === "closed", "closed");
  });
});
