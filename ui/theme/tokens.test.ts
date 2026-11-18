// SPDX-License-Identifier: GPL-3.0-or-later
import { duration, icon, opacity, size, spaceScale, spacing, transitionDuration, type } from "./tokens";

describe("tokens", () => {
  it("keeps component spacing on space.scale, except the values the anatomy fixes", () => {
    const exceptions = new Set(["dialogPadding", "keyGap", "rowLineGap"]);
    for (const [name, value] of Object.entries(spacing)) {
      if (!exceptions.has(name)) {
        expect([name, (spaceScale as readonly number[]).includes(value)]).toEqual([name, true]);
      }
    }
    expect(spacing.dialogPadding).toBe(20);
    expect(spacing.keyGap).toBe(6);
    expect(spacing.rowLineGap).toBe(0);
  });

  it("sizes the key bar for one row of keys of 44", () => {
    expect(size.key).toBe(44);
    expect(size.keybarHeight).toBe(52);
    expect(size.keybarHeight).toBeGreaterThanOrEqual(size.key + 2 * spacing.keyMargin);
  });

  it("no longer has the floating button tokens", () => {
    expect("fab" in size).toBe(false);
    expect("fabInset" in spacing).toBe(false);
    expect("fab" in opacity).toBe(false);
  });

  it("sizes icons by role, with the thin and thick strokes", () => {
    expect(icon.bar).toEqual({ size: 24, strokeWidth: 2 });
    expect(icon.state).toEqual({ size: 48, strokeWidth: 1.5 });
    expect(icon.lock).toEqual({ size: 10, strokeWidth: 2.5 });
  });

  it("uses only the 400 and 500 weights in mono roles", () => {
    for (const role of Object.values(type)) {
      if (role.font === "mono") {
        expect(["400", "500"]).toContain(role.fontWeight);
      }
    }
  });

  it("zeroes transitions when motion is reduced", () => {
    expect(transitionDuration("sheet", false)).toBe(duration.sheet);
    expect(transitionDuration("reflow", true)).toBe(0);
  });
});
