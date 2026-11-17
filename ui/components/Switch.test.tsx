// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { useColorScheme } from "react-native";

import { palettes, ThemeProvider } from "../theme";
import { Switch, SwitchRow } from "./Switch";

beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue("dark");
});

describe("Switch", () => {
  it("is announced as a switch with its state and colored by tokens", async () => {
    await render(
      <ThemeProvider>
        <Switch value accessibilityLabel="Lock the app" onValueChange={jest.fn()} testID="switch" />
      </ThemeProvider>,
    );
    const control = screen.getByRole("switch", { name: "Lock the app" });
    expect(control).toBeChecked();
    const native = screen.getByTestId("switch");
    expect(JSON.stringify(native.props)).toContain(palettes.dark.primary);
    expect(JSON.stringify(native.props)).toContain(palettes.dark.switchThumb);
  });

  it("asks for the wanted value", async () => {
    const onValueChange = jest.fn();
    await render(
      <Switch value={false} accessibilityLabel="Vibrate" onValueChange={onValueChange} testID="switch" />,
    );
    await fireEvent(screen.getByTestId("switch"), "valueChange", true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it("stays out of the screen reader when decorative", async () => {
    await render(
      <Switch value accessibilityLabel="x" onValueChange={jest.fn()} decorative testID="switch" />,
    );
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByTestId("switch")).toBeNull();
  });
});

describe("SwitchRow", () => {
  it("is one switch element with name, description and state", async () => {
    await render(
      <ThemeProvider>
        <SwitchRow
          title="Lock the app"
          description="Asks for biometrics"
          value
          onValueChange={jest.fn()}
        />
      </ThemeProvider>,
    );
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(1);
    const row = screen.getByRole("switch", { name: "Lock the app" });
    expect(row).toBeChecked();
    expect(row.props.accessibilityHint).toBe("Asks for biometrics");
    expect(screen.getByText("Asks for biometrics")).toBeTruthy();
  });

  it("asks for the opposite value on a touch and only moves when the screen allows", async () => {
    const asked: boolean[] = [];
    function Settings({ allow }: { readonly allow: boolean }) {
      const [value, setValue] = useState(true);
      return (
        <SwitchRow
          title="Lock the app"
          value={value}
          onValueChange={(next) => {
            asked.push(next);
            if (allow) {
              setValue(next);
            }
          }}
        />
      );
    }
    const view = await render(<Settings allow={false} />);
    await fireEvent.press(screen.getByRole("switch", { name: "Lock the app" }));
    expect(asked).toEqual([false]);
    expect(screen.getByRole("switch", { name: "Lock the app" })).toBeChecked();

    await view.rerender(<Settings allow />);
    await fireEvent.press(screen.getByRole("switch", { name: "Lock the app" }));
    expect(asked).toEqual([false, false]);
    expect(screen.getByRole("switch", { name: "Lock the app" })).not.toBeChecked();
  });

  it("does nothing when disabled", async () => {
    const onValueChange = jest.fn();
    await render(<SwitchRow title="Vibrate" value={false} onValueChange={onValueChange} disabled />);
    const row = screen.getByRole("switch", { name: "Vibrate" });
    expect(row).toBeDisabled();
    await fireEvent.press(row);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
