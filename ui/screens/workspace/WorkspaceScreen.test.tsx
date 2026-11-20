// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { t, tn } from "@/i18n/catalog";
import {
  ErrorCode,
  GoodbyeReason,
  type Message,
  PROTOCOL_VERSION,
  type WorkspaceMessage,
} from "@/protocol";
import { testKeypair } from "@/protocol/testing";
import { MAX_AUTOMATIC_ATTEMPTS } from "@/session/lifecycle";
import { renameTab } from "@/session/actions";
import {
  type Harness,
  type ScriptedHost,
  createHarness,
  createScriptedHost,
  greetingHost,
  makeTheme,
} from "@/session/testing";
import { PROFILES, group, tab, win, workspace } from "@/workspace/testing";
import { renderWithOverlays, type RenderWithOverlaysResult } from "@ui/overlay/testing";
import { createTestServices, type TestServices } from "@ui/services/testing";
import { duration } from "@ui/theme";

import { DesktopSessionScope } from "./DesktopSessionScope";
import { WorkspaceScreen } from "./WorkspaceScreen";

// ------------------------------------------------------------- expo-router

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() };

jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

// ------------------------------------------------------------- fixtures

const hidden = { includeHiddenElements: true } as const;
const NAME = "Test Desktop";

/** One window: tab 1 "build"; tab 2 "api" on SSH; group 10 "Servers" with tab 3. */
function oneWindow(): WorkspaceMessage {
  return workspace([
    win(
      1,
      [
        tab(1, { title: "build" }),
        tab(2, { title: "api", remote: "deploy@srv" }),
        group(10, [tab(3, { title: "logs" })], { name: "Servers" }),
      ],
      { active: 1 },
    ),
  ]);
}

