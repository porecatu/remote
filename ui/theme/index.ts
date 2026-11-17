// SPDX-License-Identifier: GPL-3.0-or-later
// The single source of the chrome's visual values (anatomy §2).
export {
  cameraColors,
  defaultGroupColors,
  palettes,
  rgbToCss,
  withAlpha,
  type ChromeColors,
  type ColorScheme,
  type ColorToken,
} from "./colors";
export {
  monoFaceName,
  monoFamily,
  monoFontFiles,
  monoWeight,
  type FontPlatform,
  type MonoWeight,
} from "./fonts";
export {
  ThemeProvider,
  schemeFromSystem,
  useReducedMotion,
  useTheme,
  type Theme,
} from "./ThemeProvider";
export {
  barMaxFontScale,
  duration,
  icon,
  opacity,
  radius,
  roundRadius,
  shadow,
  size,
  space,
  spaceScale,
  spacing,
  stroke,
  terminal,
  thumbnailAspectRatio,
  transitionDuration,
  type,
  type FontKind,
  type FontWeight,
  type IconRole,
  type SpaceStep,
  type TransitionName,
  type TypeName,
  type TypeRole,
} from "./tokens";
export { typeStyle } from "./typography";
