// SPDX-License-Identifier: GPL-3.0-or-later
// Text styles of the §2.3 type roles, ready for a `<Text style>`. The system
// font roles set no family; the mono roles get the embedded face of their
// weight (./fonts.ts), which carries the weight by itself.
import type { TextStyle } from "react-native";

import { monoFamily } from "./fonts";
import { type, type TypeName, type TypeRole } from "./tokens";

function toTextStyle(role: TypeRole): TextStyle {
  const base: TextStyle =
    role.font === "mono"
      ? { fontFamily: monoFamily(role.fontWeight), fontSize: role.fontSize, lineHeight: role.lineHeight }
      : { fontSize: role.fontSize, fontWeight: role.fontWeight, lineHeight: role.lineHeight };
  return {
    ...base,
    ...(role.letterSpacing === undefined ? {} : { letterSpacing: role.letterSpacing }),
    ...(role.uppercase === true ? { textTransform: "uppercase" as const } : {}),
  };
}

const styles = Object.fromEntries(
  (Object.keys(type) as TypeName[]).map((name) => [name, toTextStyle(type[name])]),
) as Record<TypeName, TextStyle>;

/** The text style of a type role (size, weight, line height, family). */
export function typeStyle(name: TypeName): TextStyle {
  return styles[name];
}