/** Two windows: window 1 with tab 1; window 2 with tab 5. */
function twoWindows(): WorkspaceMessage {
  return workspace([
    win(1, [tab(1, { title: "build" })], { title: "build", active: 1 }),
    win(2, [tab(5, { title: "htop" })], { title: "htop", active: 5 }),
  ]);
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

type HostReply = (message: Message, send: (reply: Message) => void) => void;

/**
 * The workspace of a desktop on a scripted host, inside its scope. `hello`
 * answers the greeting (default: welcome, theme, profiles and `tree`); the
 * socket is not opened until `connect`.
 */
async function rig(
  options: { readonly tree?: WorkspaceMessage; readonly hello?: HostReply; readonly offline?: boolean } = {},
): Promise<Rig> {
  const h = createHarness();
  const tree = options.tree ?? oneWindow();
  if (options.offline === true) {
    // No desktop on the relay: it answers `host-unavailable`.
    h.host.detach();
  }
  const host =
    options.offline === true
      ? { received: [], broadcast: () => undefined, detach: () => undefined }
      : options.hello === undefined
      ? greetingHost(h, 1, tree)
      : (() => {
          h.host.detach();
          const hello = options.hello;
          return createScriptedHost({
            relay: h.relay,
            now: h.time.clock.now,
            hostKey: testKeypair(1),
            hostId: h.host.hostId,
            onMessage: (message, send) => {
              if (message.type === "hello") {
                hello(message, send);
              }
            },
          });
        })();
  const services = createTestServices({
    deviceKey: h.device,
    desktops: [h.desktop],
    relay: h.relay,
    time: h.time,
  });
  const result = await renderWithOverlays(
    <DesktopSessionScope desktopId={h.desktop.id}>
      <WorkspaceScreen />
    </DesktopSessionScope>,
    { services },
  );
  await settle();
  return { ...result, h, host, services };
}

/** Opens the socket of the session: the scripted host answers at once. */
async function connect(r: Rig): Promise<void> {
  await act(async () => {
    r.services.fakes.network.last().open();
  });
}

async function ready(options: { readonly tree?: WorkspaceMessage } = {}): Promise<Rig> {
  const r = await rig(options);
  await connect(r);
  expect(r.services.registry.get(r.h.desktop.id)?.getState().connection.state).toBe("ready");
  return r;
}

function greet(send: (reply: Message) => void, tree: WorkspaceMessage): void {
  send({
    type: "welcome",
    version: PROTOCOL_VERSION,
    hostName: "Scripted",
    porecatuVersion: "0.0.0-test",
    maxSubscriptions: 4,
    hostInstance: new Uint8Array(16).fill(1),
  });
  send(makeTheme());
  send(PROFILES);
  send(tree);
}

async function fromHost(r: Rig, message: Message): Promise<void> {
  await act(async () => {
    r.host.broadcast(message);
  });
}

/** Lets a sheet's entry or exit animation end. */
async function finishTransition() {
  await act(async () => {
    jest.advanceTimersByTime(duration.sheet + 50);
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

function openSheets(r: Rig) {
  return r.overlays.store.getState().entries.filter((entry) => entry.kind === "sheet" && !entry.closing);
}

beforeEach(() => {
  jest.useFakeTimers();
  for (const fn of Object.values(mockRouter)) {
    fn.mockReset();
  }
  jest.spyOn(console, "info").mockImplementation(() => undefined);
  jest.mocked(AccessibilityInfo.sendAccessibilityEvent).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ------------------------------------------------------------- tests

describe("WorkspaceScreen — connecting (§4.5.1)", () => {
  it("shows the desktop's name and the steps until the tree arrives", async () => {
    let answer: ((reply: Message) => void) | null = null;
    const r = await rig({
      hello: (_message, send) => {
        answer = send;
      },
    });

    expect(screen.getByRole("header", { name: NAME })).toBeTruthy();
    expect(screen.getByTestId("workspace-connecting-step")).toHaveTextContent(t("connection.connecting"));

    await connect(r);
    // The host took the `hello` and has not answered yet.
    expect(screen.getByTestId("workspace-connecting-step")).toHaveTextContent(t("connection.loading_workspace"));
    expect(screen.queryByTestId("workspace-tree")).toBeNull();

    await act(async () => {
      greet((reply) => answer?.(reply), oneWindow());
    });
    expect(screen.queryByTestId("workspace-connecting")).toBeNull();
    expect(screen.getByTestId("tab-1")).toBeTruthy();
  });

  it("back cancels: leaves to the list and closes the session", async () => {
    const r = await rig({ hello: () => undefined });
    await connect(r);
    await fireEvent.press(screen.getByLabelText(t("workspace.back")));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");

    await act(async () => {
      r.unmount();
    });
    expect(r.services.registry.get(r.h.desktop.id)).toBeUndefined();
  });

  it("not paired: the state screen offers to pair again and back goes to the list (RF-2.3)", async () => {
    const r = await rig({ hello: (_message, send) => send({ type: "error", code: ErrorCode.notPaired }) });
    await connect(r);

    expect(screen.getByTestId("workspace-failure")).toBeTruthy();
    expect(screen.getByRole("header", { name: t("workspace.not_paired", { name: NAME }) })).toBeTruthy();
    // The list marks the desktop "not paired".
    expect(r.services.desktops.store.getState().desktops[0]?.lastStatus.kind).toBe("not-paired");

    await fireEvent.press(screen.getByTestId("workspace-failure-pair"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/pair");
    await fireEvent.press(screen.getByLabelText(t("workspace.back")));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");
  });

  it("incompatible: says which side to update, with both versions (RF-2.2)", async () => {
    const newer = [PROTOCOL_VERSION[0] + 1, 0] as const;
    const r = await rig({ hello: (_message, send) => send({ type: "incompatible", version: newer }) });
    await connect(r);

    expect(screen.getByRole("header", { name: t("incompatible.app_too_old") })).toBeTruthy();
    expect(
      screen.getByText(
        [
          t("incompatible.app_version", { version: `${PROTOCOL_VERSION[0]}.${PROTOCOL_VERSION[1]}` }),
          t("incompatible.desktop_version", { version: `${newer[0]}.0` }),
        ].join("\n"),
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId("workspace-failure-back"));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");
  });

  it("offline: says so and tries again", async () => {
    const r = await rig({ offline: true });
    await connect(r);

    expect(screen.getByRole("header", { name: t("workspace.offline", { name: NAME }) })).toBeTruthy();
    const sockets = r.services.fakes.network.sockets.length;
    await fireEvent.press(screen.getByTestId("workspace-failure-retry"));
    expect(r.services.fakes.network.sockets.length).toBe(sockets + 1);
    expect(screen.getByTestId("workspace-connecting-step")).toHaveTextContent(t("connection.connecting"));
  });
});

describe("WorkspaceScreen — the tree (§4.5.2)", () => {
  it("shows the tree with the connection line once ready", async () => {
    await ready();

    expect(screen.getByText(t("connection.connected"))).toBeTruthy();
    expect(screen.getByTestId("tab-1")).toBeTruthy();
    expect(screen.getByTestId("tab-2")).toBeTruthy();
    expect(screen.getByTestId("group-10")).toBeTruthy();
    expect(screen.getByTestId("tab-3")).toBeTruthy();
    expect(screen.queryByTestId("connection-banner")).toBeNull();
  });

  it("has no window header with a single window, and one per window otherwise", async () => {
    const r = await ready();
    expect(screen.queryByText(t("workspace.window", { number: 1 }))).toBeNull();
    expect(screen.getByTestId("new-tab-1")).toBeTruthy();

    await fromHost(r, twoWindows());
    expect(screen.getByText(t("workspace.window", { number: 1 }))).toBeTruthy();
    expect(screen.getByText(t("workspace.window", { number: 2 }))).toBeTruthy();
    expect(screen.getByTestId("tab-5")).toBeTruthy();

    // A window collapses only in the app.
    await fireEvent.press(screen.getByTestId("window-2"));
    expect(screen.queryByTestId("tab-5")).toBeNull();
    expect(screen.getByTestId("tab-1")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("window-2"));
    expect(screen.getByTestId("tab-5")).toBeTruthy();
  });

  it("opens a group collapsed on the desktop only in the app (RF-2.8)", async () => {
    const r = await ready({
      tree: workspace([win(1, [tab(1), group(10, [tab(3), tab(4)], { name: "Servers", collapsed: true })])]),
    });
    expect(screen.getByText(t("workspace.collapsed_on_desktop"))).toBeTruthy();
    expect(screen.queryByTestId("tab-3")).toBeNull();

    await fireEvent.press(screen.getByTestId("group-10-header"));
    expect(screen.getByTestId("tab-3")).toBeTruthy();
    expect(screen.getByTestId("tab-4")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("group-10-header"));
    expect(screen.queryByTestId("tab-3")).toBeNull();
    // Nothing went to the desktop.
    expect(r.host.received.filter((message) => message.type === "action")).toEqual([]);
  });

  it("follows the desktop live: a new tab appears, a closed one goes", async () => {
    const r = await ready();
    await fromHost(
      r,
      workspace([win(1, [tab(1, { title: "build" }), tab(7, { title: "new" })], { active: 1 })], 2),
    );
    expect(screen.getByTestId("tab-7")).toBeTruthy();
    expect(screen.queryByTestId("tab-2")).toBeNull();
    expect(screen.queryByTestId("group-10")).toBeNull();
  });

  it("says when a window has no tabs, and still offers New tab", async () => {
    await ready({ tree: workspace([win(1, [])]) });
    expect(screen.getByText(t("workspace.empty_window"))).toBeTruthy();
    expect(screen.getByTestId("new-tab-1")).toBeTruthy();
  });

  it("touch on a tab opens it in the terminal", async () => {
    const r = await ready();
    await fireEvent.press(screen.getByTestId("tab-2"));
    expect(mockRouter.push).toHaveBeenCalledWith(`/desktop/${r.h.desktop.id}/tab/2`);
  });

  it("long press on a tab opens its menu, bound to the forms (RF-4.6)", async () => {
    const r = await ready();
    await fireEvent(screen.getByTestId("tab-2"), "longPress");
    expect(screen.getByTestId("tab-menu-title")).toHaveTextContent("api");
    expect(openSheets(r)[0]?.owner).toBe(`session:${r.h.desktop.id}`);

    await fireEvent.press(screen.getByTestId("tab-menu-rename", hidden));
    await finishTransition();
    expect(screen.getByTestId("rename-tab-sheet", hidden)).toBeTruthy();

    // The menu and its form give the screen reader focus back to the row (§5).
    await closeSessionSheets(r);
    expect(focusedTestIds().at(-1)).toBe("tab-2");
  });

  it("the group's menu button opens the group menu", async () => {
    const r = await ready();
    await fireEvent.press(screen.getByTestId("group-10-menu", hidden));
    expect(screen.getByTestId("group-menu-title")).toHaveTextContent("Servers");
    // The screen reader focus goes back to the button (§5).
    await closeSessionSheets(r);
    expect(focusedTestIds().at(-1)).toBe("group-10-menu");
  });

  it("the tab menu button gives the focus back to itself", async () => {
    const r = await ready();
    await fireEvent.press(screen.getByTestId("tab-1-menu", hidden));
    expect(screen.getByTestId("tab-menu-title")).toHaveTextContent("build");
    await closeSessionSheets(r);
    expect(focusedTestIds().at(-1)).toBe("tab-1-menu");
  });

  it("New tab opens the sheet with the window or the group (RF-4.1)", async () => {
    const r = await ready();
    await fireEvent.press(screen.getByTestId("new-tab-1"));
    expect(screen.getByText(t("new_tab.context_window", { number: 1 }))).toBeTruthy();

    await closeSessionSheets(r);
    // The sheet gives the screen reader focus back to the row that opened it (§5).
    expect(focusedTestIds().at(-1)).toBe("new-tab-1");
    await fireEvent.press(screen.getByTestId("group-10-new-tab"));
    expect(screen.getByText(t("new_tab.context_group", { group: "Servers" }))).toBeTruthy();
    await closeSessionSheets(r);
    expect(focusedTestIds().at(-1)).toBe("group-10-new-tab");
  });

  it("dims a tab with a pending action and takes its menu away (RF-4.9)", async () => {
    const r = await ready();
    const session = r.services.registry.get(r.h.desktop.id);
    await act(async () => {
      session?.sendAction((id) => renameTab(id, 2, "x"));
    });
    expect(screen.getByTestId("tab-2-pending", hidden)).toBeTruthy();
    expect(screen.getByTestId("tab-2").props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe("WorkspaceScreen — search (§4.5.3)", () => {
  it("filters across the tree, marks the match and gives the tree back on Cancel", async () => {
    await ready();
    await fireEvent.press(screen.getByTestId("workspace-search-open"));
    const field = screen.getByTestId("workspace-search-field-input");

    await fireEvent.changeText(field, "srv");
    expect(screen.getByTestId("tab-2")).toBeTruthy();
    expect(screen.queryByTestId("tab-1")).toBeNull();
    expect(screen.queryByTestId("tab-3")).toBeNull();
    // Line 2 shows `user@host` with the matched part in its own (bold) run.
    expect(within(screen.getByTestId("tab-2")).getByText("srv")).toBeTruthy();
    expect(screen.queryByTestId("new-tab-1")).toBeNull();

    // A match on the group's name shows the group whole.
    await fireEvent.changeText(field, "servers");
    expect(screen.getByTestId("group-10")).toBeTruthy();
    expect(screen.getByTestId("tab-3")).toBeTruthy();
    expect(screen.queryByTestId("tab-2")).toBeNull();

    await fireEvent.changeText(field, "zzz");
    expect(screen.getByRole("header", { name: t("search.no_results", { query: "zzz" }) })).toBeTruthy();

    await fireEvent.press(screen.getByTestId("workspace-search-cancel"));
    expect(screen.queryByTestId("workspace-search")).toBeNull();
    expect(screen.getByTestId("tab-1")).toBeTruthy();
    expect(screen.getByTestId("tab-2")).toBeTruthy();
    expect(screen.getByTestId("new-tab-1")).toBeTruthy();
  });

  it("opens the sections collapsed in the app while searching", async () => {
    const r = await ready();
    await fromHost(r, twoWindows());
    await fireEvent.press(screen.getByTestId("window-2"));
    expect(screen.queryByTestId("tab-5")).toBeNull();

    await fireEvent.press(screen.getByTestId("workspace-search-open"));
    await fireEvent.changeText(screen.getByTestId("workspace-search-field-input"), "htop");
    expect(screen.getByTestId("tab-5")).toBeTruthy();
    expect(screen.queryByTestId("tab-1")).toBeNull();

    await fireEvent.press(screen.getByTestId("workspace-search-clear"));
    expect(screen.queryByTestId("tab-5")).toBeNull();
  });
});

describe("WorkspaceScreen — connection (§4.5.4)", () => {
  it("keeps the tree read-only while reconnecting: no menu, no New tab", async () => {
    const r = await ready();
    await act(async () => {
      r.services.fakes.network.last().drop();
    });

    expect(screen.getByTestId("connection-banner")).toHaveTextContent(
      t("connection.reconnecting_attempt", { attempt: 1, total: MAX_AUTOMATIC_ATTEMPTS }),
    );
    expect(screen.getByText(t("connection.reconnecting"))).toBeTruthy();
    expect(screen.getByTestId("tab-1")).toBeTruthy();
    expect(screen.getByTestId("tab-3")).toBeTruthy();

    await fireEvent(screen.getByTestId("tab-2"), "longPress");
    expect(openSheets(r)).toEqual([]);
    expect(screen.getByTestId("tab-2").props.accessibilityActions).toEqual([
      { name: "open", label: t("common.open") },
    ]);
    expect(screen.getByTestId("new-tab-1").props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId("new-tab-1"));
    expect(openSheets(r)).toEqual([]);

    // Opening a tab to look at it is still possible.
    await fireEvent.press(screen.getByTestId("tab-1"));
    expect(mockRouter.push).toHaveBeenCalledWith(`/desktop/${r.h.desktop.id}/tab/1`);
  });

  it("offers Try again once the retries run out", async () => {
    const r = await ready();
    await act(async () => {
      r.host.detach();
      r.services.fakes.network.last().drop();
    });
    for (let attempt = 0; attempt < MAX_AUTOMATIC_ATTEMPTS + 1; attempt += 1) {
      await act(async () => {
        r.h.time.advance(20_000);
      });
      await act(async () => {
        const socket = r.services.fakes.network.last();
        if (!socket.opened && !socket.closedByApp) {
          socket.drop();
        }
      });
    }
    expect(screen.getByTestId("connection-banner")).toHaveTextContent(t("connection.gave_up"), { exact: false });
    expect(screen.getByText(t("connection.offline"))).toBeTruthy();
    expect(screen.getByTestId("tab-1")).toBeTruthy();

    const sockets = r.services.fakes.network.sockets.length;
    await fireEvent.press(screen.getByTestId("connection-banner-retry"));
    expect(r.services.fakes.network.sockets.length).toBe(sockets + 1);
  });

  it("goes back to the list with the reason when the desktop says goodbye (RF-2.4)", async () => {
    const r = await ready();
    await fromHost(r, { type: "goodbye", reason: GoodbyeReason.remoteDisabled });

    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");
    expect(r.overlays.store.getState().toast?.message).toBe(t("goodbye.remote-disabled"));
  });

  it("goes back to the list as not paired when the device is revoked (RF-2.3)", async () => {
    const r = await ready();
    await fromHost(r, { type: "goodbye", reason: GoodbyeReason.revoked });

    expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
    expect(r.overlays.store.getState().toast?.message).toBe(t("goodbye.revoked"));
    expect(r.services.desktops.store.getState().desktops[0]?.lastStatus.kind).toBe("not-paired");
  });

  it("reads the tab count of a group to the screen reader", async () => {
    await ready();
    expect(screen.getByTestId("group-10-header").props.accessibilityLabel).toContain(tn("workspace.tab_count", 1));
  });
});

describe("WorkspaceScreen — saved sessions (§4.5.2 item 1, §4.12.10)", () => {
  it("puts the bookmark to the left of the search in the bar", async () => {
    await ready();
    const bar = screen.getByTestId("workspace-bar");
    const ids = within(bar)
      .getAllByRole("button")
      .map((button) => String(button.props.testID));
    expect(ids.indexOf("workspace-saved-sessions")).toBeGreaterThan(-1);
    expect(ids.indexOf("workspace-saved-sessions")).toBeLessThan(ids.indexOf("workspace-search-open"));
    expect(screen.getByTestId("workspace-saved-sessions").props.accessibilityLabel).toBe(t("saved_sessions.open"));
  });

  it("opens the sheet, owned by the session, and asks the desktop for the list", async () => {
    const r = await ready();
    await fireEvent.press(screen.getByTestId("workspace-saved-sessions"));

    expect(screen.getByTestId("saved-sessions-sheet-title")).toHaveTextContent(t("saved_sessions.title"));
    expect(openSheets(r)[0]?.owner).toBe(`session:${r.h.desktop.id}`);
    expect(r.host.received.filter((message) => message.type === "list-sessions")).toHaveLength(1);
  });

  it("does not open while the session is not ready", async () => {
    const r = await ready();
    await act(async () => {
      r.services.fakes.network.last().drop();
    });

    await fireEvent.press(screen.getByTestId("workspace-saved-sessions"));

    expect(openSheets(r)).toEqual([]);
  });
});
