// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Test doubles of `@porecatu/protocol` (`testKeypair`, `createMemoryRelay`,
 * `createFakeHost`). Kept apart from `index.ts` so no production module can
 * import them by accident: only tests and `tools/` may use this file.
 */
export * from "@porecatu/protocol/testing";
