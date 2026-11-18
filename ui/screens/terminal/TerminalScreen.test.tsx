// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo, TextInput } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { useKeyboardState } from "react-native-keyboard-controller";
import { createStore } from "zustand/vanilla";

import { t } from "@/i18n/catalog";
import {
  CursorShape,
  ErrorCode,
  type GridSnapshot,
  type Line,
  type Message,
  NamedKey,
  PaneState,
  SplitDir,
  type WorkspaceMessage,
} from "@/protocol";
import { type Harness, type ScriptedHost, createHarness, greetingHost } from "@/session/testing";
import { pane, split, tab, win, workspace } from "@/workspace/testing";
import { renderWithOverlays, type RenderWithOverlaysResult } from "@ui/overlay/testing";
import { useStoreState } from "@ui/hooks/useStoreState";
import { DesktopSessionScope } from "@ui/screens/workspace/DesktopSessionScope";
import { createTestServices, type TestServices, type TestServicesOptions } from "@ui/services/testing";
import { GRID_GESTURE_IDS } from "@ui/terminal/grid/useGridGestures";
import { duration, opacity } from "@ui/theme";

import { TerminalScreen } from "./TerminalScreen";

// ------------------------------------------------------------- expo-router

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  dismissTo: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};

jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

// ------------------------------------------------------------- system keyboard

/** Whether the mocked system keyboard is on screen. */
let keyboardShown = false;

function mockKeyboardState(): void {
  const implementation = (selector?: (state: { readonly isVisible: boolean }) => unknown) => {
    const state = {
      isVisible: keyboardShown,
      height: 0,
      duration: 0,
      timestamp: 0,
      target: 0,
      type: "default",
      appearance: "default",
    };
    return selector === undefined ? state : selector(state);
  };
  jest.mocked(useKeyboardState).mockImplementation(implementation as typeof useKeyboardState);
}

// The Jest mock of `TextInput` shares `jest.fn` instance methods on its prototype.
const focusSpy = () => jest.mocked(TextInput.prototype.focus);

// ------------------------------------------------------------- fixtures

const hidden = { includeHiddenElements: true } as const;
const CURSOR = { row: 1, col: 2, shape: CursorShape.block, visible: true } as const;
const PLAIN = [null, null, 0] as const;
const LINE: Line = [false, [[0, 1, 0, "ab"]]];

/** Tab 1 "build" has two panes (100 focused, 101); tab 2 has one (200). */
function twoPanes(state: PaneState = PaneState.running): WorkspaceMessage {
  return workspace([
    win(
      1,
      [
        tab(1, {
          title: "build",
          layout: split(
            SplitDir.sideBySide,
            32768,
            pane(100, { state, cwd: "~/src" }),
            pane(101, { title: "logs" }),
          ),
          focused: 100,
        }),
        tab(2, { title: "htop" }),
      ],
      { active: 1 },
    ),
  ]);
}

/** Only tab 2: tab 1 was closed on the desktop. */
function withoutTab1(): WorkspaceMessage {
  return workspace([win(1, [tab(2, { title: "htop" })], { active: 2 })], 2);
}

function snapshot(paneId: number, seq: number): GridSnapshot {
  return {
    type: "grid-snapshot",
    pane: paneId,
    seq,
    cols: 4,
    rows: 2,
    history: 0,
    dropped: 0,
    styles: [PLAIN],
    lines: [LINE, [false, []]],
    cursor: CURSOR,
    alt: false,
  };
}

/** Whether the terminal is on screen; turning it off leaves the terminal while the desktop stays open. */
const terminalShown = createStore(() => ({ shown: true }));
const selectShown = (state: { readonly shown: boolean }) => state.shown;

function Probe({ tabId }: { readonly tabId: number }) {
  const shown = useStoreState(terminalShown, selectShown);
  return shown ? <TerminalScreen tabId={tabId} /> : null;
}

function setTerminalShown(shown: boolean): void {
  terminalShown.setState({ shown });
}

type Rig = RenderWithOverlaysResult & {
  readonly h: Harness;
  readonly host: ScriptedHost;
  readonly services: TestServices;
};

/** Lets the queued promises (the list read, the secure store) settle. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    // Timers first, then the promises: advancing the fake timers also runs
    // the faked microtasks, and React's check that this act is awaited must
    // not run before the test awaits it.
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
  }
}

/**
 * The terminal of `tabId` on a scripted host that answers `subscribe` with a
 * snapshot, inside the desktop's scope, with the session `ready`.
 */
