// SPDX-License-Identifier: GPL-3.0-or-later

import { ConfirmKind, decodeMessage, encodeMessage, type ConfirmRequest } from "@/protocol";
import {
  CONFIRM_TIMEOUT_MS,
  activeConfirm,
  answerConfirm,
  confirmRemainingMs,
  createConfirmState,
  dropConfirm,
  expireConfirms,
  nextConfirmDeadline,
  receiveConfirmRequest,
} from "./confirm";

function request(id: number, kind: ConfirmKind = ConfirmKind.runningProcess): ConfirmRequest {
  return { type: "confirm-request", id, kind, processes: ["vim", "node"] };
}

describe("confirm", () => {
  it("stores the request with a 60 s expiry", () => {
    const state = receiveConfirmRequest(createConfirmState(), request(5), 1000);
    const entry = activeConfirm(state);
    expect(entry).toEqual({
      id: 5,
      kind: ConfirmKind.runningProcess,
      processes: ["vim", "node"],
      receivedAt: 1000,
      expiresAt: 1000 + CONFIRM_TIMEOUT_MS,
    });
    expect(CONFIRM_TIMEOUT_MS).toBe(60_000);
    expect(entry && confirmRemainingMs(entry, 31_000)).toBe(30_000);
    expect(entry && confirmRemainingMs(entry, 99_000)).toBe(0);
  });

  it("answers with a valid confirm message, and only once", () => {
    let state = receiveConfirmRequest(createConfirmState(), request(5), 0);
    const yes = answerConfirm(state, 5, true);
    expect(yes.message).toEqual({ type: "confirm", id: 5, accept: true });
    expect(yes.state).toEqual([]);
    if (yes.message !== null) {
      expect(decodeMessage(encodeMessage(yes.message), "client").ok).toBe(true);
    }
    expect(answerConfirm(yes.state, 5, true).message).toBeNull();

    state = receiveConfirmRequest(createConfirmState(), request(6), 0);
    expect(answerConfirm(state, 6, false).message).toEqual({
      type: "confirm",
      id: 6,
      accept: false,
    });
  });

  it("sends nothing for an id that is not pending", () => {
    const state = receiveConfirmRequest(createConfirmState(), request(5), 0);
    const step = answerConfirm(state, 6, true);
    expect(step.message).toBeNull();
    expect(step.state).toBe(state);
  });

  it("expires after 60 s and reports what was dropped", () => {
    const state = receiveConfirmRequest(createConfirmState(), request(5, ConfirmKind.sshConnection), 0);
    expect(expireConfirms(state, 59_999).expired).toEqual([]);
    const late = expireConfirms(state, 60_000);
    expect(late.expired.map((entry) => entry.id)).toEqual([5]);
    expect(late.state).toEqual([]);
    expect(answerConfirm(late.state, 5, true).message).toBeNull();
  });

  it("keeps arrival order and shows the oldest first", () => {
    let state = receiveConfirmRequest(createConfirmState(), request(1), 0);
    state = receiveConfirmRequest(state, request(2), 10_000);
    expect(activeConfirm(state)?.id).toBe(1);
    expect(nextConfirmDeadline(state)).toBe(60_000);
    const step = expireConfirms(state, 60_000);
    expect(step.expired.map((entry) => entry.id)).toEqual([1]);
    expect(activeConfirm(step.state)?.id).toBe(2);
    expect(nextConfirmDeadline(step.state)).toBe(70_000);
  });

  it("replaces a repeated id and restarts its clock", () => {
    let state = receiveConfirmRequest(createConfirmState(), request(1), 0);
    state = receiveConfirmRequest(state, request(1), 30_000);
    expect(state).toHaveLength(1);
    expect(activeConfirm(state)?.expiresAt).toBe(90_000);
  });

  it("drops the dialog when the action result arrives first", () => {
    const state = receiveConfirmRequest(createConfirmState(), request(1), 0);
    expect(dropConfirm(state, 1)).toEqual([]);
    expect(dropConfirm(state, 2)).toBe(state);
  });

  it("has no deadline when nothing is pending", () => {
    expect(nextConfirmDeadline(createConfirmState())).toBeNull();
    expect(activeConfirm(createConfirmState())).toBeNull();
  });
});
