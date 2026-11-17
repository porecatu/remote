// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { Text, useColorScheme, type HostInstance } from "react-native";

import { createTranslator, setLocale, t } from "@/i18n/catalog";
import { renderWithServices } from "@ui/services/testing";

import { opacity, palettes, ThemeProvider } from "../theme";
import { Card } from "./Card";
import { ListRow } from "./ListRow";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

describe("ListRow", () => {
  it("is one element with the composed label and the default action", async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider>
        <Card>
          <ListRow
            title="Casa"
            subtitle="relay.example.com"
            accessibilityLabel="Casa, online, relay relay.example.com"
            accessibilityHint="Open"
            onPress={onPress}
            testID="row"
          />
        </Card>
      </ThemeProvider>,
    );
    const row = screen.getByRole("button", { name: "Casa, online, relay relay.example.com" });
    expect(row.props.accessibilityHint).toBe("Open");
    expect(screen.getByText("Casa")).toBeTruthy();
    expect(screen.getByText("relay.example.com")).toBeTruthy();
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("exposes the secondary actions as custom actions", async () => {
    const onAction = jest.fn();
    const onLongPress = jest.fn();
    await render(
      <ListRow
        title="Casa"
        accessibilityLabel="Casa"
        accessibilityActions={[
          { name: "rename", label: "Rename" },
          { name: "remove", label: "Remove" },
        ]}
        onAccessibilityAction={onAction}
        onLongPress={onLongPress}
      />,
    );
    const row = screen.getByRole("button", { name: "Casa" });
    expect(row.props.accessibilityActions).toEqual([
      { name: "rename", label: "Rename" },
      { name: "remove", label: "Remove" },
    ]);
    await fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "remove" } });
    expect(onAction).toHaveBeenCalledWith("remove");
    await fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "unknown" } });
    expect(onAction).toHaveBeenCalledTimes(1);
    await fireEvent(row, "longPress");
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("dims a pending row, says so and takes no touch nor actions", async () => {
    const onPress = jest.fn();
    await render(
      <ListRow
        title="build"
        accessibilityLabel="build"
        accessibilityActions={[{ name: "menu", label: "Menu" }]}
        onAccessibilityAction={jest.fn()}
        onPress={onPress}
        pending
        testID="row"
      />,
    );
    const label = `build${t("a11y.separator")}${t("a11y.pending")}`;
    const row = screen.getByRole("button", { name: label });
    expect(row).toBeDisabled();
    expect(row).toBeBusy();
    expect(row.props.accessibilityActions).toBeUndefined();
    expect(row).toHaveStyle({ opacity: opacity.pending });
    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("marks a disabled row and paints its text as disabled", async () => {
    await render(
      <ThemeProvider>
        <ListRow title="Window" accessibilityLabel="Window" onPress={jest.fn()} disabled />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: "Window" })).toBeDisabled();
    expect(screen.getByText("Window")).toHaveStyle({ color: palettes.dark.textDisabled });
  });

  it("is a double row with a subtitle and a single row without", async () => {
    await render(
      <ThemeProvider>
        <ListRow title="a" subtitle="b" accessibilityLabel="a" testID="double" />
        <ListRow title="c" accessibilityLabel="c" testID="single" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("double")).toHaveStyle({ minHeight: 64 });
    expect(screen.getByTestId("single")).toHaveStyle({ minHeight: 56 });
  });

  it("paints the selected background", async () => {
    await render(
      <ThemeProvider>
        <ListRow title="api" accessibilityLabel="api" selected testID="row" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("row")).toHaveStyle({ backgroundColor: palettes.dark.bgSelected });
  });

  it("renders the accessories, leading and trailing elements", async () => {
    await render(
      <ListRow
        title="api"
        titleAccessory={<Text>{"badge"}</Text>}
        titleEnd={<Text>{"end1"}</Text>}
        subtitle="~/src"
        subtitleFont="mono"
        subtitleEnd={<Text>{"end2"}</Text>}
        leading={<Text>{"lead"}</Text>}
        trailing={<Text>{"trail"}</Text>}
        density="tab"
        accessibilityLabel="api"
      />,
    );
    for (const text of ["badge", "end1", "end2", "lead", "trail"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("states the checked state of a switch or radio row, never of a button", async () => {
    await render(
      <>
        <ListRow title="r" accessibilityLabel="r" accessibilityRole="radio" checked />
        <ListRow title="b" accessibilityLabel="b" checked />
      </>,
    );
    expect(screen.getByRole("radio", { name: "r" })).toBeChecked();
    expect(screen.getByRole("button", { name: "b" }).props.accessibilityState.checked).toBeUndefined();
  });
});

describe("Card", () => {
  it("is a bg.row card with the border.row border", async () => {
    await render(
      <ThemeProvider>
        <Card testID="card" padded>
          <Text>{"content"}</Text>
        </Card>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("card")).toHaveStyle({
      backgroundColor: palettes.dark.bgRow,
      borderColor: palettes.dark.borderRow,
      borderRadius: 8,
      borderWidth: 1,
      padding: 16,
    });
  });
});

describe("ListRow focus origin and language", () => {
  it("hands its element to a ref, the focus origin of what it opens", async () => {
    const ref = createRef<HostInstance>();
    await render(<ListRow title="Casa" accessibilityLabel="Casa" onPress={jest.fn()} ref={ref} testID="row" />);
    // The host view behind the testID (the test renderer's mocked View).
    expect((ref.current as unknown as { props: { testID?: string } } | null)?.props.testID).toBe("row");
  });

  it("says pending in the current language, live", async () => {
    const en = createTranslator("en_US");
    const pt = createTranslator("pt_BR");
    try {
      const { services } = await renderWithServices(
        <ListRow title="build" accessibilityLabel="build" onPress={jest.fn()} pending />,
      );
      expect(
        screen.getByRole("button", { name: `build${en.t("a11y.separator")}${en.t("a11y.pending")}` }),
      ).toBeTruthy();
      await act(async () => {
        await services.settings.update({ language: "pt_BR" });
      });
      expect(
        screen.getByRole("button", { name: `build${pt.t("a11y.separator")}${pt.t("a11y.pending")}` }),
      ).toBeTruthy();
    } finally {
      setLocale("en_US");
    }
  });
});
