// SPDX-License-Identifier: GPL-3.0-or-later
// The typing of the matchers Reanimated's `setUpTests()` (test/setup/native.ts)
// installs. Reanimated declares them only in the native build of its typings
// (`jestUtils/index.native.d.ts`), which `tsc` does not pick, so they are
// declared here, with the same signatures, for every test.
export {};

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveAnimatedStyle(
        style: Record<string, unknown>[] | Record<string, unknown>,
        config?: { shouldMatchAllProps?: boolean },
      ): R;
      toHaveAnimatedProps(props: Record<string, unknown>): R;
    }
  }
}
