// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react-native";
import { useColorScheme } from "react-native";

import { t } from "@/i18n/catalog";
import { size, ThemeProvider } from "@ui/theme";

import { ZoomChip } from "./ZoomChip";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

describe("ZoomChip", () => {
  it("shows the percentage while visible, as a polite live region", async () => {
    const { rerender } = await render(
      <ThemeProvider>
        <ZoomChip visible percent={120} />
      </ThemeProvider>,
    );
    const chip = screen.getByTestId("zoom-chip");
    expect(chip).toHaveTextContent(t("terminal.zoom", { percent: 120 }));
    expect(chip.props.accessibilityLiveRegion).toBe("polite");
    expect(chip).toHaveStyle({ height: size.zoomChipHeight });
    await rerender(
      <ThemeProvider>
        <ZoomChip visible={false} percent={120} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId("zoom-chip")).toBeNull();
  });

  it("rounds the percentage", async () => {
    await render(
      <ThemeProvider>
        <ZoomChip visible percent={133.4} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("zoom-chip")).toHaveTextContent(t("terminal.zoom", { percent: 133 }));
  });
});
