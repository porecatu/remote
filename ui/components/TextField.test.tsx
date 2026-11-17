// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { AccessibilityInfo, useColorScheme } from "react-native";

import { t } from "@/i18n/catalog";

import { palettes, size, ThemeProvider } from "../theme";
import { counterVisible, TextField } from "./TextField";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
  jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear();
});

function Name({ initial }: { readonly initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <TextField
      label="Device name"
      helper="Shown on the desktop"
      value={value}
      onChangeText={setValue}
      maxLength={64}
      counterThreshold={48}
      autoCorrect={false}
      autoCapitalize="words"
      testID="name"
    />
  );
}

describe("counterVisible", () => {
  it("shows from the threshold on, only with a maximum", () => {
    expect(counterVisible(47, 64, 48)).toBe(false);
    expect(counterVisible(48, 64, 48)).toBe(true);
    expect(counterVisible(60, undefined, 48)).toBe(false);
    expect(counterVisible(60, 64, undefined)).toBe(false);
  });
});

describe("TextField", () => {
  it("is labeled for the screen reader and passes the field options", async () => {
    await render(
      <ThemeProvider>
        <Name initial="Pixel" />
      </ThemeProvider>,
    );
    const input = screen.getByLabelText("Device name");
    expect(input.props.maxLength).toBe(64);
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.autoCapitalize).toBe("words");
    expect(input.props.accessibilityHint).toBe("Shown on the desktop");
    expect(input).toHaveStyle({
      minHeight: size.fieldHeight,
      backgroundColor: palettes.dark.bgField,
      borderColor: palettes.dark.borderField,
    });
    expect(screen.getByText("Shown on the desktop")).toBeTruthy();
    expect(screen.queryByTestId("name-counter")).toBeNull();
  });

  it("shows the counter from the threshold and announces it once", async () => {
    await render(<Name initial={"a".repeat(46)} />);
    const input = screen.getByLabelText("Device name");
    await fireEvent.changeText(input, "a".repeat(47));
    expect(screen.queryByTestId("name-counter")).toBeNull();
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();

    await fireEvent.changeText(input, "a".repeat(52));
    const counter = screen.getByTestId("name-counter");
    expect(counter).toHaveTextContent(t("field.counter", { count: 52, max: 64 }));
    expect(counter.props.accessibilityLabel).toBe(t("field.counter_a11y", { count: 52, max: 64 }));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      t("field.counter_a11y", { count: 52, max: 64 }),
    );

    await fireEvent.changeText(input, "a".repeat(53));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("name-counter")).toHaveTextContent(
      t("field.counter", { count: 53, max: 64 }),
    );
  });

  it("does not announce a counter that is already shown when it mounts", async () => {
    await render(<Name initial={"a".repeat(50)} />);
    expect(screen.getByTestId("name-counter")).toBeTruthy();
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });

  it("shows the error in place of the help line, with the error border", async () => {
    await render(
      <ThemeProvider>
        <TextField
          label="Group name"
          labelVisible={false}
          helper="help"
          error="Required"
          value=""
          onChangeText={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByText("help")).toBeNull();
    expect(screen.queryByText("Group name", { includeHiddenElements: true })).toBeNull();
    const error = screen.getByText("Required");
    expect(error).toHaveStyle({ color: palettes.dark.errorText });
    expect(error.props.accessibilityLiveRegion).toBe("polite");
    const input = screen.getByLabelText("Group name");
    expect(input).toHaveStyle({ borderColor: palettes.dark.error });
    expect(input.props.accessibilityHint).toBe("Required");
  });

  it("paints the focus border while focused", async () => {
    await render(
      <ThemeProvider>
        <TextField label="Name" value="x" onChangeText={jest.fn()} />
      </ThemeProvider>,
    );
    const input = screen.getByLabelText("Name");
    await fireEvent(input, "focus");
    expect(screen.getByLabelText("Name")).toHaveStyle({ borderColor: palettes.dark.borderFocus });
    await fireEvent(input, "blur");
    expect(screen.getByLabelText("Name")).toHaveStyle({ borderColor: palettes.dark.borderField });
  });

  it("hides the visible label from the screen reader (the field carries it)", async () => {
    await render(<TextField label="Name" value="" onChangeText={jest.fn()} />);
    expect(screen.queryByText("Name")).toBeNull();
    expect(screen.getByText("Name", { includeHiddenElements: true })).toBeTruthy();
  });
});
