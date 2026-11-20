// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { useState, type ReactElement } from "react";
import { AccessibilityInfo, Text } from "react-native";

import { createTranslator, setLocale } from "@/i18n/catalog";
import { ConfirmKind, ErrorCode, type Message, type RequestId } from "@/protocol";
import { closePane, closeTab, newTab, renameTab } from "@/session/actions";
import { CONFIRM_TIMEOUT_MS } from "@/session/confirm";
import { NEW_TAB_APPEAR_TIMEOUT_MS } from "@/session/requests";
import { type SessionStore, createSessionStore } from "@/session/sessionStore";
import { type Harness, type ScriptedHost, createHarness, greetingHost } from "@/session/testing";
import { sessionOwner } from "@/controllers/overlay";
import { pane, split, tab, win, workspace } from "@/workspace/testing";
import { renderWithOverlays, type RenderWithOverlaysResult } from "@ui/overlay/testing";
import { createTestServices } from "@ui/services/testing";

import { SessionOverlays, tabRoute } from "./SessionOverlays";

// ------------------------------------------------------------- expo-router

const mockRouter = { push: jest.fn() };

jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

// ------------------------------------------------------------- fixtures

const en = createTranslator("en_US");
const announce = jest.mocked(AccessibilityInfo.announceForAccessibilityWithOptions);

/** Tab 1 "build"; tab 2 with the panes 200 (no title) and 201; pinned tab 3 "notes" with the panes 300 and 301. */
const TREE = workspace([
  win(1, [tab(1, { title: "build" }), tab(2, { layout: split(0, 32768, pane(200, { title: "" }), pane(201)) })], {
    active: 1,
    pinned: [tab(3, { title: "notes", layout: split(0, 32768, pane(300, { title: "vim" }), pane(301)), focused: 300 })],
  }),
]);

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => undefined);
  mockRouter.push.mockClear();
  announce.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  setLocale("en_US");
});

type Rig = RenderWithOverlaysResult & {
  readonly h: Harness;
  readonly host: ScriptedHost;
  readonly session: SessionStore;
};

/** A ready session on a scripted desktop, with `ui` (default: only the overlays) rendered over it. */
async function rig(ui?: (desktopId: string) => ReactElement): Promise<Rig> {
  const h = createHarness();
  const host = greetingHost(h, 1, TREE);
  const session = createSessionStore({
    desktop: h.desktop,
    device: h.device,
    appVersion: "0.0.1",
    openSocket: h.network.openSocket,
    clock: h.time.clock,
    scheduler: h.time.scheduler,
  });
  session.start();
  h.network.last().open();
  expect(session.getState().connection.state).toBe("ready");
  const services = createTestServices({ time: h.time, relay: h.relay });
  jest
    .spyOn(services.registry, "get")
    .mockImplementation((id) => (id === h.desktop.id ? session : undefined));
  const element = ui === undefined ? <SessionOverlays desktopId={h.desktop.id} /> : ui(h.desktop.id);
  const result = await renderWithOverlays(element, { services });
  return { ...result, h, host, session };
}

function sent(r: Rig, type: Message["type"]): Message[] {
  return r.host.received.filter((message) => message.type === type);
}

async function send(r: Rig, build: Parameters<SessionStore["sendAction"]>[0]): Promise<RequestId> {
  let id: RequestId = 0;
  await act(async () => {
    const result = r.session.sendAction(build);
    if (!result.ok) {
      throw new Error(`action refused: ${result.reason}`);
    }
    id = result.id;
  });
  return id;
}

async function fromHost(r: Rig, message: Message): Promise<void> {
  await act(async () => {
    r.host.broadcast(message);
  });
}

async function advance(r: Rig, ms: number): Promise<void> {
  await act(async () => {
    r.h.time.advance(ms);
  });
}

