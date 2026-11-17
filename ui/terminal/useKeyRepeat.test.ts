// SPDX-License-Identifier: GPL-3.0-or-later
import { renderHook } from "@testing-library/react-native";

import { duration } from "../theme";
import { KEY_REPEAT_TIMING, useKeyRepeat } from "./useKeyRepeat";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

async function setup() {
  const fire = jest.fn<void, [boolean]>();
  const hook = await renderHook(() => useKeyRepeat(fire));
  return { fire, handlers: () => hook.result.current, unmount: hook.unmount };
}

describe("useKeyRepeat", () => {
  it("uses the anatomy durations: 400 ms, then every 80 ms", () => {
    expect(KEY_REPEAT_TIMING).toEqual({ delay: duration.keyRepeatDelay, interval: duration.keyRepeatInterval });
    expect(KEY_REPEAT_TIMING).toEqual({ delay: 400, interval: 80 });
  });

  it("fires on touch, repeats after 400 ms and then every 80 ms, and stops on release", async () => {
    const { fire, handlers } = await setup();
    handlers().onPressIn();
    expect(fire.mock.calls).toEqual([[false]]);

    jest.advanceTimersByTime(399);
    expect(fire).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(2);
    expect(fire).toHaveBeenLastCalledWith(true);

    jest.advanceTimersByTime(79);
    expect(fire).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(160);
    expect(fire).toHaveBeenCalledTimes(5);

    handlers().onPressOut();
    // The release brings its own `onPress`: no extra key.
    handlers().onPress();
    jest.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledTimes(5);
    expect(fire.mock.calls.slice(1).every(([repeat]) => repeat)).toBe(true);
  });

  it("a quick tap fires once, also when the release comes before a delayed press-out", async () => {
    const { fire, handlers } = await setup();
    handlers().onPressIn();
    handlers().onPressOut();
    handlers().onPress();
    jest.advanceTimersByTime(1000);
    expect(fire.mock.calls).toEqual([[false]]);

    handlers().onPressIn();
    handlers().onPress();
    handlers().onPressOut();
    jest.advanceTimersByTime(1000);
    expect(fire.mock.calls).toEqual([[false], [false]]);
  });

  it("fires on a screen-reader activation, which has no touch", async () => {
    const { fire, handlers } = await setup();
    handlers().onPress();
    expect(fire.mock.calls).toEqual([[false]]);
    jest.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("forgets a touch that slid off the key (no press), so a later activation fires", async () => {
    const { fire, handlers } = await setup();
    handlers().onPressIn();
    handlers().onPressOut();
    jest.advanceTimersByTime(0);
    handlers().onPress();
    expect(fire.mock.calls).toEqual([[false], [false]]);
  });

  it("stops repeating when unmounted", async () => {
    const { fire, handlers, unmount } = await setup();
    handlers().onPressIn();
    jest.advanceTimersByTime(400);
    expect(fire).toHaveBeenCalledTimes(2);
    await unmount();
    jest.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledTimes(2);
  });

  it("calls the latest callback", async () => {
    const first = jest.fn();
    const second = jest.fn();
    let current = first;
    const hook = await renderHook(() => useKeyRepeat(current));
    hook.result.current.onPressIn();
    current = second;
    await hook.rerender({});
    jest.advanceTimersByTime(400);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(true);
    hook.result.current.onPressOut();
  });
});
