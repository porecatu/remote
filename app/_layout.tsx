// SPDX-License-Identifier: GPL-3.0-or-later
// Must stay the first import: it installs crypto.getRandomValues before
// anything that draws random bytes is loaded.
import { assertSecureRandom } from "../src/polyfills";

import { Stack } from "expo-router";

import { AppRoot } from "@ui/root/AppRoot";
import { createNativeServices } from "@ui/services/nativeServices";
import { useTheme } from "@ui/theme";

assertSecureRandom();

// The composition root of the running app: created once, for the app's life.
const services = createNativeServices();

/** The app's stack: no native header; `bg.base` under the screens. */
function Navigator() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgBase } }} />;
}

export default function RootLayout() {
  return (
    <AppRoot services={services}>
      <Navigator />
    </AppRoot>
  );
}
