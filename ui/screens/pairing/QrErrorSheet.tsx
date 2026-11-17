// SPDX-License-Identifier: GPL-3.0-or-later
// The error sheet of an unusable QR code (anatomy §4.3.2; PRD-001 RF-1.6):
// the reason (incompatible version, insecure relay, not a Porecatu code; a
// missing field reads as "not a Porecatu code") and "Scan again". The camera
// reads again only once the sheet is closed, by the button or otherwise.
import { Text } from "react-native";

import type { MessageKey } from "@/i18n/catalog";
import { Button } from "@ui/components/Button";
import { useT } from "@ui/i18n/LocaleProvider";
import { Sheet } from "@ui/overlay/Sheet";
import { typeStyle, useTheme } from "@ui/theme";

export type QrErrorSheetProps = {
  /** Why the code cannot be used (`pairingUriErrorKey`). */
  readonly reason: MessageKey;
  /** "Scan again": closes the sheet. */
  readonly onScanAgain: () => void;
};

/** The sheet of `openSheet` for an invalid pairing code. */
export function QrErrorSheet({ reason, onScanAgain }: QrErrorSheetProps) {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <Sheet
      title={t("pairing.invalid_code_title")}
      padded
      footer={
        <Button label={t("pairing.scan_again")} onPress={onScanAgain} width="full" testID="qr-error-scan-again" />
      }
      testID="qr-error"
    >
      <Text style={[typeStyle("body"), { color: colors.textSecondary }]} testID="qr-error-reason">
        {t(reason)}
      </Text>
    </Sheet>
  );
}
