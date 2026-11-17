// SPDX-License-Identifier: GPL-3.0-or-later
// Where the pairing screens go (anatomy §3, §4.3): camera → name → wait, the
// wait replacing the name (its bar has a close, not a back); a result leaves
// the flow, goes back to the camera, or opens the workspace of the desktop
// just paired, in the session the pairing opened (RF-1.10).
import { useRouter } from "expo-router";
import { useMemo } from "react";

export type PairingNavigation = {
  /** The camera read a valid code. */
  toName(): void;
  /** The name was confirmed: the wait takes the name screen's place. */
  toWait(): void;
  /** "Scan another code": back to the camera (it replaces the screen when the camera is not in the stack). */
  toScan(): void;
  /** Paired: the workspace of the desktop takes the place of the whole flow. */
  toDesktop(desktopId: string): void;
  /** One screen back (the back arrow and the camera's close). */
  back(): void;
  /** Leaves the flow, back to the desktop list. */
  leave(): void;
};

export function usePairingNavigation(): PairingNavigation {
  const router = useRouter();
  return useMemo(
    () => ({
      toName: () => router.push("/pair/name"),
      toWait: () => router.replace("/pair/wait"),
      toScan: () => router.dismissTo("/pair"),
      toDesktop: (desktopId) => router.replace(`/desktop/${desktopId}`),
      back: () => router.back(),
      leave: () => router.dismissTo("/"),
    }),
    [router],
  );
}
