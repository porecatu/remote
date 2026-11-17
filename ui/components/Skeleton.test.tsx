// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, screen } from "@testing-library/react-native";
import { useColorScheme } from "react-native";

import { setLocale, t } from "@/i18n/catalog";
import { renderWithServices } from "@ui/services/testing";

import { palettes, size, ThemeProvider } from "../theme";
import { Skeleton } from "./Skeleton";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

afterEach(() => {
  setLocale("en_US");
});

describe("Skeleton", () => {
  it("is one busy 'loading' element with the given number of row cards", async () => {
    await render(
      <ThemeProvider>
        <Skeleton rows={3} testID="skeleton" />
      </ThemeProvider>,
    );
    const block = screen.getByLabelText(t("a11y.loading"));
    expect(block).toBeBusy();
    const rows = screen.getAllByTestId("skeleton-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveStyle({
      height: size.rowDouble,
      backgroundColor: palettes.dark.bgRow,
      borderColor: palettes.dark.borderRow,
    });
  });

  it("follows a change of language", async () => {
    const { services } = await renderWithServices(<Skeleton rows={1} testID="skeleton" />);
    expect(screen.getByTestId("skeleton").props.accessibilityLabel).toBe("Loading");
    await act(async () => {
      await services.settings.update({ language: "pt_BR" });
    });
    expect(screen.getByTestId("skeleton").props.accessibilityLabel).toBe("Carregando");
  });

  it("uses the single row height for one-line lists", async () => {
    await render(<Skeleton rows={1} lines={1} testID="skeleton" />);
    expect(screen.getByTestId("skeleton-row")).toHaveStyle({ height: size.rowSingle });
  });
});