/** A close of tab 1 the desktop asks to confirm. */
async function askToClose(
  r: Rig,
  kind: ConfirmKind = ConfirmKind.runningProcess,
  processes: readonly string[] = ["make", "node"],
): Promise<RequestId> {
  const id = await send(r, (rid) => closeTab(rid, 1));
  await fromHost(r, { type: "confirm-request", id, kind, processes });
  return id;
}

function toast(r: Rig) {
  return r.overlays.store.getState().toast;
}

function openEntries(r: Rig) {
  return r.overlays.store.getState().entries.filter((entry) => !entry.closing);
}

// ------------------------------------------------------------- confirmation

describe("SessionOverlays: close confirmation", () => {
  it("opens the dialog with the tab title, the reason and the processes", async () => {
    const r = await rig();
    await askToClose(r, ConfirmKind.runningProcess, ["make", "node", "cc1", "ld", "as", "sh", "awk"]);

    expect(screen.getByRole("header", { name: en.t("confirm_close.title_tab", { title: "build" }) })).toBeTruthy();
    expect(screen.getByText(en.t("confirm.running-process"))).toBeTruthy();
    for (const name of ["make", "node", "cc1", "ld", "as"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.queryByText("sh")).toBeNull();
    expect(screen.getByText(en.t("confirm_close.more_processes", { count: 2 }))).toBeTruthy();
    expect(screen.queryByTestId("confirm-close-pinned-note")).toBeNull();
    expect(screen.getByRole("button", { name: en.t("common.cancel") })).toBeTruthy();
    expect(screen.getByRole("button", { name: en.t("common.close_tab") })).toBeTruthy();
    expect(screen.getByText(en.tn("confirm_close.time_left", 60))).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(en.tn("confirm_close.deadline_announce", 60), { queue: true });
    // The dialog belongs to the session, not to a screen.
    expect(openEntries(r)).toEqual([expect.objectContaining({ kind: "dialog", owner: sessionOwner(r.h.desktop.id) })]);
  });

  it("says the SSH connection is open, without a list", async () => {
    const r = await rig();
    await askToClose(r, ConfirmKind.sshConnection, []);

    expect(screen.getByText(en.t("confirm.ssh-connection"))).toBeTruthy();
    expect(screen.queryByTestId("confirm-close-processes")).toBeNull();
  });

  it("uses the pane wording for close-pane, with Pane N for a pane without title", async () => {
    const r = await rig();
    const id = await send(r, (rid) => closePane(rid, 200));
    await fromHost(r, { type: "confirm-request", id, kind: ConfirmKind.sshConnection, processes: [] });

    expect(
      screen.getByRole("header", {
        name: en.t("confirm_close.title_pane", { title: en.t("panes.untitled", { index: 1 }) }),
      }),
    ).toBeTruthy();
    expect(screen.getByText(en.t("confirm_close.ssh_connection_pane"))).toBeTruthy();
    expect(screen.getByRole("button", { name: en.t("common.close_pane") })).toBeTruthy();
  });

  it("says a pinned tab gets unpinned; with nothing alive, only that and the deadline", async () => {
    const r = await rig();
    const id = await send(r, (rid) => closeTab(rid, 3));
    await fromHost(r, { type: "confirm-request", id, kind: ConfirmKind.runningProcess, processes: [] });

    expect(screen.getByRole("header", { name: en.t("confirm_close.title_tab", { title: "notes" }) })).toBeTruthy();
    expect(screen.getByText(en.t("confirm_close.pinned_note"))).toBeTruthy();
    expect(screen.queryByText(en.t("confirm.running-process"))).toBeNull();
    expect(screen.queryByTestId("confirm-close-processes")).toBeNull();
    expect(screen.getByText(en.tn("confirm_close.time_left", 60))).toBeTruthy();
    expect(screen.getByRole("button", { name: en.t("common.close_tab") })).toBeTruthy();
  });

  it("keeps the processes of a pinned tab and adds the note under them", async () => {
    const r = await rig();
    const id = await send(r, (rid) => closeTab(rid, 3));
    await fromHost(r, { type: "confirm-request", id, kind: ConfirmKind.runningProcess, processes: ["vim"] });

    expect(screen.getByText(en.t("confirm.running-process"))).toBeTruthy();
    expect(screen.getByText("vim")).toBeTruthy();
    expect(screen.getByText(en.t("confirm_close.pinned_note"))).toBeTruthy();
  });

  it("adds the note to the close of a pane of a pinned tab", async () => {
    const r = await rig();
    const id = await send(r, (rid) => closePane(rid, 300));
    await fromHost(r, { type: "confirm-request", id, kind: ConfirmKind.sshConnection, processes: [] });

    expect(screen.getByRole("header", { name: en.t("confirm_close.title_pane", { title: "vim" }) })).toBeTruthy();
    expect(screen.getByText(en.t("confirm_close.ssh_connection_pane"))).toBeTruthy();
    expect(screen.getByText(en.t("confirm_close.pinned_note"))).toBeTruthy();
  });

  it("follows a change of language while open, without opening it again", async () => {
    const r = await rig();
    const id = await send(r, (rid) => closePane(rid, 200));
    await fromHost(r, { type: "confirm-request", id, kind: ConfirmKind.runningProcess, processes: ["make"] });
    const opened = openEntries(r).map((entry) => entry.id);

    await act(async () => {
      await r.services.settings.update({ language: "pt_BR" });
    });

    const pt = createTranslator("pt_BR");
    expect(
      screen.getByRole("header", {
        name: pt.t("confirm_close.title_pane", { title: pt.t("panes.untitled", { index: 1 }) }),
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: pt.t("common.cancel") })).toBeTruthy();
    const accept = screen.getByRole("button", { name: pt.t("common.close_pane") });
    expect(accept.props.accessibilityHint).toBe(pt.t("a11y.destructive"));
    expect(screen.getByText(pt.t("confirm_close.running_process_pane"))).toBeTruthy();
    expect(openEntries(r).map((entry) => entry.id)).toEqual(opened);

    await fireEvent.press(accept);
    expect(sent(r, "confirm")).toEqual([{ type: "confirm", id, accept: true }]);
  });

  it("counts the deadline down and, at 60 s, closes with the notice that nothing was closed", async () => {
    const r = await rig();
    const id = await askToClose(r);

    await advance(r, 1000);
    expect(screen.getByText(en.tn("confirm_close.time_left", 59))).toBeTruthy();
    await advance(r, 29_000);
    expect(screen.getByText(en.tn("confirm_close.time_left", 30))).toBeTruthy();
    expect(screen.getByTestId("confirm-close-deadline-fill")).toHaveStyle({ width: "50%" });
    expect(screen.getByTestId("confirm-close-deadline")).toHaveAccessibilityValue({ now: 30, max: 60 });
    await advance(r, 29_000);
    expect(screen.getByText(en.tn("confirm_close.time_left", 1))).toBeTruthy();

    await advance(r, 1000);
    expect(screen.queryByTestId("confirm-close-dialog")).toBeNull();
    expect(toast(r)).toMatchObject({ message: en.t("error.confirm-timeout"), severity: "info" });
    expect(sent(r, "confirm")).toEqual([]);

    // The desktop's own timeout does not repeat the notice.
    const shown = toast(r)?.id;
    await fromHost(r, { type: "action-result", id, error: ErrorCode.confirmTimeout });
    expect(toast(r)?.id).toBe(shown);
    expect(CONFIRM_TIMEOUT_MS).toBe(60_000);
  });

  it("answers Close with accept and closes the dialog", async () => {
    const r = await rig();
    const id = await askToClose(r);

    await fireEvent.press(screen.getByRole("button", { name: en.t("common.close_tab") }));

    expect(sent(r, "confirm")).toEqual([{ type: "confirm", id, accept: true }]);
    expect(screen.queryByTestId("confirm-close-dialog")).toBeNull();
    await fromHost(r, { type: "action-result", id });
    expect(toast(r)).toBeNull();
  });

  it("answers Cancel without accept, and the cancelled result shows nothing", async () => {
    const r = await rig();
    const id = await askToClose(r);

    await fireEvent.press(screen.getByRole("button", { name: en.t("common.cancel") }));

    expect(sent(r, "confirm")).toEqual([{ type: "confirm", id, accept: false }]);
    expect(screen.queryByTestId("confirm-close-dialog")).toBeNull();
    await fromHost(r, { type: "action-result", id, error: ErrorCode.cancelled });
    expect(toast(r)).toBeNull();
  });

  it("answers the back button as Cancel", async () => {
    const r = await rig();
    const id = await askToClose(r);

    await act(async () => {
      r.overlays.closeTop("dismiss");
    });

    expect(sent(r, "confirm")).toEqual([{ type: "confirm", id, accept: false }]);
  });

  it("closes the dialog when the result arrives before an answer", async () => {
    const r = await rig();
    const id = await askToClose(r);

    await fromHost(r, { type: "action-result", id, error: ErrorCode.lastTab });

    expect(screen.queryByTestId("confirm-close-dialog")).toBeNull();
    expect(toast(r)).toMatchObject({ message: en.t("error.last-tab"), severity: "error" });
  });

  it("shows the next confirmation after the first is answered", async () => {
    const r = await rig();
    const first = await askToClose(r);
    const second = await send(r, (rid) => closeTab(rid, 2));
    await fromHost(r, { type: "confirm-request", id: second, kind: ConfirmKind.sshConnection, processes: [] });
    expect(screen.getByRole("header", { name: en.t("confirm_close.title_tab", { title: "build" }) })).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: en.t("common.cancel") }));

    expect(sent(r, "confirm")).toEqual([{ type: "confirm", id: first, accept: false }]);
    expect(screen.getByRole("header", { name: en.t("confirm_close.title_tab", { title: "tab 2" }) })).toBeTruthy();
    expect(screen.getByText(en.t("confirm.ssh-connection"))).toBeTruthy();
  });

  it("stays over a change of screen of the same desktop, and closes when the user leaves it", async () => {
    const controls: { show?: (name: string) => void; leave?: () => void } = {};
    function DesktopStack({ desktopId }: { readonly desktopId: string }) {
      const [name, setName] = useState("workspace");
      const [open, setOpen] = useState(true);
      controls.show = setName;
      controls.leave = () => setOpen(false);
      return open ? (
        <>
          <Text key={name} testID={`screen-${name}`}>
            {name}
          </Text>
          <SessionOverlays desktopId={desktopId} />
        </>
      ) : null;
    }
    const r = await rig((desktopId) => <DesktopStack desktopId={desktopId} />);
    await askToClose(r);

    await act(async () => {
      controls.show?.("terminal");
    });
    // The screen sits under the dialog, hidden from the screen reader.
    expect(screen.getByTestId("screen-terminal", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("screen-workspace", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId("confirm-close-dialog")).toBeTruthy();

    await act(async () => {
      controls.leave?.();
    });
    expect(openEntries(r)).toEqual([]);
  });
});

