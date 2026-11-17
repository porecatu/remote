// SPDX-License-Identifier: GPL-3.0-or-later
// The fingerprint of this device for the comparison with the desktop
// (anatomy §4.3.4; PRD-001 RF-1.9): a `bg.row` card with the fingerprint in
// mono 24/500, `text.title`, on one line, or two lines of two groups with a
// large system font. The screen reader spells it character by character, with
// a pause between the groups.
import { Text } from "react-native";

import { Card } from "@ui/components/Card";
import { useT } from "@ui/i18n/LocaleProvider";
import { fingerprintCharacters } from "@ui/screens/settings/fingerprintSpeech";
import { typeStyle, useTheme } from "@ui/theme";

import { fingerprintDisplay } from "./pairingModel";

export type FingerprintCardProps = {
  /** "ABCD EFGH IJKL MNOP". */
  readonly fingerprint: string;
  readonly testID?: string;
};

export function FingerprintCard({ fingerprint, testID = "fingerprint" }: FingerprintCardProps) {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <Card padded testID={testID}>
      <Text
        accessible
        accessibilityLabel={t("a11y.fingerprint", {
          characters: fingerprintCharacters(fingerprint, t("a11y.separator")),
        })}
        style={[typeStyle("fingerprint"), { color: colors.textTitle, textAlign: "center" }]}
        testID={`${testID}-text`}
      >
        {fingerprintDisplay(fingerprint)}
      </Text>
    </Card>
  );
}
