// SPDX-License-Identifier: GPL-3.0-or-later
// The pairing stack (anatomy §4.3): one pairing flow shared by the camera,
// name and wait screens, disposed of when the stack goes away.
import { Stack } from "expo-router";

import { PairingProvider } from "@ui/screens/pairing";

export default function PairLayout() {
  return (
    <PairingProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </PairingProvider>
  );
}
