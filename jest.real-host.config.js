// SPDX-License-Identifier: GPL-3.0-or-later
// Verification against a real Porecatu desktop and a real relay
// (`pnpm real-host`, test/real-host/README.md). Not part of `pnpm test`: it
// needs both running on this machine and, the first time, a pairing link.
const base = require("./jest.config.js");

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  testMatch: ["<rootDir>/test/real-host/**/*.check.ts"],
  // Real sockets and a person accepting the pairing on the desktop.
  testTimeout: 180_000,
  maxWorkers: 1,
};
