// SPDX-License-Identifier: GPL-3.0-or-later

import { analyzePaste } from "./paste";

describe("analyzePaste", () => {
  it("does not ask for confirmation for a single line", () => {
    const a = analyzePaste("echo hello");
    expect(a.needsConfirmation).toBe(false);
    expect(a.totalLines).toBe(1);
    expect(a.totalChars).toBe(10);
    expect(a.previewLines).toEqual(["echo hello"]);
    expect(a.hiddenLines).toBe(0);
  });

  it("treats empty text as one line without confirmation", () => {
    const a = analyzePaste("");
    expect(a.needsConfirmation).toBe(false);
    expect(a.totalChars).toBe(0);
  });

  it("asks for confirmation on several lines and previews the first ones", () => {
    const text = Array.from({ length: 8 }, (_, i) => `line ${i + 1}`).join("\n");
    const a = analyzePaste(text);
    expect(a.needsConfirmation).toBe(true);
    expect(a.totalLines).toBe(8);
    expect(a.totalChars).toBe(text.length);
    expect(a.previewLines).toEqual(["line 1", "line 2", "line 3", "line 4", "line 5"]);
    expect(a.hiddenLines).toBe(3);
  });

  it("honours a custom preview size", () => {
    const a = analyzePaste("a\nb\nc", { previewLines: 2 });
    expect(a.previewLines).toEqual(["a", "b"]);
    expect(a.hiddenLines).toBe(1);
  });

  it("counts \\r\\n, \\r and \\n as one break each", () => {
    expect(analyzePaste("a\r\nb\rc\nd").totalLines).toBe(4);
  });

  it("confirms a trailing break (it would run the command) without an empty extra line", () => {
    const a = analyzePaste("ls\n");
    expect(a.needsConfirmation).toBe(true);
    expect(a.totalLines).toBe(1);
    expect(a.previewLines).toEqual(["ls"]);
  });

  it("keeps real empty lines in the middle", () => {
    const a = analyzePaste("a\n\nb");
    expect(a.totalLines).toBe(3);
    expect(a.previewLines).toEqual(["a", "", "b"]);
  });

  it("counts characters by Unicode scalar value, not UTF-16 unit", () => {
    expect(analyzePaste("a😀b").totalChars).toBe(3);
  });

  it("cuts long preview lines without splitting a surrogate pair", () => {
    const a = analyzePaste("😀😀😀😀\nx", { previewLineChars: 2 });
    expect(a.previewLines[0]).toBe("😀😀");
    expect(a.totalChars).toBe(6);
  });
});
