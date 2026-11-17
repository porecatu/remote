// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react-native";
import { useColorScheme } from "react-native";

import { palettes } from "../theme/colors";
import { ThemeProvider } from "../theme/ThemeProvider";
import { icon } from "../theme/tokens";
import { Icon, iconNames } from "./Icon";

describe("Icon", () => {
  beforeEach(() => {
    jest.mocked(useColorScheme).mockReturnValue("dark");
  });

  it("renders every icon of the list", async () => {
    await render(
      <ThemeProvider>
        {iconNames.map((name) => (
          <Icon key={name} name={name} role="bar" color="textBody" testID={`icon-${name}`} />
        ))}
      </ThemeProvider>,
    );
    for (const name of iconNames) {
      expect(screen.getByTestId(`icon-${name}`, { includeHiddenElements: true })).toBeTruthy();
    }
  });

  it("stays out of the accessibility tree", async () => {
    await render(<Icon name="chevron-left" role="bar" color="textBody" testID="icon" />);
    expect(screen.queryByTestId("icon")).toBeNull();
    const svg = screen.getByTestId("icon", { includeHiddenElements: true });
    expect(svg.props.accessible).toBe(false);
    expect(svg.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(svg.props.accessibilityElementsHidden).toBe(true);
  });

  it("takes size and stroke from the role and color from the token", async () => {
    await render(
      <ThemeProvider>
        <Icon name="lock" role="lock" color="accent" testID="lock" />
        <Icon name="monitor-smartphone" role="state" color="textTertiary" testID="state" />
      </ThemeProvider>,
    );
    const lock = screen.getByTestId("lock", { includeHiddenElements: true });
    expect(lock.props.width).toBe(icon.lock.size);
    expect(lock.props.height).toBe(icon.lock.size);
    expect(lock.props.strokeWidth).toBe(icon.lock.strokeWidth);
    expect(lock.props.stroke).toBe(palettes.dark.accent);

    const state = screen.getByTestId("state", { includeHiddenElements: true });
    expect(state.props.width).toBe(48);
    expect(state.props.strokeWidth).toBe(1.5);
  });
});
