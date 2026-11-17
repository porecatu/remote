// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react-native";
import { StyleSheet, useColorScheme } from "react-native";

import { palettes } from "../theme/colors";
import { size, spacing } from "../theme/tokens";
import { Divider } from "./Divider";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

describe("Divider", () => {
  it("is a hidden border.row line, inset in menus", async () => {
    await render(
      <>
        <Divider testID="full" />
        <Divider variant="menu" testID="menu" />
      </>,
    );
    expect(screen.queryByTestId("full")).toBeNull();
    const full = screen.getByTestId("full", { includeHiddenElements: true });
    expect(StyleSheet.flatten(full.props.style)).toMatchObject({ height: size.borderWidth, backgroundColor: palettes.dark.borderRow });
    const menu = screen.getByTestId("menu", { includeHiddenElements: true });
    expect(StyleSheet.flatten(menu.props.style)).toMatchObject({
      marginHorizontal: spacing.dividerInset,
      marginVertical: spacing.dividerMarginY,
    });
  });
});
