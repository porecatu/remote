// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, screen } from "@testing-library/react-native";
import { memo } from "react";
import { Text } from "react-native";

import { getLocale, setLocale, t } from "@/i18n/catalog";
import { createTestServices, renderWithServices } from "@ui/services/testing";

import { useLocale, useT } from "./LocaleProvider";

function Label() {
  const { t: translate } = useT();
  return <Text testID="label">{translate("common.cancel")}</Text>;
}

// Behind a memo boundary, like a screen of the navigation stack.
const Screen = memo(function Screen() {
  return <Label />;
});

function Global() {
  useLocale();
  return <Text testID="global">{t("common.close")}</Text>;
}

afterEach(() => {
  setLocale("en_US");
});

describe("LocaleProvider", () => {
  it("follows the system language when the setting is system", async () => {
    const services = createTestServices({
      systemLocales: [{ languageCode: "pt", languageTag: "pt-BR" }],
    });
    await renderWithServices(<Screen />, { services });
    expect(screen.getByTestId("label").props.children).toBe("Cancelar");
    expect(getLocale()).toBe("pt_BR");
  });

  it("uses the chosen language over the system's", async () => {
    const services = createTestServices({
      settings: { language: "en_US" },
      systemLocales: [{ languageCode: "pt", languageTag: "pt-BR" }],
    });
    await renderWithServices(<Screen />, { services });
    expect(screen.getByTestId("label").props.children).toBe("Cancel");
  });

  it("switches the language live, without remounting", async () => {
    let mounts = 0;
    function Counted() {
      mounts += 1;
      return null;
    }
    const CountedOnce = memo(function CountedOnce() {
      return <Counted />;
    });
    const { services } = await renderWithServices(
      <>
        <Screen />
        <Global />
        <CountedOnce />
      </>,
    );
    expect(screen.getByTestId("label").props.children).toBe("Cancel");
    expect(screen.getByTestId("global").props.children).toBe("Close");
    const rendersBefore = mounts;

    await act(async () => {
      await services.settings.update({ language: "pt_BR" });
    });

    expect(screen.getByTestId("label").props.children).toBe("Cancelar");
    expect(screen.getByTestId("global").props.children).toBe("Fechar");
    expect(getLocale()).toBe("pt_BR");
    // The memoized part that reads no text was neither remounted nor re-rendered.
    expect(mounts).toBe(rendersBefore);
  });
});

describe("useLocale outside the provider", () => {
  it("is the catalog's locale", async () => {
    setLocale("pt_BR");
    function Probe() {
      return <Text testID="locale">{useLocale()}</Text>;
    }
    await render(<Probe />);
    expect(screen.getByTestId("locale").props.children).toBe("pt_BR");
  });
});