async function rig(
  options: {
    readonly tree?: WorkspaceMessage;
    readonly tabId?: number;
    readonly services?: Omit<TestServicesOptions, "deviceKey" | "desktops" | "relay" | "time">;
  } = {},
): Promise<Rig> {
  const h = createHarness();
  const seqs = new Map<number, number>();
  const host = greetingHost(h, 1, options.tree ?? twoPanes(), (message: Message, send) => {
    if (message.type === "subscribe") {
      const seq = (seqs.get(message.pane) ?? -1) + 1;
      seqs.set(message.pane, seq);
      send(snapshot(message.pane, seq));
    }
  });
  const services = createTestServices({
    ...options.services,
    deviceKey: h.device,
    desktops: [h.desktop],
    relay: h.relay,
    time: h.time,
  });
  const result = await renderWithOverlays(
    <DesktopSessionScope desktopId={h.desktop.id}>
      <Probe tabId={options.tabId ?? 1} />
    </DesktopSessionScope>,
    { services },
  );
  await settle();
  await act(async () => {
    services.fakes.network.last().open();
  });
  expect(services.registry.get(h.desktop.id)?.getState().connection.state).toBe("ready");
  return { ...result, h, host, services };
}

function received(r: Rig, type: Message["type"]): Message[] {
  return r.host.received.filter((message) => message.type === type);
}

async function fromHost(r: Rig, message: Message): Promise<void> {
  await act(async () => {
    r.host.broadcast(message);
  });
}

async function finishTransition(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(duration.sheet + 50);
  });
}

async function tapGrid(): Promise<void> {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(GRID_GESTURE_IDS.tap), [
      { state: State.BEGAN },
      { state: State.ACTIVE },
      { state: State.END },
    ]);
    // The tap reaches the JS thread through the worklets' scheduler.
    jest.runAllTicks();
    jest.advanceTimersByTime(0);
  });
}

/** The testIDs the screen reader focus was sent to, in order. */
function focusedTestIds(): string[] {
  return jest
    .mocked(AccessibilityInfo.sendAccessibilityEvent)
    .mock.calls.filter(([, type]) => type === "focus")
    .map(([target]) => (target as unknown as { props?: { testID?: string } }).props?.testID ?? "");
}

/** Closes every sheet of the session and lets the exits end. */
async function closeSessionSheets(r: Rig): Promise<void> {
  await act(async () => {
    r.overlays.closeOwnedBy(`session:${r.h.desktop.id}`);
  });
  await finishTransition();
}

const captureField = () => screen.getByTestId("capture-input", hidden);

/** The system keyboard opens for the terminal's field. */
async function openKeyboard(): Promise<void> {
  keyboardShown = true;
  await fireEvent(captureField(), "focus");
}

