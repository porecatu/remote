// SPDX-License-Identifier: GPL-3.0-or-later
// Must stay the first import: it installs crypto.getRandomValues before
// anything that draws random bytes is loaded.
import { assertSecureRandom } from "../src/polyfills";

import { Stack } from "expo-router";

assertSecureRandom();

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
