// SPDX-License-Identifier: GPL-3.0-or-later
// What expo-router does with a URL from the system (`redirectSystemPath` of
// `app/+native-intent.tsx`). Left alone, the router would turn
// `porecatu://pair?...` into the `/pair` route with the single-use token in
// its parameters, and open it even under the lock. The app takes no route from
// the system: a cold start opens the list (`/`), a link while running keeps
// the current screen, and the pairing link reaches the flow only through the
// app shell (./DeepLinkBridge.tsx), after the unlock.

/** The event expo-router hands to `redirectSystemPath`. */
export type SystemPathEvent = {
  readonly path: string;
  readonly initial: boolean;
};

/** The route for a system URL: `/` at a cold start, otherwise none (stay). */
export function redirectSystemPath({ initial }: SystemPathEvent): string | null {
  return initial ? "/" : null;
}
