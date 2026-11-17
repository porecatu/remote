// SPDX-License-Identifier: GPL-3.0-or-later
// The embedded Iosevka Fixed faces (ADR-0009), resolved in one place. The
// chrome uses the system font and never sets a family; only the mono roles of
// the chrome (tokens `type.*` with `font: "mono"`) and the grid use these.
//
// React Native finds an embedded face by a different name on each platform:
// - iOS: the PostScript name (`name` table, nameID 6).
// - Android: the file name without extension (the expo-font config plugin
//   copies the files to the app's assets/fonts).
// The names below were read from the `name` tables of the files in
// assets/fonts/ (nameID 6 is "Iosevka-Fixed" in IosevkaFixed-Regular.ttf,
// weight class 400, and "Iosevka-Fixed-Medium" in IosevkaFixed-Medium.ttf,
// weight class 500).
import { Platform } from "react-native";

/** The two weights of the embedded mono face. Mono 600 falls back to 500. */
export type MonoWeight = 400 | 500;

/** A platform React Native runs on, as `Platform.OS` reports it. */
export type FontPlatform = typeof Platform.OS;

const iosFaces: Readonly<Record<MonoWeight, string>> = {
  400: "Iosevka-Fixed",
  500: "Iosevka-Fixed-Medium",
};

const androidFaces: Readonly<Record<MonoWeight, string>> = {
  400: "IosevkaFixed-Regular",
  500: "IosevkaFixed-Medium",
};

/** The mono weight that serves a requested weight (only 400 and 500 exist). */
export function monoWeight(weight: number | string): MonoWeight {
  return Number(weight) >= 500 ? 500 : 400;
}

/** The face name of a mono weight on a platform. */
export function monoFaceName(platform: FontPlatform, weight: MonoWeight): string {
  return platform === "ios" ? iosFaces[weight] : androidFaces[weight];
}

/**
 * The `fontFamily` of the mono face of a weight on this platform. The weight
 * is carried by the face itself: set no `fontWeight` together with it.
 */
export function monoFamily(weight: number | string): string {
  return monoFaceName(Platform.OS, monoWeight(weight));
}

/**
 * The font files themselves (asset module ids), for the Skia grid render,
 * which loads the same TTF the chrome uses (ADR-0009 item 4).
 */
export const monoFontFiles: Readonly<Record<MonoWeight, number>> = {
  400: require("../../assets/fonts/IosevkaFixed-Regular.ttf") as number,
  500: require("../../assets/fonts/IosevkaFixed-Medium.ttf") as number,
};
