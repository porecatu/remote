// SPDX-License-Identifier: GPL-3.0-or-later
// The chrome theme follows the system light/dark mode (RF-2.13): no app
// option. The provider also tracks the system "reduce motion" setting, live,
// for the animations (§1 principle 9, §5 item 6).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, useColorScheme } from "react-native";

import { palettes, type ChromeColors, type ColorScheme } from "./colors";

/** What `useTheme()` returns. */
export type Theme = {
  readonly scheme: ColorScheme;
  readonly colors: ChromeColors;
};

type ThemeContextValue = Theme & { readonly reducedMotion: boolean };

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The mode of a system color scheme. With no answer from the system, the
 * chrome is dark, like the desktop's default theme.
 */
export function schemeFromSystem(system: string | null | undefined): ColorScheme {
  return system === "light" ? "light" : "dark";
}

/** The live "reduce motion" setting of the system. */
function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => {
        if (active) {
          setReduced(value);
        }
      },
      () => undefined,
    );
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      setReduced(value);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

type ThemeProviderProps = {
  /** Forces a mode (the camera screen is always dark, §4.3.2); default: the system's. */
  readonly scheme?: ColorScheme;
  readonly children: ReactNode;
};

/** Provides the chrome theme and the reduce-motion setting to the tree below. */
export function ThemeProvider({ scheme, children }: ThemeProviderProps) {
  const system = useColorScheme();
  const parent = useContext(ThemeContext);
  const systemReduced = useSystemReducedMotion();
  const resolved = scheme ?? schemeFromSystem(system);
  const reducedMotion = parent?.reducedMotion ?? systemReduced;
  const value = useMemo<ThemeContextValue>(
    () => ({ scheme: resolved, colors: palettes[resolved], reducedMotion }),
    [resolved, reducedMotion],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * The chrome mode and its colors. Outside a `ThemeProvider` it still follows
 * the system mode.
 */
export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  const system = useColorScheme();
  return useMemo<Theme>(() => {
    if (context !== null) {
      return { scheme: context.scheme, colors: context.colors };
    }
    const scheme = schemeFromSystem(system);
    return { scheme, colors: palettes[scheme] };
  }, [context, system]);
}

/**
 * Whether the system asks to reduce motion: transitions then run with no
 * animation (`transitionDuration` in ./tokens.ts); spinners stay. Outside a
 * `ThemeProvider` it is `false`.
 */
export function useReducedMotion(): boolean {
  return useContext(ThemeContext)?.reducedMotion ?? false;
}
