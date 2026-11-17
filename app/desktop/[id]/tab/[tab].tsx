// SPDX-License-Identifier: GPL-3.0-or-later
// The terminal of a tab of the open desktop (anatomy §4.6 to §4.11); `[tab]`
// is the desktop's `tab-id`.
import { useLocalSearchParams } from "expo-router";

import { TerminalScreen } from "@ui/screens/terminal/TerminalScreen";

export default function TerminalRoute() {
  const { tab } = useLocalSearchParams<{ tab: string }>();
  return <TerminalScreen tabId={Number(tab)} />;
}
