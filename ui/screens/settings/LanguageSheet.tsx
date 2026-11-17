// SPDX-License-Identifier: GPL-3.0-or-later
// The language choice of Settings (anatomy §4.4.1, ADR-0005): a sheet with a
// single choice, "Follow the system" (the default), "English (United
// States)" and "Português (Brasil)", each language named in itself. The
// choice applies at once, with no restart: the settings change and the
// `LocaleProvider` switches the catalog. The sheet closes on a choice.
import type { LanguageSetting } from "@/storage/settings";
import { RadioGroup, type RadioOption } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";
import { Sheet } from "@ui/overlay";
import { useStoreState } from "@ui/hooks/useStoreState";
import { useServices } from "@ui/services/ServicesContext";

/** The choices in the order of the sheet. */
export const LANGUAGE_CHOICES: readonly LanguageSetting[] = ["system", "en_US", "pt_BR"];

export type LanguageSheetProps = {
  /** The new language was chosen (already different from the current one). */
  readonly onChoose: (language: LanguageSetting) => void;
};

/** The sheet's content; opened by `useOverlay().openSheet`. */
export function LanguageSheet({ onChoose }: LanguageSheetProps) {
  const { t } = useT();
  const { settings } = useServices();
  const language = useStoreState(settings.store, (state) => state.settings.language);
  const options: RadioOption<LanguageSetting>[] = LANGUAGE_CHOICES.map((choice) => ({
    value: choice,
    title: t(`language.${choice}`),
    testID: `language-${choice}`,
  }));
  return (
    <Sheet title={t("settings.language")} testID="language-sheet">
      <RadioGroup
        accessibilityLabel={t("settings.language")}
        options={options}
        value={language}
        onChange={onChoose}
        testID="language-choices"
      />
    </Sheet>
  );
}
