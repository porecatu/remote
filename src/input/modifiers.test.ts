// SPDX-License-Identifier: GPL-3.0-or-later

import {
  MODIFIER_BITS,
  MODIFIERS,
  createModifierKeys,
  maskOf,
  nextOnTap,
  type ModifiersSnapshot,
} from "./modifiers";

describe("modifier bits", () => {
  it("match spec 03 section 6", () => {
    expect(MODIFIER_BITS).toEqual({ ctrl: 0x01, alt: 0x02, shift: 0x04, meta: 0x08 });
  });
});

describe("nextOnTap", () => {
  it("cycles off -> once -> locked -> off", () => {
    expect(nextOnTap("off")).toBe("once");
    expect(nextOnTap("once")).toBe("locked");
    expect(nextOnTap("locked")).toBe("off");
  });
});

describe("createModifierKeys", () => {
  it("starts with everything off", () => {
    const keys = createModifierKeys();
    expect(keys.peek()).toBe(0);
    for (const m of MODIFIERS) {
      expect(keys.state(m)).toBe("off");
    }
  });

  it("one tap arms only the next key", () => {
    const keys = createModifierKeys();
    keys.tap("ctrl");
    expect(keys.state("ctrl")).toBe("once");
    expect(keys.consume()).toBe(0x01);
    expect(keys.state("ctrl")).toBe("off");
    expect(keys.consume()).toBe(0);
  });

  it("two taps lock until a third turns it off", () => {
    const keys = createModifierKeys();
    keys.tap("alt");
    keys.tap("alt");
    expect(keys.state("alt")).toBe("locked");
    expect(keys.consume()).toBe(0x02);
    expect(keys.consume()).toBe(0x02);
    expect(keys.state("alt")).toBe("locked");
    keys.tap("alt");
    expect(keys.state("alt")).toBe("off");
    expect(keys.consume()).toBe(0);
  });

  it("combines modifiers and clears only the 'once' ones", () => {
    const keys = createModifierKeys();
    keys.tap("ctrl");
    keys.tap("ctrl"); // locked
    keys.tap("alt"); // once
    keys.tap("shift"); // once
    keys.tap("meta");
    keys.tap("meta"); // locked
    expect(keys.peek()).toBe(0x01 | 0x02 | 0x04 | 0x08);
    expect(keys.consume()).toBe(0x0f);
    expect(keys.snapshot()).toEqual({
      ctrl: "locked",
      alt: "off",
      shift: "off",
      meta: "locked",
    });
    expect(keys.peek()).toBe(0x09);
  });

  it("peek does not change state", () => {
    const keys = createModifierKeys();
    keys.tap("shift");
    expect(keys.peek()).toBe(0x04);
    expect(keys.peek()).toBe(0x04);
    expect(keys.state("shift")).toBe("once");
  });

  it("release turns one modifier off, armed or locked, and leaves the others alone", () => {
    const keys = createModifierKeys();
    keys.tap("ctrl");
    keys.tap("alt");
    keys.tap("alt");
    keys.tap("shift");
    keys.release("alt");
    expect(keys.snapshot()).toMatchObject({ ctrl: "once", alt: "off", shift: "once" });
    keys.release("ctrl");
    expect(keys.snapshot()).toMatchObject({ ctrl: "off", alt: "off", shift: "once" });
    expect(keys.peek()).toBe(MODIFIER_BITS.shift);
  });

  it("reset turns everything off, locked included", () => {
    const keys = createModifierKeys();
    keys.tap("ctrl");
    keys.tap("ctrl");
    keys.tap("alt");
    keys.reset();
    expect(keys.peek()).toBe(0);
  });

  it("notifies subscribers only on a real change and stops after unsubscribe", () => {
    const keys = createModifierKeys();
    const seen: ModifiersSnapshot[] = [];
    const off = keys.subscribe((s) => seen.push(s));
    keys.consume(); // nothing armed: no notification
    keys.reset(); // already off: no notification
    expect(seen).toHaveLength(0);
    keys.tap("ctrl");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.ctrl).toBe("once");
    keys.consume();
    expect(seen).toHaveLength(2);
    off();
    keys.tap("alt");
    expect(seen).toHaveLength(2);
  });
});

describe("maskOf", () => {
  it("is zero for no modifier", () => {
    expect(
      maskOf({ ctrl: "off", alt: "off", shift: "off", meta: "off" }),
    ).toBe(0);
  });
});
