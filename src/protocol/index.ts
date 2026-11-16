// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The only import point of `@porecatu/protocol` in the app (ADR-0001 §5): every
 * wire type, codec and session comes from the package, never from app code.
 * Keeping one entry makes a package upgrade a one-file review.
 */
export * from "@porecatu/protocol";
