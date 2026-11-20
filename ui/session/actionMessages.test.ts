// SPDX-License-Identifier: GPL-3.0-or-later
import { createTranslator } from "@/i18n/catalog";
import { errorMessageKey } from "@/i18n/protocolMessages";
import { ERROR_CODES, ErrorCode } from "@/protocol";

import {
  ACTIONS_LOST_MESSAGE,
  CONFIRM_EXPIRED_MESSAGE,
  NEW_TAB_MISSING_MESSAGE,
  actionFailureMessage,
  actionMessageText,
  actionToastOptions,
  sendRefusalMessage,
} from "./actionMessages";

const en = createTranslator("en_US");
const pt = createTranslator("pt_BR");

describe("actionFailureMessage", () => {
  it("says nothing when the user cancelled", () => {
    expect(actionFailureMessage(ErrorCode.cancelled)).toBeNull();
  });

  it("says the item no longer exists for every unknown-* code", () => {
    for (const code of [
      ErrorCode.unknownWindow,
      ErrorCode.unknownGroup,
      ErrorCode.unknownTab,
      ErrorCode.unknownPane,
    ]) {
      const message = actionFailureMessage(code);
      expect(message).toEqual({ key: errorMessageKey(code), severity: "error" });
      expect(actionMessageText(message!, pt.t)).toBe("Isso não existe mais no desktop.");
    }
  });

  it("has its own text for busy, unknown-profile and last-tab", () => {
    expect(actionFailureMessage(ErrorCode.busy)).toEqual({ key: "error.busy", severity: "error" });
    expect(actionFailureMessage(ErrorCode.unknownProfile)).toEqual({
      key: "error.unknown-profile",
      severity: "error",
    });
    expect(actionFailureMessage(ErrorCode.lastTab)).toEqual({ key: "error.last-tab", severity: "error" });
    expect(actionMessageText(actionFailureMessage(ErrorCode.lastTab)!, pt.t)).toBe(
      "Não dá para fechar a última aba do desktop.",
    );
  });

  it("has the catalog text for the saved-session errors, not the generic one with the code", () => {
    expect(actionFailureMessage(ErrorCode.unknownSession)).toEqual({
      key: "error.unknown-session",
      severity: "error",
    });
    expect(actionFailureMessage(ErrorCode.sessionUnreadable)).toEqual({
      key: "error.session-unreadable",
      severity: "error",
    });
    expect(actionMessageText(actionFailureMessage(ErrorCode.unknownSession)!, pt.t)).toBe(
      "Essa sessão não existe mais no desktop. Abra a lista de novo.",
    );
    expect(actionMessageText(actionFailureMessage(ErrorCode.sessionUnreadable)!, pt.t)).toBe(
      "O desktop não conseguiu ler essa sessão.",
    );
  });

  it("says nothing was closed, as information, when the desktop timed the confirmation out", () => {
    expect(actionFailureMessage(ErrorCode.confirmTimeout)).toEqual({
      key: "error.confirm-timeout",
      severity: "info",
    });
  });

  it("shows invalid-argument and unsupported with the code, for a report", () => {
    const invalid = actionFailureMessage(ErrorCode.invalidArgument)!;
    expect(invalid).toEqual({
      key: "toast.action_failed",
      params: { code: "invalid-argument" },
      severity: "error",
      code: "invalid-argument",
    });
    expect(actionMessageText(invalid, en.t)).toBe("Could not do that (code invalid-argument).");
    expect(actionToastOptions(invalid)).toEqual({ severity: "error", code: "invalid-argument" });
    expect(actionMessageText(actionFailureMessage(ErrorCode.unsupported)!, en.t)).toBe(
      "Could not do that (code unsupported).",
    );
  });

  it("passes no code to the snackbar of a message without one", () => {
    expect(actionToastOptions(actionFailureMessage(ErrorCode.busy)!)).toEqual({ severity: "error" });
    expect(actionToastOptions(ACTIONS_LOST_MESSAGE)).toEqual({ severity: "warning" });
  });

  it("gives a code of a newer desktop the generic text", () => {
    expect(actionFailureMessage(99)).toEqual({ key: "error.unknown", severity: "error" });
  });

  it("has text in both languages for every code but cancelled", () => {
    for (const code of ERROR_CODES) {
      const message = actionFailureMessage(code);
      if (code === ErrorCode.cancelled) {
        continue;
      }
      expect(actionMessageText(message!, en.t)).not.toBe("");
      expect(actionMessageText(message!, pt.t)).not.toBe("");
    }
  });
});

describe("event and refusal messages", () => {
  it("maps the events of the session", () => {
    expect(actionMessageText(CONFIRM_EXPIRED_MESSAGE, pt.t)).toBe("Tempo esgotado: nada foi fechado.");
    expect(CONFIRM_EXPIRED_MESSAGE.severity).toBe("info");
    expect(ACTIONS_LOST_MESSAGE).toEqual({ key: "toast.actions_lost", severity: "warning" });
    expect(NEW_TAB_MISSING_MESSAGE).toEqual({ key: "toast.new_tab_missing", severity: "warning" });
  });

  it("maps the refusals of sendAction", () => {
    expect(sendRefusalMessage({ ok: true, id: 1 })).toBeNull();
    expect(sendRefusalMessage({ ok: false, reason: "busy" })?.key).toBe("toast.action_busy");
    expect(sendRefusalMessage({ ok: false, reason: "not-ready" })?.key).toBe("toast.not_connected");
    expect(sendRefusalMessage({ ok: false, reason: "send-failed" })).toEqual({
      key: "toast.send_failed",
      severity: "error",
    });
  });
});
