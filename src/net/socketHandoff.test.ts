// SPDX-License-Identifier: GPL-3.0-or-later

import type { RelaySocketHandlers } from "./relaySocket";
import { createSwitchableHandlers } from "./socketHandoff";

function recorder(name: string, log: string[]): RelaySocketHandlers {
  return {
    onOpen: () => log.push(`${name}:open`),
    onFrame: (frame) => log.push(`${name}:frame:${frame[0] ?? -1}`),
    onClose: (info) => log.push(`${name}:close:${info.code}`),
  };
}

describe("switchable socket handlers", () => {
  it("forwards to the target it starts with", () => {
    const log: string[] = [];
    const s = createSwitchableHandlers(recorder("a", log));
    s.handlers.onOpen();
    s.handlers.onFrame(Uint8Array.of(1));
    s.handlers.onClose({ code: 1000, reason: "normal", local: true });
    expect(log).toEqual(["a:open", "a:frame:1", "a:close:1000"]);
    expect(s.queued()).toBe(0);
  });

  it("queues while there is no target and delivers in order to the next one", () => {
    const log: string[] = [];
    const s = createSwitchableHandlers(recorder("a", log));
    s.handlers.onFrame(Uint8Array.of(1));
    s.setTarget(null);
    s.handlers.onFrame(Uint8Array.of(2));
    s.handlers.onFrame(Uint8Array.of(3));
    s.handlers.onClose({ code: 1006, reason: "unknown", local: false });
    expect(s.queued()).toBe(3);
    expect(log).toEqual(["a:frame:1"]);

    s.setTarget(recorder("b", log));
    expect(log).toEqual(["a:frame:1", "b:frame:2", "b:frame:3", "b:close:1006"]);
    expect(s.queued()).toBe(0);
    s.handlers.onFrame(Uint8Array.of(4));
    expect(log).toEqual(["a:frame:1", "b:frame:2", "b:frame:3", "b:close:1006", "b:frame:4"]);
  });

  it("starts empty-handed when given no target", () => {
    const log: string[] = [];
    const s = createSwitchableHandlers();
    s.handlers.onOpen();
    expect(s.queued()).toBe(1);
    s.setTarget(recorder("a", log));
    expect(log).toEqual(["a:open"]);
  });

  it("keeps the order when a target hands over from inside a delivery", () => {
    const log: string[] = [];
    const s = createSwitchableHandlers();
    const b = recorder("b", log);
    s.handlers.onFrame(Uint8Array.of(1));
    s.handlers.onFrame(Uint8Array.of(2));
    s.setTarget({
      onOpen: () => undefined,
      onFrame: (frame) => {
        log.push(`a:frame:${frame[0] ?? -1}`);
        s.setTarget(b);
      },
      onClose: () => undefined,
    });
    expect(log).toEqual(["a:frame:1", "b:frame:2"]);
  });

  it("delivers an event raised during a delivery after the current one", () => {
    const log: string[] = [];
    const s = createSwitchableHandlers();
    s.setTarget({
      onOpen: () => {
        log.push("open");
        s.handlers.onFrame(Uint8Array.of(9));
        log.push("open-done");
      },
      onFrame: (frame) => log.push(`frame:${frame[0] ?? -1}`),
      onClose: () => undefined,
    });
    s.handlers.onOpen();
    expect(log).toEqual(["open", "open-done", "frame:9"]);
  });
});