// ------------------------------------------------------------- notices

describe("SessionOverlays: notices", () => {
  it.each([
    [ErrorCode.unknownTab, "error.unknown-tab", undefined],
    [ErrorCode.busy, "error.busy", undefined],
    [ErrorCode.unknownProfile, "error.unknown-profile", undefined],
    [ErrorCode.lastTab, "error.last-tab", undefined],
    [ErrorCode.invalidArgument, "toast.action_failed", { code: "invalid-argument" }],
    [ErrorCode.unsupported, "toast.action_failed", { code: "unsupported" }],
  ] as const)("shows the notice of code %s", async (code, key, params) => {
    const r = await rig();
    const id = await send(r, (rid) => renameTab(rid, 1, "x"));

    await fromHost(r, { type: "action-result", id, error: code });

    expect(toast(r)).toMatchObject({ message: en.t(key, params), severity: "error" });
    const shown = toast(r);
    expect(shown === null ? undefined : r.overlays.toastCode(shown.id)).toBe(params?.code);
    if (params === undefined) {
      expect(screen.queryByTestId("toast-code")).toBeNull();
    } else {
      expect(screen.getByTestId("toast-code")).toHaveTextContent(params.code);
    }
  });

  it("shows the desktop's confirm-timeout when the app had not timed out yet", async () => {
    const r = await rig();
    const id = await askToClose(r);

    await fromHost(r, { type: "action-result", id, error: ErrorCode.confirmTimeout });

    expect(screen.queryByTestId("confirm-close-dialog")).toBeNull();
    expect(toast(r)).toMatchObject({ message: en.t("error.confirm-timeout"), severity: "info" });
  });

  it("shows nothing for a cancelled action nor for a successful one", async () => {
    const r = await rig();
    const cancelled = await send(r, (rid) => renameTab(rid, 1, "x"));
    await fromHost(r, { type: "action-result", id: cancelled, error: ErrorCode.cancelled });
    const done = await send(r, (rid) => renameTab(rid, 2, "y"));
    await fromHost(r, { type: "action-result", id: done });

    expect(toast(r)).toBeNull();
  });

  it("says the actions were lost when the session drops, and closes the dialog", async () => {
    const r = await rig();
    await askToClose(r);

    await act(async () => {
      r.h.network.last().drop();
    });

    expect(screen.queryByTestId("confirm-close-dialog")).toBeNull();
    expect(toast(r)).toMatchObject({ message: en.t("toast.actions_lost"), severity: "warning" });
  });

  it("closes every overlay of the session when it ends", async () => {
    const r = await rig();
    await act(async () => {
      r.overlay.openDialog({
        title: "menu",
        buttons: [{ label: "ok" }],
        owner: sessionOwner(r.h.desktop.id),
      });
      r.overlay.openDialog({ title: "app", buttons: [{ label: "ok" }] });
    });

    await act(async () => {
      r.session.close();
    });

    expect(openEntries(r)).toEqual([expect.objectContaining({ owner: "app" })]);
  });
});

