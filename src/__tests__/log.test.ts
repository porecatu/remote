// SPDX-License-Identifier: GPL-3.0-or-later
import { logEvent } from "../log";

describe("logEvent", () => {
  let info: jest.SpyInstance;

  beforeEach(() => {
    info = jest.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    info.mockRestore();
  });

  it("writes only the event name when there are no fields", () => {
    logEvent("relay_connected");
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("relay_connected");
  });

  it("writes the event name and the primitive fields", () => {
    logEvent("protocol_error", { code: "busy", retry: false, attempt: 2 });
    expect(info).toHaveBeenCalledWith("protocol_error", {
      code: "busy",
      retry: false,
      attempt: 2,
    });
  });

  it("writes nothing outside development", () => {
    const g = globalThis as { __DEV__?: boolean };
    const previous = g.__DEV__;
    g.__DEV__ = false;
    try {
      logEvent("relay_dropped", { code: "x" });
      expect(info).not.toHaveBeenCalled();
    } finally {
      if (previous !== undefined) {
        g.__DEV__ = previous;
      }
    }
  });

  it("rejects free text and unknown events at compile time", () => {
    // @ts-expect-error free text is not an event name
    const bad: () => void = () => logEvent("some free text");
    expect(typeof bad).toBe("function");
  });
});
