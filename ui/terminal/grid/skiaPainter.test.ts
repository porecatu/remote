// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Skia, type SkTypeface } from "@shopify/react-native-skia";

import type { DrawOp } from "./drawOps";
import { lineMetrics } from "./lineRecording";
import { createGridPainter, emptyPicture, recordFrame } from "./skiaPainter";

function face(file: string): SkTypeface {
  const bytes = readFileSync(join(__dirname, "../../../assets/fonts", file));
  const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(new Uint8Array(bytes)));
  if (typeface === null) {
    throw new Error("font did not load");
  }
  return typeface;
}

const size = (ops: DrawOp[], painter = createGridPainter({ regular: face("IosevkaFixed-Regular.ttf"), medium: face("IosevkaFixed-Medium.ttf") })) =>
  painter.record(ops, 60).serialize()?.byteLength ?? 0;

const metrics = lineMetrics();

const text = (cells: string[], over: Partial<Extract<DrawOp, { kind: "text" }>> = {}): DrawOp => ({
  kind: "text",
  cells,
  xs: cells.map((_, i) => i * metrics.cellWidth),
  boxWidth: metrics.cellWidth,
  baseline: metrics.baseline,
  color: 0xffffff,
  bold: false,
  italic: false,
  ...over,
});

describe("createGridPainter with the embedded Iosevka Fixed", () => {
  it("records glyphs of the font", () => {
    expect(size([text(["a", "b", "c"])])).toBeGreaterThan(size([]));
  });

  it("records bold and italic text", () => {
    expect(size([text(["a"], { bold: true, italic: true })])).toBeGreaterThan(size([]));
  });

  it("does not throw on code points the font lacks (system fallback, centred in the cell)", () => {
    expect(() => size([text(["日"], { boxWidth: metrics.cellWidth * 2 }), text(["👍🏽"])])).not.toThrow();
  });
});

describe("recordFrame", () => {
  it("stacks line pictures", () => {
    const painter = createGridPainter({ regular: null, medium: null });
    const line = painter.record([{ kind: "rect", x: 0, y: 0, width: 6, height: 6, color: 0xff0000 }], 6);
    const frame = recordFrame([{ y: 0, picture: line }, { y: 20, picture: line }], 6, 0, 40);
    expect(frame.serialize()?.byteLength).toBeGreaterThan(emptyPicture().serialize()?.byteLength ?? 0);
  });
});
