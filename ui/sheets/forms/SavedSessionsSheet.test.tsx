// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { sessionOwner } from "@/controllers/overlay";
import { t, tn } from "@/i18n/catalog";
import { REQUEST_TIMEOUT_MS } from "@/grid/scrollback";
import { type Message, type NamedSession, SessionsMode } from "@/protocol";
import { group, tab, win, workspace } from "@/workspace/testing";
import { renderWithOverlays } from "@ui/overlay/testing";
import { opacity } from "@ui/theme";

import { openSavedSessionsSheet } from "./SavedSessionsSheet";
import { createFakeSheetSession, formsWorkspace, type FakeSheetSession } from "../testing";

const hidden = { includeHiddenElements: true } as const;

const LIST: readonly NamedSession[] = [
  { session: 1, name: "api + front", readable: true },
  { session: 2, name: "infra", readable: true },
  { session: 3, name: "backup-antigo", readable: false },
];

type ListRequest = Extract<Message, { type: "list-sessions" }>;

/** The sheet session, with a `send` that records and `onMessage` that the test drives. */
function savedSession(workspaceOverride = formsWorkspace()) {
  const base = createFakeSheetSession({ workspace: workspaceOverride });
  const listeners = new Set<(message: Message) => void>();
  const requests: Message[] = [];
  const session: FakeSheetSession = {
    ...base,
    send(message) {
      requests.push(message);
      return true;
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const lists = () => requests.filter((message): message is ListRequest => message.type === "list-sessions");
  return {
    session,
    lists,
    /** The `sessions` answer to the last `list-sessions`. */
    async answer(mode: SessionsMode, list: readonly NamedSession[] = LIST) {
      const last = lists().at(-1);
      if (last === undefined) {
        throw new Error("no list-sessions sent");
      }
      await act(async () => {
        for (const listener of listeners) {
          listener({ type: "sessions", id: last.id, mode, list });
        }
      });
    },
  };
}

async function open(workspaceOverride = formsWorkspace()) {
  const rig = savedSession(workspaceOverride);
  const rendered = await renderWithOverlays(<View />);
  const onClose = jest.fn();
  await act(async () => {
    openSavedSessionsSheet(rendered.overlay, { session: rig.session, onClose });
  });
  return { ...rig, ...rendered, onClose };
}

describe("SavedSessionsSheet", () => {
  it("asks for the list on opening and shows a spinner, with no context line", async () => {
    const { lists } = await open();

    expect(lists()).toHaveLength(1);
    expect(screen.getByTestId("saved-sessions-sheet-title")).toHaveTextContent(t("saved_sessions.title"));
    expect(screen.getByTestId("saved-sessions-loading")).toBeTruthy();
    expect(screen.queryByText(t("saved_sessions.context_new_window"))).toBeNull();
    expect(screen.queryByText(t("saved_sessions.context_append"))).toBeNull();
  });

  it("lists the sessions in the desktop's order, with no chevron on new-window", async () => {
    const { answer } = await open();
    await answer(SessionsMode.newWindow);

    expect(screen.getByText(t("saved_sessions.context_new_window"))).toBeTruthy();
    const names = screen
      .getAllByTestId(/^saved-session-\d+$/)
      .map((row) => String(row.props.accessibilityLabel));
    expect(names).toEqual(["api + front", "infra", ["backup-antigo", t("saved_sessions.a11y_unavailable")].join(t("a11y.separator"))]);
    expect(screen.queryByTestId("saved-session-1-chevron", hidden)).toBeNull();
  });

  it("dims the unreadable session: no touch, 'cannot be restored' on line 2", async () => {
    const { answer, session } = await open();
    await answer(SessionsMode.newWindow);

    const row = screen.getByTestId("saved-session-3");
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(t("saved_sessions.unreadable"))).toBeTruthy();
    await fireEvent.press(row);
    expect(session.sent).toEqual([]);
  });

  it("restores on a new window at the touch, marks the row and closes on the result", async () => {
    const { answer, session, onClose } = await open();
    await answer(SessionsMode.newWindow);

    await fireEvent.press(screen.getByTestId("saved-session-2"));

    expect(session.sent).toEqual([{ type: "action", id: 1, do: { type: "restore-session", session: 2 } }]);
    expect(screen.getByTestId("saved-session-2-spinner", hidden)).toBeTruthy();
    expect(screen.getByTestId("saved-session-1").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId("saved-session-2").props.accessibilityState).toMatchObject({ busy: true });
    expect(onClose).not.toHaveBeenCalled();
    // The other readable row dims to the pending opacity.
    expect(screen.getByTestId("saved-session-1").parent?.props.style).toMatchObject({ opacity: opacity.pending });

    await act(async () => {
      session.answer(1);
    });

    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("closes on an error result too (the notice comes from the session overlays)", async () => {
    const { answer, session, onClose } = await open();
    await answer(SessionsMode.newWindow);
    await fireEvent.press(screen.getByTestId("saved-session-1"));

    await act(async () => {
      session.answer(1, { error: "session-unreadable" as never });
    });

    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("tells the user when the send is refused, and stays open", async () => {
    const { answer, session, onClose, overlays } = await open();
    await answer(SessionsMode.newWindow);
    session.refuse("not-ready");

    await fireEvent.press(screen.getByTestId("saved-session-1"));

    expect(overlays.store.getState().toast).toMatchObject({ message: t("toast.not_connected") });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByTestId("saved-session-1-spinner", hidden)).toBeNull();
  });

  it("with append, shows the context, a chevron and 'choose the window' for the reader", async () => {
    const { answer } = await open();
    await answer(SessionsMode.append);

    expect(screen.getByText(t("saved_sessions.context_append"))).toBeTruthy();
    expect(screen.getByTestId("saved-session-1").props.accessibilityLabel).toBe(
      ["api + front", t("saved_sessions.a11y_choose_window")].join(t("a11y.separator")),
    );
    expect(screen.getByTestId("saved-session-1-chevron", hidden)).toBeTruthy();
    expect(screen.queryByTestId("saved-session-3-chevron", hidden)).toBeNull();
  });

  it("with append, asks for the window of every window of the desktop and restores into it", async () => {
    const { answer, session, onClose } = await open();
    await answer(SessionsMode.append);

    await fireEvent.press(screen.getByTestId("saved-session-1"));

    expect(session.sent).toEqual([]);
    expect(screen.getByTestId("saved-sessions-sheet-title")).toHaveTextContent(t("saved_sessions.choose_window_title"));
    expect(screen.getByText("api + front")).toBeTruthy();
    // All three windows, the first one included, as in "Move to window".
    expect(screen.getAllByTestId(/^saved-sessions-window-\d+$/)).toHaveLength(3);
    expect(screen.getByTestId("saved-sessions-window-2").props.accessibilityLabel).toBe(
      ["htop", tn("workspace.tab_count", 1)].join(t("a11y.separator")),
    );

    await fireEvent.press(screen.getByTestId("saved-sessions-window-3"));

    expect(session.sent).toEqual([
      { type: "action", id: 1, do: { type: "restore-session", session: 1, window: 3 } },
    ]);
    expect(screen.getByTestId("saved-sessions-window-3-spinner", hidden)).toBeTruthy();
    expect(screen.getByTestId("saved-sessions-window-1").props.accessibilityState).toMatchObject({ disabled: true });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      session.answer(1);
    });

    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("goes back from the windows to the list without asking again", async () => {
    const { answer, lists } = await open();
    await answer(SessionsMode.append);
    await fireEvent.press(screen.getByTestId("saved-session-2"));

    await fireEvent.press(screen.getByRole("button", { name: t("saved_sessions.back") }));

    expect(screen.getByTestId("saved-sessions-sheet-title")).toHaveTextContent(t("saved_sessions.title"));
    expect(screen.getByTestId("saved-session-2")).toBeTruthy();
    expect(lists()).toHaveLength(1);
  });

  it("still asks for the window when the desktop has only one", async () => {
    const { answer } = await open(workspace([win(1, [group(10, [tab(2)])], { title: "zsh", active: 2 })]));
    await answer(SessionsMode.append);

    await fireEvent.press(screen.getByTestId("saved-session-1"));

    expect(screen.getAllByTestId(/^saved-sessions-window-\d+$/)).toHaveLength(1);
    expect(screen.getByTestId("saved-sessions-window-1").props.accessibilityLabel).toBe(
      ["zsh", tn("workspace.tab_count", 1)].join(t("a11y.separator")),
    );
  });

  it("says so when there are no saved sessions", async () => {
    const { answer } = await open();
    await answer(SessionsMode.newWindow, []);

    expect(screen.getByText(t("saved_sessions.empty"))).toBeTruthy();
    expect(screen.getByText(t("saved_sessions.empty_hint"))).toBeTruthy();
    expect(screen.queryByText(t("saved_sessions.context_new_window"))).toBeNull();
  });

  it("fails after 10 s without an answer, and 'Try again' asks once more", async () => {
    const { answer, lists, services } = await open();

    await act(async () => {
      services.fakes.time.advance(REQUEST_TIMEOUT_MS);
    });

    expect(screen.getByText(t("saved_sessions.failed"))).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: t("common.retry") }));
    expect(lists()).toHaveLength(2);
    expect(screen.getByTestId("saved-sessions-loading")).toBeTruthy();

    await answer(SessionsMode.newWindow);
    expect(screen.getByTestId("saved-session-1")).toBeTruthy();
  });

  it("closes with Cancel, with no action sent", async () => {
    const { session, onClose } = await open();

    await fireEvent.press(screen.getByRole("button", { name: t("common.cancel") }));

    expect(session.sent).toEqual([]);
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("closes when the desktop's session ends", async () => {
    const { overlays, onClose } = await open();

    await act(async () => {
      overlays.closeOwnedBy(sessionOwner(createFakeSheetSession().desktopId));
    });

    expect(onClose).toHaveBeenCalled();
  });
});
