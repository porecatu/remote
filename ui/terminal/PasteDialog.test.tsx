// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, screen } from "@testing-library/react-native";
import { useColorScheme, View } from "react-native";
import { createStore } from "zustand/vanilla";

import type { PasteRequestResult, TerminalEvent, TerminalState } from "@/controllers/terminalSession";
import { createTranslator, getLocale, setLocale, t, tn } from "@/i18n/catalog";
import { createModifierKeys } from "@/input/modifiers";
import { analyzePaste } from "@/input/paste";
import { type InputRefusal, MAX_INPUT_TEXT_BYTES, createInputSender } from "@/input/send";
import { type ClientMessage, PaneState } from "@/protocol";
import { renderWithOverlays, type RenderWithOverlaysResult } from "@ui/overlay/testing";
import { createTestServices } from "@ui/services/testing";

import {
  LONG_LINE_CHARS,
  type PasteFlow,
  inputRefusalMessageKey,
  pasteAccessibilityText,
  pasteFooterText,
  pastePreview,
  showControlCharacters,
  useInputRefusalToasts,
  usePasteFlow,
} from "./PasteDialog";

const tr = createTranslator(getLocale());

afterEach(() => {
  setLocale("en_US");
});

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

// ------------------------------------------------------------- the pure parts

describe("showControlCharacters", () => {
  it("shows C0, DEL and C1 in caret notation and keeps text and tabs", () => {
    expect(showControlCharacters("\u001b[31mred\u001b[0m")).toBe("^[[31mred^[[0m");
    expect(showControlCharacters("a\u0000b\u0007c\u007f")).toBe("a^@b^Gc^?");
    expect(showControlCharacters("\u009b2J")).toBe("^[[2J");
    expect(showControlCharacters("\tcd /srv — ç")).toBe("\tcd /srv — ç");
  });
});

describe("pastePreview", () => {
  it("keeps the first five lines and counts the rest", () => {
    const text = ["sudo systemctl restart", "cd /srv/app", "git pull", "make deploy", "five", "six", "seven", ""].join("\n");
    const preview = pastePreview(text);
    expect(preview.totalLines).toBe(7);
    expect(preview.hiddenLines).toBe(2);
    expect(preview.totalChars).toBe(Array.from(text).length);
    expect(preview.lines.map((line) => line.text)).toEqual(["sudo systemctl restart", "cd /srv/app", "git pull", "make deploy", "five"]);
    expect(preview.lines.every((line) => !line.cut && !line.tooLong)).toBe(true);
  });

  it("marks cut lines and lines over 1000 characters", () => {
    const text = `${"a".repeat(120)}\n${"b".repeat(121)}\n${"c".repeat(LONG_LINE_CHARS + 1)}\n${"d".repeat(LONG_LINE_CHARS)}`;
    const preview = pastePreview(text, analyzePaste(text));
    expect(preview.lines.map((line) => [line.text.length, line.cut, line.tooLong])).toEqual([
      [120, false, false],
      [120, true, false],
      [120, true, true],
      [120, true, false],
    ]);
  });

  it("splits on every line break like the analysis", () => {
    const preview = pastePreview("one\r\ntwo\rthree\n");
    expect(preview.lines.map((line) => line.text)).toEqual(["one", "two", "three"]);
    expect(preview.totalLines).toBe(3);
  });
});

describe("texts of the dialog", () => {
  it("says 'and N more lines · M characters', or only the characters", () => {
    const many = pastePreview("1\n2\n3\n4\n5\n6\n7\n8\n");
    expect(pasteFooterText(many, tr)).toBe(
      t("paste.footer", { more: tn("paste.more_lines", 3), chars: tn("paste.char_count", 16) }),
    );
    expect(pasteFooterText(pastePreview("a\nb"), tr)).toBe(tn("paste.char_count", 3));
  });

  it("reads the summary and the lines as plain text", () => {
    const preview = pastePreview(`ls\n${"x".repeat(LONG_LINE_CHARS + 1)}\n`);
    const sep = t("a11y.separator");
    expect(pasteAccessibilityText(preview, tr)).toBe(
      [
        tn("paste.summary", 2, { chars: LONG_LINE_CHARS + 5 }),
        "ls",
        t("a11y.label_value", { label: "x".repeat(120), value: t("paste.line_too_long") }),
      ].join(sep),
    );
  });

  it("maps every input refusal to its catalog message, and empty to none", () => {
    const codes: readonly InputRefusal[] = ["too-large", "invalid-text", "not-running", "not-subscribed", "empty"];
    expect(codes.map(inputRefusalMessageKey)).toEqual([
      "toast.input_too_large",
      "toast.input_invalid",
      "error.pane-not-running",
      "error.pane-not-running",
      null,
    ]);
  });
});

// ------------------------------------------------------------- the flow

const HISTORY = { lines: 0, dropped: 0, total: 0, generation: 0, alt: false, loadingPages: 0, reachedOldest: true };

