// SPDX-License-Identifier: GPL-3.0-or-later
import { duration, icon, spaceScale, spacing, transitionDuration, type } from "./tokens";

describe("tokens", () => {
  it("keeps component spacing on space.scale, except the two values the anatomy fixes", () => {
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
