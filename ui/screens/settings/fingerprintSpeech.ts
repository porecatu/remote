// SPDX-License-Identifier: GPL-3.0-or-later
// The fingerprint as the screen reader reads it (anatomy §4.3.4 and §4.4.2):
// character by character, with a pause between the groups ("A B C D, E F G
// H, …"), so it can be compared by voice. The fingerprint is public; it is
// never logged anyway.

/**
 * The `{characters}` of `a11y.fingerprint`: the characters of each group
 * separated by spaces, and the groups by `groupSeparator` (`a11y.separator`).
 */
export function fingerprintCharacters(fingerprint: string, groupSeparator: string): string {
  return fingerprint
    .trim()
    .split(/\s+/)
    .filter((group) => group !== "")
    .map((group) => Array.from(group).join(" "))
    .join(groupSeparator);
}
