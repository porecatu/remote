// SPDX-License-Identifier: GPL-3.0-or-later
// The rows of the workspace tree (anatomy §4.5.2): data and callbacks only.
export { GroupCard, type GroupCardProps } from "./GroupCard";
export { NewTabRow, type NewTabRowProps, type NewTabRowVariant } from "./NewTabRow";
export { SectionHeader, type SectionHeaderProps, type WindowSection } from "./SectionHeader";
export { TabRow, type TabRowMatch, type TabRowProps } from "./TabRow";
export { WindowHeader, type WindowHeaderProps } from "./WindowHeader";
export {
  groupAccessibilityLabel,
  matchSegments,
  resolveGroupColor,
  tabAccessibilityLabel,
  tabDetail,
  tabIndicator,
  windowAccessibilityLabel,
  windowSections,
  type GroupLabelInput,
  type TextSegment,
  type WindowSections,
} from "./rowModel";
