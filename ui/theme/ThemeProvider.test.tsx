// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text, useColorScheme } from "react-native";

import { palettes } from "./colors";
import { ThemeProvider, schemeFromSystem, useReducedMotion, useTheme } from "./ThemeProvider";

const mockedScheme = jest.mocked(useColorScheme);
const mockedA11y = jest.mocked(AccessibilityInfo);

function Probe() {
  const { scheme, colors } = useTheme();
  const reduced = useReducedMotion();
  return <Text testID="probe">{`${scheme} ${colors.bgBase} ${String(reduced)}`}</Text>;
}

function probe(): string {
  return String(screen.getByTestId("probe").props.children);
}

afterEach(() => {
  mockedScheme.mockReset();
  mockedScheme.mockReturnValue("light");
});

describe("ThemeProvider", () => {
  it("follows the system light mode", async () => {
    mockedScheme.mockReturnValue("light");
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(probe()).toBe(`light ${palettes.light.bgBase} false`);
  });

  it("switches to dark when the system does", async () => {
    mockedScheme.mockReturnValue("light");
    const view = await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    mockedScheme.mockReturnValue("dark");
    await view.rerender(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(probe()).toBe(`dark ${palettes.dark.bgBase} false`);
  });

  it("forces a mode for a subtree", async () => {
    mockedScheme.mockReturnValue("light");
    await render(
      <ThemeProvider>
        <ThemeProvider scheme="dark">
          <Probe />
        </ThemeProvider>
      </ThemeProvider>,
    );
    expect(probe()).toBe(`dark ${palettes.dark.bgBase} false`);
  });

  it("follows the system without a provider", async () => {
    mockedScheme.mockReturnValue("dark");
    await render(<Probe />);
    expect(probe()).toBe(`dark ${palettes.dark.bgBase} false`);
  });

  it("tracks reduce motion live", async () => {
    let listener: ((value: boolean) => void) | undefined;
    mockedA11y.isReduceMotionEnabled.mockResolvedValueOnce(true);
    mockedA11y.addEventListener.mockImplementationOnce(((_event: string, handler: (value: boolean) => void) => {
      listener = handler;
      return { remove: jest.fn() };
    }) as unknown as typeof AccessibilityInfo.addEventListener);

    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(probe()).toMatch(/ true$/);

    await act(async () => {
      listener?.(false);
    });
    expect(probe()).toMatch(/ false$/);
  });

  it("defaults to dark when the system gives no mode", () => {
    expect(schemeFromSystem(null)).toBe("dark");
    expect(schemeFromSystem("unspecified")).toBe("dark");
    expect(schemeFromSystem("light")).toBe("light");
  });
});
