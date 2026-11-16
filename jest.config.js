// SPDX-License-Identifier: GPL-3.0-or-later
/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/*.test.ts?(x)", "<rootDir>/test/**/*.test.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  // jest-expo's default pattern, extended so the pure-JS crypto and codec
  // packages (and the protocol package, once it lands) are transformed too.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@noble/.*|@porecatu/.*|cbor-x))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
};
