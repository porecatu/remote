// SPDX-License-Identifier: GPL-3.0-or-later
// The stack of an open desktop (anatomy §3): the workspace and the terminal,
// with the desktop's session and its overlays around them. Leaving the stack
// closes the session.
import { Stack, useLocalSearchParams } from "expo-router";

import { DesktopSessionScope } from "@ui/screens/workspace/DesktopSessionScope";
import { useTheme } from "@ui/theme";

export default function DesktopLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  return (
    <DesktopSessionScope desktopId={typeof id === "string" ? id : ""}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgBase } }} />
    </DesktopSessionScope>
  );
}
