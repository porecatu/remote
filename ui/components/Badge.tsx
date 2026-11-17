// SPDX-License-Identifier: GPL-3.0-or-later
// The text-only chip (anatomy §2.3, §4.5.2): tab count of a group, profile
// name (mono) on a tab row, profile type in the new tab sheet (§4.12.8).
// Neutral color: the desktop gives no color per profile.
import type { ColorToken } from "../theme";
import { Chip } from "./Chip";

export type BadgeProps = {
  readonly label: string;
  /** `mono`: `type.mono-chip` (profile name and type); default `type.chip` (counts). */
  readonly font?: "system" | "mono";
  /** Text color; default `textSecondary`. */
  readonly color?: ColorToken;
  readonly testID?: string;
};

/** A neutral chip with text only. */
export function Badge({ label, font = "system", color = "textSecondary", testID }: BadgeProps) {
  return <Chip label={label} font={font} color={color} {...(testID === undefined ? {} : { testID })} />;
}
