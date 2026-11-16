// SPDX-License-Identifier: GPL-3.0-or-later
import { pluralCategory } from "./plural";

describe("pluralCategory", () => {
  it("en_US: one only for exactly 1", () => {
    expect(pluralCategory("en_US", 0)).toBe("other");
    expect(pluralCategory("en_US", 1)).toBe("one");
    expect(pluralCategory("en_US", 2)).toBe("other");
    expect(pluralCategory("en_US", 1.5)).toBe("other");
    expect(pluralCategory("en_US", -1)).toBe("one");
  });

  it("pt_BR: one when the integer part is 0 or 1", () => {
    expect(pluralCategory("pt_BR", 0)).toBe("one");
    expect(pluralCategory("pt_BR", 1)).toBe("one");
    expect(pluralCategory("pt_BR", 1.5)).toBe("one");
    expect(pluralCategory("pt_BR", 0.5)).toBe("one");
    expect(pluralCategory("pt_BR", 2)).toBe("other");
    expect(pluralCategory("pt_BR", 2.5)).toBe("other");
    expect(pluralCategory("pt_BR", 100)).toBe("other");
  });
});
