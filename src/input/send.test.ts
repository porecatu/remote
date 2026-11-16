// SPDX-License-Identifier: GPL-3.0-or-later
import { type Message, type PaneId, NamedKey, PaneState } from "../protocol";
import { SubscriptionSet } from "../session/subscription";
import { createFakeHostKit } from "../session/subscriptionTestkit";
import { createModifierKeys } from "./modifiers";
import {
  MAX_INPUT_TEXT_BYTES,
  createInputSender,
  hasLoneSurrogate,
  isSingleScalar,
} from "./send";

const PANE = 1;

function makeSender(over: { subscribed?: boolean; state?: PaneState | undefined } = {}) {
  const sent: Message[] = [];
  const modifiers = createModifierKeys();
  const subscribed = over.subscribed ?? true;
  const state = "state" in over ? over.state : PaneState.running;
  const sender = createInputSender({
    send: (message) => sent.push(message),
    modifiers,
    isSubscribed: (pane: PaneId) => subscribed && pane === PANE,
    paneState: (pane: PaneId) => (pane === PANE ? state : undefined),
  });
  return { sender, sent, modifiers };
}

describe("pressNamed", () => {
  it("sends the named key with the numeric code and no modifiers", () => {
    const { sender, sent } = makeSender();
    expect(sender.pressNamed(PANE, NamedKey.enter)).toEqual({ ok: true });
    expect(sent).toEqual([{ type: "key", pane: PANE, key: 0, mods: 0 }]);
  });

  it("carries the armed modifiers and spends the 'once' ones", () => {
    const { sender, sent, modifiers } = makeSender();
    modifiers.tap("ctrl"); // once
    modifiers.tap("alt");
    modifiers.tap("alt"); // locked
    sender.pressNamed(PANE, NamedKey.left);
    sender.pressNamed(PANE, NamedKey.left);
    expect(sent).toEqual([
      { type: "key", pane: PANE, key: NamedKey.left, mods: 0x01 | 0x02 },
      { type: "key", pane: PANE, key: NamedKey.left, mods: 0x02 },
    ]);
  });

  it("does not spend the modifiers when the key is refused", () => {
    const { sender, sent, modifiers } = makeSender({ subscribed: false });
    modifiers.tap("ctrl");
    expect(sender.pressNamed(PANE, NamedKey.tab)).toEqual({ ok: false, reason: "not-subscribed" });
    expect(sent).toEqual([]);
    expect(modifiers.state("ctrl")).toBe("once");
  });
});

describe("typeText", () => {
  it("sends text as text-input, accents and IME composition included", () => {
    const { sender, sent } = makeSender();
    sender.typeText(PANE, "ação 日本");
    expect(sent).toEqual([{ type: "text-input", pane: PANE, text: "ação 日本" }]);
  });

  it("turns one character with Ctrl armed into a key with the modifier (RF-3.16)", () => {
    const { sender, sent, modifiers } = makeSender();
    modifiers.tap("ctrl");
    sender.typeText(PANE, "c");
    sender.typeText(PANE, "c");
    expect(sent).toEqual([
      { type: "key", pane: PANE, key: "c", mods: 0x01 },
      { type: "text-input", pane: PANE, text: "c" },
    ]);
  });

  it("a locked modifier keeps applying to single characters", () => {
    const { sender, sent, modifiers } = makeSender();
    modifiers.tap("alt");
    modifiers.tap("alt");
    sender.typeText(PANE, "x");
    sender.typeText(PANE, "y");
    expect(sent).toEqual([
      { type: "key", pane: PANE, key: "x", mods: 0x02 },
      { type: "key", pane: PANE, key: "y", mods: 0x02 },
    ]);
  });

  it("a single character outside the BMP is one scalar, so it goes as a key", () => {
    const { sender, sent, modifiers } = makeSender();
    modifiers.tap("ctrl");
    sender.typeText(PANE, "😀");
    expect(sent).toEqual([{ type: "key", pane: PANE, key: "😀", mods: 0x01 }]);
  });

  it("longer text keeps going as text-input and leaves the modifiers alone", () => {
    const { sender, sent, modifiers } = makeSender();
    modifiers.tap("ctrl");
    sender.typeText(PANE, "ls");
    expect(sent).toEqual([{ type: "text-input", pane: PANE, text: "ls" }]);
    expect(modifiers.state("ctrl")).toBe("once");
  });

  it("refuses empty text, a lone surrogate and text over the cap", () => {
    const { sender, sent } = makeSender();
    expect(sender.typeText(PANE, "")).toEqual({ ok: false, reason: "empty" });
    expect(sender.typeText(PANE, "a\ud800")).toEqual({ ok: false, reason: "invalid-text" });
    expect(sender.typeText(PANE, "é".repeat(MAX_INPUT_TEXT_BYTES / 2 + 1))).toEqual({
      ok: false,
      reason: "too-large",
    });
    expect(sender.typeText(PANE, "é".repeat(MAX_INPUT_TEXT_BYTES / 2)).ok).toBe(true);
    expect(sent).toHaveLength(1);
  });
});

