// SPDX-License-Identifier: GPL-3.0-or-later
// The status label (anatomy §4.2, §4.5.2): a chip with a dot or an icon (or
// the spinner) and the text. State is never only color (§1 principle 3), so
// the text is required.
import type { ColorToken } from "../theme";
import { Chip, type ChipLeading } from "./Chip";

export type StatusLabelProps = {
  /** The state in words ("Online", "exited 1"). */
  readonly label: string;
  /** Dot, icon or spinner before the text. */
  readonly indicator: ChipLeading;
  /** Text color; default `textSecondary`. */
  readonly color?: ColorToken;
  readonly testID?: string;
};

/** A state shown as dot or icon plus text. */
export function StatusLabel({ label, indicator, color = "textSecondary", testID }: StatusLabelProps) {
  return (
    <Chip
      label={label}
      leading={indicator}
      color={color}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
