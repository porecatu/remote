// SPDX-License-Identifier: GPL-3.0-or-later
import { createTranslator } from "./catalog";
import { describeRelativeTime, formatRelativeTime } from "./relativeTime";

// Dates are built with the local-time constructor, so the calendar ranges
// ("yesterday", the date) hold in any time zone the tests run in.

const NOW = new Date(2026, 10, 16, 12, 0, 0).getTime();

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function local(...parts: [number, number, number, number?, number?]): string {
  const [year, month, day, hours = 0, minutes = 0] = parts;
  return new Date(year, month, day, hours, minutes).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe("describeRelativeTime", () => {
  it("is now under a minute and for a time in the future", () => {
    expect(describeRelativeTime(ago(0), NOW)).toEqual({ kind: "now" });
    expect(describeRelativeTime(ago(59 * SECOND), NOW)).toEqual({ kind: "now" });
    expect(describeRelativeTime(ago(-5 * MINUTE), NOW)).toEqual({ kind: "now" });
  });

  it("counts whole minutes under an hour", () => {
    expect(describeRelativeTime(ago(MINUTE), NOW)).toEqual({ kind: "minutes", count: 1 });
    expect(describeRelativeTime(ago(3 * MINUTE + 59 * SECOND), NOW)).toEqual({
      kind: "minutes",
      count: 3,
    });
    expect(describeRelativeTime(ago(59 * MINUTE), NOW)).toEqual({ kind: "minutes", count: 59 });
  });

  it("counts whole hours under a day, across midnight too", () => {
    expect(describeRelativeTime(ago(HOUR), NOW)).toEqual({ kind: "hours", count: 1 });
    expect(describeRelativeTime(ago(23 * HOUR + 59 * MINUTE), NOW)).toEqual({
      kind: "hours",
      count: 23,
    });
    const justAfterMidnight = new Date(2026, 10, 16, 0, 30).getTime();
    expect(describeRelativeTime(local(2026, 10, 15, 23, 0), justAfterMidnight)).toEqual({
      kind: "hours",
      count: 1,
    });
  });

  it("is yesterday a day or more ago on the previous calendar day", () => {
    expect(describeRelativeTime(local(2026, 10, 15, 11, 0), NOW)).toEqual({ kind: "yesterday" });
    expect(describeRelativeTime(local(2026, 10, 15, 0, 0), NOW)).toEqual({ kind: "yesterday" });
  });

  it("is yesterday across a month and a year boundary", () => {
    const newYear = new Date(2027, 0, 1, 12, 0).getTime();
    expect(describeRelativeTime(local(2026, 11, 31, 8, 0), newYear)).toEqual({
      kind: "yesterday",
    });
  });

  it("is the local date when older", () => {
    expect(describeRelativeTime(local(2026, 10, 14, 23, 59), NOW)).toEqual({
      kind: "date",
      day: 14,
      month: 11,
      year: 2026,
    });
    expect(describeRelativeTime(local(2025, 2, 5, 9, 0), NOW)).toEqual({
      kind: "date",
      day: 5,
      month: 3,
      year: 2025,
    });
  });

  it("is unknown for a text that is not a date", () => {
    expect(describeRelativeTime("not a date", NOW)).toEqual({ kind: "unknown" });
  });
});

describe("formatRelativeTime", () => {
  it("writes each range in pt_BR", () => {
    expect(formatRelativeTime(ago(10 * SECOND), NOW, "pt_BR")).toBe("agora");
    expect(formatRelativeTime(ago(MINUTE), NOW, "pt_BR")).toBe("há 1 min");
    expect(formatRelativeTime(ago(3 * MINUTE), NOW, "pt_BR")).toBe("há 3 min");
    expect(formatRelativeTime(ago(HOUR), NOW, "pt_BR")).toBe("há 1 h");
    expect(formatRelativeTime(ago(5 * HOUR), NOW, "pt_BR")).toBe("há 5 h");
    expect(formatRelativeTime(local(2026, 10, 15, 9, 0), NOW, "pt_BR")).toBe("ontem");
    expect(formatRelativeTime(local(2025, 2, 5, 9, 0), NOW, "pt_BR")).toBe("05/03/2025");
    expect(formatRelativeTime("", NOW, "pt_BR")).toBe("data desconhecida");
  });

  it("writes each range in en_US", () => {
    expect(formatRelativeTime(ago(10 * SECOND), NOW, "en_US")).toBe("now");
    expect(formatRelativeTime(ago(MINUTE), NOW, "en_US")).toBe("1 min ago");
    expect(formatRelativeTime(ago(3 * MINUTE), NOW, "en_US")).toBe("3 min ago");
    expect(formatRelativeTime(ago(HOUR), NOW, "en_US")).toBe("1 h ago");
    expect(formatRelativeTime(ago(5 * HOUR), NOW, "en_US")).toBe("5 h ago");
    expect(formatRelativeTime(local(2026, 10, 15, 9, 0), NOW, "en_US")).toBe("yesterday");
    expect(formatRelativeTime(local(2025, 2, 5, 9, 0), NOW, "en_US")).toBe("03/05/2025");
    expect(formatRelativeTime("", NOW, "en_US")).toBe("unknown time");
  });

  it("accepts the screen's translator", () => {
    expect(formatRelativeTime(ago(3 * MINUTE), NOW, createTranslator("pt_BR"))).toBe("há 3 min");
  });
});