beforeEach(() => {
  jest.useFakeTimers();
  for (const fn of Object.values(mockRouter)) {
    fn.mockClear();
  }
  mockRouter.canGoBack.mockImplementation(() => true);
  keyboardShown = false;
  mockKeyboardState();
  setTerminalShown(true);
  focusSpy().mockClear();
  jest.spyOn(console, "info").mockImplementation(() => undefined);
  jest.mocked(AccessibilityInfo.sendAccessibilityEvent).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ------------------------------------------------------------- tests

describe("TerminalScreen — subscription and privacy", () => {
  it("subscribes the focused pane of the tab and shows its title and directory", async () => {
    const r = await rig();
    expect(received(r, "subscribe")).toEqual([{ type: "subscribe", pane: 100 }]);
    expect(screen.getByTestId("terminal-bar-title")).toHaveTextContent("build");
    expect(screen.getByTestId("terminal-bar-detail")).toHaveTextContent("~/src");
    expect(screen.getByLabelText(t("terminal.pane_chip_a11y", { index: 1, total: 2 }))).toBeTruthy();
  });

  it("cancels the subscription when the user leaves the terminal", async () => {
    const r = await rig();
    expect(received(r, "unsubscribe")).toEqual([]);
    await act(async () => {
      setTerminalShown(false);
    });
    expect(received(r, "unsubscribe")).toEqual([{ type: "unsubscribe", pane: 100 }]);
  });

  it("blocks screen capture while open and allows it again on leaving (FLAG_SECURE)", async () => {
    const r = await rig();
    const capture = r.services.fakes.screenCapture;
    expect(capture.prevented).toBe(true);
    await act(async () => {
      setTerminalShown(false);
    });
    expect(capture.prevented).toBe(false);
    expect(capture.calls).toEqual(["prevent", "allow"]);
  });

  it("goes back from the bar's back button", async () => {
    await rig();
    await fireEvent.press(screen.getByTestId("terminal-bar-back"));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

describe("TerminalScreen — input", () => {
  it("opens the keyboard on a tap only when the pane is running", async () => {
    await rig();
    await tapGrid();
    expect(focusSpy()).toHaveBeenCalledTimes(1);
  });

  it("does not open the keyboard for a pane that is not running", async () => {
    await rig({ tree: twoPanes(PaneState.notStarted) });
    await tapGrid();
    expect(focusSpy()).not.toHaveBeenCalled();
    expect(screen.getByLabelText(t("terminal.keyboard_unavailable"))).toBeDisabled();
  });

  it("shows the key bar only while the keyboard is open, and sends Ctrl + c as a key", async () => {
    const r = await rig();
    expect(screen.queryByTestId("keybar")).toBeNull();
    await openKeyboard();
    expect(screen.getByTestId("keybar")).toBeTruthy();
    expect(screen.getByLabelText(t("terminal.hide_keyboard"))).toBeTruthy();

    await fireEvent.press(screen.getByTestId("keybar-ctrl"));
    await fireEvent.changeText(captureField(), "c");
    expect(received(r, "key")).toEqual([{ type: "key", pane: 100, key: "c", mods: 0x01 }]);
    expect(received(r, "text-input")).toEqual([]);
  });

  it("sends plain typing as text", async () => {
    const r = await rig();
    await openKeyboard();
    await fireEvent.changeText(captureField(), "ls");
    expect(received(r, "text-input")).toEqual([{ type: "text-input", pane: 100, text: "ls" }]);
  });

  it("asks before pasting text with a line break from the keyboard, and sends it on Paste", async () => {
    const r = await rig();
    await openKeyboard();
    await fireEvent.changeText(captureField(), "make\nmake install");
    await finishTransition();
    expect(screen.getByTestId("paste-dialog")).toBeTruthy();
    expect(received(r, "paste")).toEqual([]);
    expect(received(r, "text-input")).toEqual([]);

    await fireEvent.press(screen.getByTestId("paste-dialog-paste"));
    expect(received(r, "paste")).toEqual([{ type: "paste", pane: 100, text: "make\nmake install" }]);
  });

  it("pastes from the clipboard with the key bar, and says when it is empty", async () => {
    const r = await rig({ services: { clipboardText: "" } });
    await openKeyboard();
    await fireEvent.press(screen.getByTestId("keybar-paste"));
    await settle();
    expect(screen.getByText(t("paste.clipboard_empty"))).toBeTruthy();

    r.services.fakes.clipboard.setText("uptime");
    await fireEvent.press(screen.getByTestId("keybar-paste"));
    await settle();
    expect(received(r, "paste")).toEqual([{ type: "paste", pane: 100, text: "uptime" }]);
  });

  it("shows the arrow pad with the key bar, and an arrow takes the armed modifier", async () => {
    const r = await rig();
    expect(screen.queryByTestId("arrowpad")).toBeNull();
    await openKeyboard();
    expect(screen.getByTestId("arrowpad")).toBeTruthy();
    // The pad is in the grid area, not in the bar: a touch outside the parent never reaches a child on Android.
    expect(screen.getByTestId("keybar")).not.toContainElement(screen.getByTestId("arrowpad"));

    await fireEvent.press(screen.getByTestId("keybar-ctrl"));
    await fireEvent.press(screen.getByTestId("arrowpad-up"));
    expect(received(r, "key")).toEqual([{ type: "key", pane: 100, key: NamedKey.up, mods: 0x01 }]);
  });

  it("hides the arrow pad and the key bar together when the keyboard closes", async () => {
    await rig();
    await openKeyboard();
    expect(screen.getByTestId("arrowpad")).toBeTruthy();
    keyboardShown = false;
    await fireEvent(captureField(), "blur");
    expect(screen.queryByTestId("arrowpad")).toBeNull();
    expect(screen.queryByTestId("keybar")).toBeNull();
  });

  it("types a symbol of the bar as text, and as a key when Ctrl is armed", async () => {
    const r = await rig();
    await openKeyboard();
    await fireEvent.press(screen.getByTestId("keybar-symbol-pipe"));
    expect(received(r, "text-input")).toEqual([{ type: "text-input", pane: 100, text: "|" }]);

    await fireEvent.press(screen.getByTestId("keybar-ctrl"));
    await fireEvent.press(screen.getByTestId("keybar-symbol-backslash"));
    expect(received(r, "key")).toEqual([{ type: "key", pane: 100, key: "\\", mods: 0x01 }]);
  });
});

describe("TerminalScreen — view options in the tab menu", () => {
  it("has no floating buttons: the view options are the first items of the tab menu", async () => {
    await rig();
    expect(screen.queryByTestId("fab")).toBeNull();
    await fireEvent.press(screen.getByTestId("terminal-bar-menu"));
    await finishTransition();
    expect(screen.getByTestId("tab-menu-fit-width")).toBeTruthy();
    expect(screen.getByTestId("tab-menu-follow-cursor")).toBeTruthy();
    expect(screen.getByTestId("tab-menu-scroll-to-bottom")).toBeTruthy();
    expect(screen.getByTestId("tab-menu-view-divider", hidden)).toBeTruthy();
  });

  it("dims Follow the cursor with its reason when the grid fits the screen", async () => {
    await rig();
    await fireEvent.press(screen.getByTestId("terminal-bar-menu"));
    await finishTransition();
    expect(screen.getByTestId("tab-menu-follow-cursor").props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByText(t("tab_menu.not_wide_note"))).toBeTruthy();
  });
});

describe("TerminalScreen — bell", () => {
  it("lights the bell and vibrates when the setting is on", async () => {
    const r = await rig();
    await fromHost(r, { type: "bell", pane: 100 });
    expect(screen.getByTestId("terminal-bar-bell")).toBeTruthy();
    expect(r.services.fakes.haptics.calls).toEqual(["notify-warning"]);
  });

  it("lights the bell without vibrating when the setting is off", async () => {
    const r = await rig({ services: { settings: { bellVibration: false } } });
    await fromHost(r, { type: "bell", pane: 100 });
    expect(screen.getByTestId("terminal-bar-bell")).toBeTruthy();
    expect(r.services.fakes.haptics.calls).toEqual([]);
  });
});

describe("TerminalScreen — tree changes and errors", () => {
  it("goes back to the tree with a notice when the tab is closed on the desktop", async () => {
    const r = await rig();
    await fromHost(r, withoutTab1());
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(screen.getByText(t("toast.tab_closed"))).toBeTruthy();
  });

  it("goes back to the workspace when a grid message breaks the protocol", async () => {
    const r = await rig();
    // The next diff must be seq 1.
    await fromHost(r, { ...snapshot(100, 7), type: "grid-snapshot" });
    await fromHost(r, {
      type: "grid-diff",
      pane: 100,
      seq: 3,
      history: 0,
      dropped: 0,
      styles: [PLAIN],
      lines: [[1, LINE]],
      cursor: CURSOR,
      alt: false,
    });
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

describe("TerminalScreen — connection", () => {
  it("stays read-only while reconnecting, and subscribes again with the same desktop instance", async () => {
    const r = await rig();
    await act(async () => {
      r.services.fakes.network.last().drop();
    });
    expect(screen.getByTestId("connection-banner")).toBeTruthy();
    expect(screen.getByLabelText(t("terminal.keyboard_unavailable"))).toBeDisabled();
    expect(screen.getByTestId("terminal-grid-area")).toHaveStyle({ opacity: opacity.readOnly });
    await fireEvent.press(screen.getByTestId("terminal-bar-menu"));
    expect(r.overlays.store.getState().entries).toEqual([]);

    const sockets = r.services.fakes.network.sockets.length;
    await act(async () => {
      // The first automatic retry (1 s, anatomy §4.5.4).
      r.h.time.advance(1_000);
    });
    expect(r.services.fakes.network.sockets.length).toBe(sockets + 1);
    await act(async () => {
      r.services.fakes.network.last().open();
    });
    expect(screen.queryByTestId("connection-banner")).toBeNull();
    expect(received(r, "subscribe")).toEqual([
      { type: "subscribe", pane: 100 },
      { type: "subscribe", pane: 100 },
    ]);
    expect(screen.getByLabelText(t("terminal.show_keyboard"))).toBeEnabled();
  });
});

describe("TerminalScreen — pane states", () => {
  it("shows Start for a pane not started and sends start-pane", async () => {
    const r = await rig({ tree: twoPanes(PaneState.notStarted) });
    expect(screen.getByText(t("pane_state_card.not_started"))).toBeTruthy();
    await fireEvent.press(screen.getByTestId("pane-state-start"));
    const actions = received(r, "action");
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "action", do: { type: "start-pane", pane: 100 } });
  });

  it("shows the exited banner in place of the key bar, with Close tab", async () => {
    const r = await rig({ tree: twoPanes(PaneState.exited) });
    expect(screen.getByTestId("pane-banner")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("pane-banner-close"));
    expect(received(r, "action")[0]).toMatchObject({ do: { type: "close-tab", tab: 1 } });
  });

  it("closes a pinned tab from the banner at once: the only confirmation is the desktop's", async () => {
    const pinned = workspace([
      win(1, [tab(2, { title: "htop" })], {
        active: 1,
        pinned: [tab(1, { title: "build", layout: pane(100, { state: PaneState.exited }), focused: 100 })],
      }),
    ]);
    const r = await rig({ tree: pinned });
    await fireEvent.press(screen.getByTestId("pane-banner-close"));
    expect(received(r, "action")).toEqual([
      { type: "action", id: expect.any(Number), do: { type: "close-tab", tab: 1 } },
    ]);
    expect(r.overlays.store.getState().entries.filter((entry) => entry.kind === "dialog")).toEqual([]);
  });
});

describe("TerminalScreen — activate-tab", () => {
  it("makes the tab the desktop's active one when it opens", async () => {
    const r = await rig({ tabId: 2 });
    expect(received(r, "action")).toEqual([
      { type: "action", id: expect.any(Number), do: { type: "activate-tab", tab: 2 } },
    ]);
  });

  it("sends nothing for the tab that already is the active one", async () => {
    const r = await rig();
    expect(received(r, "action")).toEqual([]);
  });

  it("shows nothing when the desktop refuses it, nor when the session drops before the answer", async () => {
    const r = await rig({ tabId: 2 });
    const [action] = received(r, "action");
    const id = action?.type === "action" ? action.id : 0;
    await fromHost(r, { type: "action-result", id, error: ErrorCode.unsupported });
    expect(r.overlays.store.getState().toast).toBeNull();

    const other = await rig({ tabId: 2 });
    await act(async () => {
      other.services.fakes.network.last().drop();
    });
    expect(other.overlays.store.getState().toast).toBeNull();
  });
});

describe("TerminalScreen — panes and tab menu", () => {
  it("switches the pane from the picker: the old subscription is cancelled first", async () => {
    const r = await rig();
    await fireEvent.press(screen.getByTestId("terminal-bar-panes"));
    await finishTransition();
    await fireEvent.press(screen.getByTestId("pane-picker-row-101"));
    await finishTransition();
    expect(received(r, "unsubscribe")).toEqual([{ type: "unsubscribe", pane: 100 }]);
    expect(received(r, "subscribe")).toEqual([
      { type: "subscribe", pane: 100 },
      { type: "subscribe", pane: 101 },
    ]);
    expect(screen.getByLabelText(t("terminal.pane_chip_a11y", { index: 2, total: 2 }))).toBeTruthy();
    // The picker gives the screen reader focus back to the pane chip (§5).
    expect(focusedTestIds().at(-1)).toBe("terminal-bar-panes");
  });

  it("opens the tab menu with Close pane when the tab has two panes", async () => {
    const r = await rig();
    await fireEvent.press(screen.getByTestId("terminal-bar-menu"));
    await finishTransition();
    expect(screen.getByTestId("tab-menu-close-pane")).toBeTruthy();
    // The menu gives the screen reader focus back to its button (§5).
    await closeSessionSheets(r);
    expect(focusedTestIds().at(-1)).toBe("terminal-bar-menu");
  });

  it("has no pane chip for a tab with a single pane", async () => {
    await rig({ tabId: 2 });
    expect(screen.queryByTestId("terminal-bar-panes")).toBeNull();
  });
});
