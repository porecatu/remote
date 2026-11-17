// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { useState } from "react";
import { Text, useColorScheme } from "react-native";

import { palettes, size, ThemeProvider } from "../theme";
import { Radio, RadioGroup, type RadioOption } from "./Radio";

type Lang = "system" | "en_US" | "pt_BR";

const options: readonly RadioOption<Lang>[] = [
  { value: "system", title: "Follow the system" },
  { value: "en_US", title: "English (United States)" },
  { value: "pt_BR", title: "Português (Brasil)", titleEnd: <Text>{"mark"}</Text> },
];

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

describe("Radio", () => {
  it("draws the accent ring and dot when checked, border.field when not", async () => {
    await render(
      <ThemeProvider>
        <Radio checked testID="on" />
        <Radio checked={false} testID="off" />
      </ThemeProvider>,
    );
    const on = screen.getByTestId("on", { includeHiddenElements: true });
    expect(on).toHaveStyle({
      width: size.radio,
      height: size.radio,
      borderWidth: size.borderEmphasis,
      borderColor: palettes.dark.accent,
    });
    expect(screen.getByTestId("off", { includeHiddenElements: true })).toHaveStyle({
      borderColor: palettes.dark.borderField,
    });
  });
});

describe("RadioGroup", () => {
  it("is a radiogroup with exactly one checked radio", async () => {
    await render(
      <ThemeProvider>
        <RadioGroup
          accessibilityLabel="Language"
          options={options}
          value="en_US"
          onChange={jest.fn()}
          testID="group"
        />
      </ThemeProvider>,
    );
    const group = screen.getByTestId("group");
    expect(group.props.accessibilityRole).toBe("radiogroup");
    expect(group.props.accessibilityLabel).toBe("Language");
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.filter((radio) => radio.props.accessibilityState.checked === true)).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "English (United States)" })).toBeChecked();
    expect(screen.getByText("mark")).toBeTruthy();
  });

  it("keeps every radio its own element: the group is a container, not a leaf", async () => {
    await render(
      <RadioGroup accessibilityLabel="Language" options={options} value="system" onChange={jest.fn()} testID="group" />,
    );
    const group = screen.getByTestId("group");
    // An accessible group would be one element for VoiceOver and hide the
    // radios; so it is not one, and the screen reader (like this query) does
    // not stop on it.
    expect(group.props.accessible).toBe(false);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(within(group).getAllByRole("radio").map((radio) => radio.props.accessibilityLabel)).toEqual([
      "Follow the system",
      "English (United States)",
      "Português (Brasil)",
    ]);
  });

  it("moves the choice exclusively", async () => {
    const changes: Lang[] = [];
    function Language() {
      const [value, setValue] = useState<Lang>("system");
      return (
        <RadioGroup
          accessibilityLabel="Language"
          options={options}
          value={value}
          onChange={(next) => {
            changes.push(next);
            setValue(next);
          }}
        />
      );
    }
    await render(<Language />);
    await fireEvent.press(screen.getByRole("radio", { name: "Português (Brasil)" }));
    expect(changes).toEqual(["pt_BR"]);
    expect(screen.getByRole("radio", { name: "Português (Brasil)" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Follow the system" })).not.toBeChecked();

    await fireEvent.press(screen.getByRole("radio", { name: "Português (Brasil)" }));
    expect(changes).toEqual(["pt_BR"]);
  });

  it("checks nothing when there is no value and uses the given label", async () => {
    await render(
      <RadioGroup
        accessibilityLabel="Profile"
        options={[{ value: "bash", title: "bash", accessibilityLabel: "bash, local, default" }]}
        value={null}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: "bash, local, default" })).not.toBeChecked();
  });
});
