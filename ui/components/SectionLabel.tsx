// SPDX-License-Identifier: GPL-3.0-or-later
// The section label (anatomy §2.3 `type.section`: 12/600, uppercase, spacing
// .6, `text.section`; §2.6 `section.*`): a heading for the screen reader. The
// label arrives as written in the catalog; the uppercase is only drawn, so the
// screen reader reads words, not letters.
import { Text } from "react-native";

import { spacing, typeStyle, useTheme } from "../theme";

export type SectionLabelProps = {
  /** Already translated. */
  readonly label: string;
  /** At the top of a block (`section.padding-top-first`, 4) instead of between blocks (24). */
  readonly first?: boolean;
  readonly testID?: string;
};

/** An uppercase section heading. */
export function SectionLabel({ label, first = false, testID }: SectionLabelProps) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      {...(testID === undefined ? {} : { testID })}
      style={[
        typeStyle("section"),
        {
          color: colors.textSection,
          paddingTop: first ? spacing.sectionPaddingTopFirst : spacing.sectionPaddingTop,
          paddingHorizontal: spacing.sectionPaddingX,
          paddingBottom: spacing.sectionPaddingBottom,
        },
      ]}
    >
      {label}
    </Text>
  );
}
