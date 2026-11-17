// SPDX-License-Identifier: GPL-3.0-or-later
// The section labels of a window (anatomy §4.5.2 items 3 and 4, PRD-002
// RF-2.7): "Pinned" over the pinned block, the first block of the window, and
// "Track" over the groups and loose tabs, only when there is a pinned block to
// separate it from (`windowSections` gives the rule). Marked as a header.
import { memo } from "react";

import { SectionLabel } from "@ui/components";
import { useT } from "@ui/i18n/LocaleProvider";

/** Which of the two sections of a window. */
export type WindowSection = "pinned" | "trail";

export type SectionHeaderProps = {
  readonly section: WindowSection;
  readonly testID?: string;
};

function SectionHeaderView({ section, testID }: SectionHeaderProps) {
  const { t } = useT();
  return (
    <SectionLabel
      label={t(section === "pinned" ? "workspace.pinned" : "workspace.trail")}
      // "Pinned" opens the window; "Track" comes between blocks.
      first={section === "pinned"}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}

/** "Pinned" or "Track" over a block of the window. */
export const SectionHeader = memo(SectionHeaderView);