describe("paste", () => {
  it("sends a single-line paste without asking", () => {
    const { sender, sent } = makeSender();
    expect(sender.paste(PANE, "echo hi")).toEqual({ ok: true });
    expect(sent).toEqual([{ type: "paste", pane: PANE, text: "echo hi" }]);
  });

  it("asks for confirmation when there is a line break, and sends nothing until it is given", () => {
    const { sender, sent } = makeSender();
    const first = sender.paste(PANE, "a\nb\nc");
    expect(first.ok).toBe(false);
    if (!first.ok && first.reason === "needs-confirmation") {
      expect(first.analysis.totalLines).toBe(3);
      expect(first.analysis.previewLines).toEqual(["a", "b", "c"]);
    } else {
      throw new Error("expected needs-confirmation");
    }
    expect(sent).toEqual([]);
    expect(sender.paste(PANE, "a\nb\nc", { confirmed: true })).toEqual({ ok: true });
    expect(sent).toEqual([{ type: "paste", pane: PANE, text: "a\nb\nc" }]);
  });

  it("a trailing newline counts: it would run the command", () => {
    const { sender } = makeSender();
    expect(sender.paste(PANE, "ls\n")).toMatchObject({ ok: false, reason: "needs-confirmation" });
  });

  it("refuses for the pane before asking for confirmation", () => {
    const { sender } = makeSender({ state: PaneState.exited });
    expect(sender.paste(PANE, "a\nb")).toEqual({ ok: false, reason: "not-running" });
  });

  it("passes the preview options to the analysis", () => {
    const { sender } = makeSender();
    const result = sender.paste(PANE, "1\n2\n3\n4", { previewLines: 2 });
    expect(result).toMatchObject({ ok: false, reason: "needs-confirmation" });
    if (!result.ok && result.reason === "needs-confirmation") {
      expect(result.analysis.hiddenLines).toBe(2);
    }
  });
});

describe("only a subscribed pane in running state receives input", () => {
  it.each([
    [PaneState.exited],
    [PaneState.notStarted],
    [PaneState.connecting],
    [PaneState.reconnecting],
    [PaneState.disconnected],
    [PaneState.awaitingDesktop],
    [undefined],
  ])("refuses in state %s", (state) => {
    const { sender, sent } = makeSender({ state });
    expect(sender.pressNamed(PANE, NamedKey.enter)).toEqual({ ok: false, reason: "not-running" });
    expect(sender.typeText(PANE, "x")).toEqual({ ok: false, reason: "not-running" });
    expect(sender.paste(PANE, "x")).toEqual({ ok: false, reason: "not-running" });
    expect(sent).toEqual([]);
  });

  it("refuses a pane that is not subscribed, before looking at its state", () => {
    const { sender, sent } = makeSender({ subscribed: false, state: PaneState.exited });
    expect(sender.typeText(PANE, "x")).toEqual({ ok: false, reason: "not-subscribed" });
    expect(sender.pressNamed(2, NamedKey.enter)).toEqual({ ok: false, reason: "not-subscribed" });
    expect(sent).toEqual([]);
  });
});

describe("text helpers", () => {
  it("isSingleScalar", () => {
    expect(isSingleScalar("a")).toBe(true);
    expect(isSingleScalar("é")).toBe(true);
    expect(isSingleScalar("😀")).toBe(true);
    expect(isSingleScalar("")).toBe(false);
    expect(isSingleScalar("ab")).toBe(false);
    // A grapheme of two code points is not one scalar.
    expect(isSingleScalar("é")).toBe(false);
    expect(isSingleScalar("\ud800")).toBe(false);
  });

  it("hasLoneSurrogate", () => {
    expect(hasLoneSurrogate("😀 ok")).toBe(false);
    expect(hasLoneSurrogate("\ud83d")).toBe(true);
    expect(hasLoneSurrogate("\ude00")).toBe(true);
    expect(hasLoneSurrogate("a\ud83dz")).toBe(true);
  });
});

describe("with the package's fake host", () => {
  function connect() {
    const kit = createFakeHostKit();
    let set: SubscriptionSet | null = null;
    const modifiers = createModifierKeys();
    kit.onMessage = (message) => {
      if (message.type === "welcome") {
        set = new SubscriptionSet({
          send: (m) => kit.send(m),
          maxSubscriptions: message.maxSubscriptions,
          nextRequestId: () => 1,
          bellVibration: () => true,
          onEvent: () => undefined,
          onProtocolError: () => undefined,
        });
        return;
      }
      set?.handle(message);
    };
    kit.open();
    const subscriptions = set as SubscriptionSet | null;
    if (subscriptions === null) {
      throw new Error("no welcome");
    }
    const sender = createInputSender({
      send: (m) => kit.send(m),
      modifiers,
      isSubscribed: (pane) => subscriptions.has(pane),
      paneState: () => PaneState.running,
    });
    return { kit, subscriptions, sender, modifiers };
  }

  it("the host receives key, text-input and paste for the subscribed pane", () => {
    const { kit, subscriptions, sender, modifiers } = connect();
    subscriptions.subscribe(PANE);
    sender.typeText(PANE, "ls");
    modifiers.tap("ctrl");
    sender.typeText(PANE, "c");
    sender.pressNamed(PANE, NamedKey.enter);
    sender.paste(PANE, "one\ntwo", { confirmed: true });
    const input = kit.host.received.map((entry) => entry.message).filter((m) => m.type !== "hello" && m.type !== "subscribe" && m.type !== "grid-ack");
    expect(input).toEqual([
      { type: "text-input", pane: PANE, text: "ls" },
      { type: "key", pane: PANE, key: "c", mods: 1 },
      { type: "key", pane: PANE, key: 0, mods: 0 },
      { type: "paste", pane: PANE, text: "one\ntwo" },
    ]);
  });

  it("nothing reaches the host for a pane that is not subscribed", () => {
    const { kit, sender } = connect();
    const before = kit.host.received.length;
    expect(sender.typeText(PANE, "x")).toEqual({ ok: false, reason: "not-subscribed" });
    expect(kit.host.received).toHaveLength(before);
  });
});