// ------------------------------------------------------------- created tab

describe("SessionOverlays: created tab", () => {
  it("opens the created tab in the terminal once it is in the workspace", async () => {
    const r = await rig();
    const id = await send(r, (rid) => newTab(rid, 1));

    await fromHost(r, { type: "action-result", id, created: 9 });
    expect(mockRouter.push).not.toHaveBeenCalled();

    await fromHost(r, workspace([win(1, [tab(1), tab(2), tab(9)], { active: 1 })], 2));
    expect(mockRouter.push).toHaveBeenCalledWith(tabRoute(r.h.desktop.id, 9));
    expect(tabRoute(r.h.desktop.id, 9)).toBe(`/desktop/${r.h.desktop.id}/tab/9`);
  });

  it("opens it at once when the workspace came first", async () => {
    const r = await rig();
    const id = await send(r, (rid) => newTab(rid, 1));

    await fromHost(r, workspace([win(1, [tab(1), tab(2), tab(9)], { active: 1 })], 2));
    await fromHost(r, { type: "action-result", id, created: 9 });

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith(tabRoute(r.h.desktop.id, 9));
  });

  it("says the new tab did not show up when it never comes", async () => {
    const r = await rig();
    const id = await send(r, (rid) => newTab(rid, 1));
    await fromHost(r, { type: "action-result", id, created: 9 });

    await advance(r, NEW_TAB_APPEAR_TIMEOUT_MS);

    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(toast(r)).toMatchObject({ message: en.t("toast.new_tab_missing"), severity: "warning" });
  });
});