function terminalState(over: Partial<TerminalState> = {}): TerminalState {
  return {
    tabId: 1,
    paneId: 7,
    focusedPaneId: 7,
    panes: [],
    layout: null,
    paneState: PaneState.running,
    exitCode: null,
    status: "live",
    unavailable: null,
    stale: false,
    version: 1,
    cursor: null,
    alt: false,
    cols: 80,
    rows: 24,
    history: HISTORY,
    modifiers: { ctrl: "off", alt: "off", shift: "off" },
    paste: null,
    tabGone: null,
    canType: true,
    ...over,
  };
}

/** The paste part of the terminal controller, with the real sender (same rules, same refusals). */
function fakeTerminal() {
  const store = createStore<TerminalState>(() => terminalState());
  const sent: ClientMessage[] = [];
  const listeners = new Set<(event: TerminalEvent) => void>();
  let pending: string | null = null;
  const sender = createInputSender({
    send: (message) => {
      sent.push(message);
    },
    modifiers: createModifierKeys(),
    isSubscribed: () => true,
    paneState: () => store.getState().paneState ?? undefined,
  });
  const refuse = (code: InputRefusal) => {
    for (const listener of listeners) {
      listener({ type: "input-refused", code });
    }
  };
  const clear = () => {
    pending = null;
    store.setState({ paste: null });
  };
  return {
    store,
    sent,
    pasteRequest: jest.fn((text: string): PasteRequestResult => {
      clear();
      const result = sender.paste(7, text);
      if (result.ok) {
        return { needsConfirmation: false, sent: true };
      }
      if (result.reason === "needs-confirmation") {
        pending = text;
        store.setState({ paste: result.analysis });
        return { needsConfirmation: true, analysis: result.analysis };
      }
      refuse(result.reason);
      return { needsConfirmation: false, sent: false };
    }),
    pasteConfirm: jest.fn((): boolean => {
      const text = pending;
      clear();
      if (text === null) {
        return false;
      }
      const result = sender.paste(7, text, { confirmed: true });
      if (!result.ok && result.reason !== "needs-confirmation") {
        refuse(result.reason);
      }
      return result.ok;
    }),
    pasteCancel: jest.fn(clear),
    onEvent(listener: (event: TerminalEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type FakeTerminal = ReturnType<typeof fakeTerminal>;

type Rig = RenderWithOverlaysResult & {
  readonly terminal: FakeTerminal;
  readonly flow: () => PasteFlow;
};

async function setup(clipboardText = ""): Promise<Rig> {
  const terminal = fakeTerminal();
  const box: { flow: PasteFlow | null } = { flow: null };
  function Probe({ onFlow }: { readonly onFlow: (flow: PasteFlow) => void }) {
    const flow = usePasteFlow(terminal, { owner: "session:d1" });
    useInputRefusalToasts(terminal);
    onFlow(flow);
    return <View />;
  }
  const services = createTestServices({ clipboardText });
  const result = await renderWithOverlays(
    <Probe
      onFlow={(flow) => {
        box.flow = flow;
      }}
    />,
    { services },
  );
  return {
    ...result,
    terminal,
    flow: () => {
      if (box.flow === null) {
        throw new Error("the probe did not render");
      }
      return box.flow;
    },
  };
}

const toastMessage = (rig: Rig) => rig.overlays.store.getState().toast?.message ?? null;
const openDialogs = (rig: Rig) => rig.overlays.store.getState().entries.filter((entry) => !entry.closing);

describe("usePasteFlow", () => {
  it("pastes text without a line break straight away, with no dialog", async () => {
    const rig = await setup("echo hi");
    await act(async () => {
      await rig.flow().pasteFromClipboard();
    });
    expect(rig.terminal.sent).toEqual([{ type: "paste", pane: 7, text: "echo hi" }]);
    expect(openDialogs(rig)).toHaveLength(0);
  });

  it("an empty clipboard is a snackbar, and nothing is pasted", async () => {
    const rig = await setup("");
    await act(async () => {
      await rig.flow().pasteFromClipboard();
    });
    expect(toastMessage(rig)).toBe(t("paste.clipboard_empty"));
    expect(rig.terminal.pasteRequest).not.toHaveBeenCalled();
  });

  it("asks first for a text with any line break, showing the preview, with Cancel focused", async () => {
    const rig = await setup("ls\n");
    await act(async () => {
      await rig.flow().pasteFromClipboard();
    });
    expect(rig.terminal.sent).toEqual([]);
    expect(screen.getByRole("header", { name: tn("paste.title", 1) })).toBeOnTheScreen();
    expect(screen.getByTestId("paste-dialog-preview").props.accessibilityLabel).toBe(
      pasteAccessibilityText(pastePreview("ls\n"), tr),
    );
    expect(screen.getByText(tn("paste.char_count", 3), { includeHiddenElements: true })).toBeOnTheScreen();
    const focus = screen.getByTestId("paste-dialog-focus");
    expect(focus).toContainElement(screen.getByRole("button", { name: t("common.cancel") }));
    expect(openDialogs(rig)[0]?.owner).toBe("session:d1");
  });

  it("shows control characters, cut lines and the long line warning in the preview", async () => {
    const rig = await setup(`\u001b[2J\n${"y".repeat(LONG_LINE_CHARS + 1)}\nz`);
    await act(async () => {
      await rig.flow().pasteFromClipboard();
    });
    expect(screen.getByText("^[[2J", { includeHiddenElements: true })).toBeOnTheScreen();
    expect(
      screen.getByText(t("paste.line_cut", { line: "y".repeat(120) }), { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.getByText(t("paste.line_too_long"), { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it("Paste sends the text and closes", async () => {
    const rig = await setup("make\nmake install\n");
    await act(async () => {
      await rig.flow().pasteFromClipboard();
    });
    await fireEvent.press(screen.getByRole("button", { name: t("common.paste") }));
    expect(rig.terminal.sent).toEqual([{ type: "paste", pane: 7, text: "make\nmake install\n" }]);
    expect(openDialogs(rig)).toHaveLength(0);
  });

  it("Cancel sends nothing and drops the waiting paste", async () => {
    const rig = await setup("rm -rf build\n");
    await act(async () => {
      await rig.flow().pasteFromClipboard();
    });
    await fireEvent.press(screen.getByRole("button", { name: t("common.cancel") }));
    expect(rig.terminal.pasteCancel).toHaveBeenCalled();
    expect(rig.terminal.sent).toEqual([]);
    expect(rig.terminal.store.getState().paste).toBeNull();
    expect(openDialogs(rig)).toHaveLength(0);
  });

  it("the back button cancels like Cancel", async () => {
    const rig = await setup("a\nb");
    await act(async () => {
      rig.flow().paste("a\nb");
    });
    const id = openDialogs(rig)[0]?.id ?? "";
    await act(async () => {
      rig.overlays.close(id, "dismiss");
    });
    expect(rig.terminal.pasteCancel).toHaveBeenCalled();
    expect(rig.terminal.store.getState().paste).toBeNull();
    expect(rig.terminal.sent).toEqual([]);
  });

  it("disables Paste while the pane is not running", async () => {
    const rig = await setup("a\nb");
    await act(async () => {
      rig.flow().paste("a\nb");
    });
    expect(screen.getByRole("button", { name: t("common.paste") })).toBeEnabled();
    await act(async () => {
      rig.terminal.store.setState({ canType: false, paneState: PaneState.exited });
    });
    const paste = screen.getByRole("button", { name: t("common.paste") });
    expect(paste).toBeDisabled();
    await fireEvent.press(paste);
    expect(rig.terminal.sent).toEqual([]);
    await act(async () => {
      rig.terminal.store.setState({ canType: true, paneState: PaneState.running });
    });
    expect(screen.getByRole("button", { name: t("common.paste") })).toBeEnabled();
  });

  it("follows a change of language while open", async () => {
    const rig = await setup("a\nb");
    await act(async () => {
      rig.flow().paste("a\nb");
    });
    expect(screen.getByRole("header", { name: tn("paste.title", 2) })).toBeOnTheScreen();
    await act(async () => {
      await rig.services.settings.update({ language: "pt_BR" });
    });
    const pt = createTranslator("pt_BR");
    expect(screen.getByRole("header", { name: pt.tn("paste.title", 2) })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: pt.t("common.paste") })).toBeEnabled();
    expect(screen.getByText(pt.tn("paste.char_count", 3), { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it("drops the waiting paste when the session closes the dialog", async () => {
    const rig = await setup("a\nb");
    await act(async () => {
      rig.flow().paste("a\nb");
    });
    await act(async () => {
      rig.overlays.closeOwnedBy("session:d1");
    });
    expect(rig.terminal.pasteCancel).toHaveBeenCalledTimes(1);
    expect(rig.terminal.sent).toEqual([]);
    expect(openDialogs(rig)).toHaveLength(0);
  });

  it("closes when the controller drops the waiting paste", async () => {
    const rig = await setup("a\nb");
    await act(async () => {
      rig.flow().paste("a\nb");
    });
    expect(openDialogs(rig)).toHaveLength(1);
    await act(async () => {
      rig.terminal.store.setState({ paste: null });
    });
    expect(openDialogs(rig)).toHaveLength(0);
  });

  it("a paste over 1 MiB is refused with the catalog snackbar, before any dialog", async () => {
    const rig = await setup();
    const huge = `${"x".repeat(MAX_INPUT_TEXT_BYTES)}\nmore`;
    await act(async () => {
      rig.flow().paste(huge);
    });
    expect(toastMessage(rig)).toBe(t("toast.input_too_large"));
    expect(openDialogs(rig)).toHaveLength(0);
    expect(rig.terminal.sent).toEqual([]);
  });

  it("a paste to a pane that is not running is refused with the catalog snackbar", async () => {
    const rig = await setup();
    rig.terminal.store.setState({ paneState: PaneState.exited, canType: false });
    await act(async () => {
      rig.flow().paste("ls\n");
    });
    expect(toastMessage(rig)).toBe(t("error.pane-not-running"));
    expect(openDialogs(rig)).toHaveLength(0);
  });
});
