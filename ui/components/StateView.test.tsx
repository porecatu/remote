// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react-native";
import { Text, useColorScheme } from "react-native";

import { icon, palettes, ThemeProvider } from "../theme";
import { StateView } from "./StateView";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

describe("StateView", () => {
  it("shows the title as a header, the body and the actions", async () => {
    await render(
      <ThemeProvider>
        <StateView
          icon="monitor-smartphone"
          title="No desktop paired"
          body="Open remote access on your computer."
          actions={<Text>{"Pair desktop"}</Text>}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole("header", { name: "No desktop paired" })).toHaveStyle({
      fontSize: 20,
      fontWeight: "600",
      color: palettes.dark.textTitle,
    });
    expect(screen.getByText("Open remote access on your computer.")).toHaveStyle({
      color: palettes.dark.textSecondary,
    });
    expect(screen.getByText("Pair desktop")).toBeTruthy();
  });

  it("draws the 48 state icon, tertiary by default or the given color", async () => {
    await render(
      <ThemeProvider>
        <StateView icon="shield-alert" iconColor="error" title="Security error" testID="error" />
        <StateView icon="search-x" title="Nothing found" testID="empty" />
      </ThemeProvider>,
    );
    const error = screen.getByTestId("error-icon", { includeHiddenElements: true });
    expect(error.props.width).toBe(icon.state.size);
    expect(error.props.strokeWidth).toBe(icon.state.strokeWidth);
    expect(error.props.stroke).toBe(palettes.dark.error);
    const empty = screen.getByTestId("empty-icon", { includeHiddenElements: true });
    expect(empty.props.stroke).toBe(palettes.dark.textTertiary);
    expect(screen.getByRole("header", { name: "Security error" })).toBeTruthy();
  });
});
