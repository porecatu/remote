// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react-native";
import { Text, useColorScheme } from "react-native";

import { icon, palettes, size, ThemeProvider } from "../theme";
import { monoFamily } from "../theme/fonts";
import { Badge } from "./Badge";
import { Chip, StatusDot } from "./Chip";
import { StatusLabel } from "./StatusLabel";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

describe("Chip", () => {
  it("is a bg.field chip of badge.height with the chip type", async () => {
    await render(
      <ThemeProvider>
        <Chip label="2" leading={{ kind: "icon", name: "layout-panel-left", color: "textSecondary" }} testID="chip" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("chip")).toHaveStyle({
      backgroundColor: palettes.dark.bgField,
      minHeight: size.badgeHeight,
      borderRadius: 4,
      paddingHorizontal: 8,
      columnGap: 4,
    });
    expect(screen.getByText("2")).toHaveStyle({
      fontSize: 11,
      fontWeight: "600",
      color: palettes.dark.textSecondary,
    });
  });

  it("draws an icon of the chip role, hidden from the screen reader", async () => {
    await render(
      <Chip
        label="exited 1"
        color="errorText"
        leading={{ kind: "icon", name: "circle-x", color: "error" }}
        testID="chip"
      />,
    );
    expect(screen.queryByTestId("chip-leading")).toBeNull();
    const svg = screen.getByTestId("chip-leading", { includeHiddenElements: true });
    expect(svg.props.width).toBe(icon.chip.size);
    expect(svg.props.strokeWidth).toBe(icon.chip.strokeWidth);
    expect(svg.props.stroke).toBe(palettes.dark.error);
    expect(screen.getByText("exited 1")).toHaveStyle({ color: palettes.dark.errorText });
  });

  it("takes any element as leading (the spinner)", async () => {
    await render(<Chip label="connecting…" leading={{ kind: "node", node: <Text>{"spin"}</Text> }} />);
    expect(screen.getByText("spin")).toBeTruthy();
    expect(screen.getByText("connecting…")).toBeTruthy();
  });
});

describe("StatusDot", () => {
  it("is a round dot of the dot size, hidden from the screen reader", async () => {
    await render(
      <ThemeProvider>
        <StatusDot color="success" testID="dot" />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId("dot")).toBeNull();
    expect(screen.getByTestId("dot", { includeHiddenElements: true })).toHaveStyle({
      width: size.dot,
      height: size.dot,
      borderRadius: size.dot / 2,
      backgroundColor: palettes.dark.success,
    });
  });
});

describe("Badge", () => {
  it("shows text only, mono for the profile", async () => {
    await render(
      <ThemeProvider>
        <Badge label="3" testID="count" />
        <Badge label="zsh" font="mono" testID="profile" />
      </ThemeProvider>,
    );
    expect(screen.getByText("3")).toHaveStyle({ fontSize: 11, fontWeight: "600" });
    expect(screen.getByText("zsh")).toHaveStyle({ fontSize: 11, fontFamily: monoFamily("500") });
    expect(screen.getByTestId("profile")).toHaveStyle({ backgroundColor: palettes.dark.bgField });
  });
});

describe("StatusLabel", () => {
  it("never shows state by color only: dot plus text", async () => {
    await render(
      <ThemeProvider>
        <StatusLabel label="Online" indicator={{ kind: "dot", color: "success" }} testID="status" />
      </ThemeProvider>,
    );
    expect(screen.getByText("Online")).toBeTruthy();
    expect(screen.getByTestId("status-leading", { includeHiddenElements: true })).toHaveStyle({
      backgroundColor: palettes.dark.success,
    });
  });

  it("takes an icon in place of the dot", async () => {
    await render(
      <StatusLabel
        label="Error"
        color="warningText"
        indicator={{ kind: "icon", name: "triangle-alert", color: "warning" }}
      />,
    );
    expect(screen.getByText("Error")).toHaveStyle({ color: palettes.dark.warningText });
  });
});
