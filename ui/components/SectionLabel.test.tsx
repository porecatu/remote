// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react-native";
import { StyleSheet, useColorScheme } from "react-native";

import { palettes } from "../theme/colors";
import { spacing, type } from "../theme/tokens";
import { SectionLabel } from "./SectionLabel";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

describe("SectionLabel", () => {
  it("is a header read as written, drawn in uppercase", async () => {
    await render(<SectionLabel label="Pinned" />);
    const label = screen.getByRole("header", { name: "Pinned" });
    expect(StyleSheet.flatten(label.props.style)).toMatchObject({
      textTransform: "uppercase",
      fontSize: type.section.fontSize,
      letterSpacing: type.section.letterSpacing,
      color: palettes.dark.textSection,
      paddingTop: spacing.sectionPaddingTop,
    });
  });

  it("uses the first padding at the top of a block", async () => {
    await render(<SectionLabel label="Pinned" first />);
    expect(StyleSheet.flatten(screen.getByRole("header").props.style)).toMatchObject({
      paddingTop: spacing.sectionPaddingTopFirst,
    });
  });
});
