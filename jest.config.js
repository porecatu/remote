// SPDX-License-Identifier: GPL-3.0-or-later
const jestExpoPreset = require("jest-expo/jest-preset");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // lucide-react-native resolves to ESM `.mjs` under the `react-native`
  // condition (as Metro does); compile it with jest-expo's own Babel setup.
  transform: { "\\.mjs$": jestExpoPreset.transform["\\.[jt]sx?$"] },
  testMatch: [
    "<rootDir>/src/**/*.test.ts?(x)",
    "<rootDir>/test/**/*.test.ts?(x)",
    "<rootDir>/ui/**/*.test.ts?(x)",
    "<rootDir>/app/**/*.test.ts?(x)",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@ui/(.*)$": "<rootDir>/ui/$1",
  },
  // jest-expo's environment plus CanvasKit for the Skia mock.
  testEnvironment: "<rootDir>/test/setup/environment.js",
  // Reanimated's resolver chained before jest-expo's.
  resolver: "<rootDir>/test/setup/resolver.js",
  // Official mocks of Gesture Handler, Reanimated, Keyboard Controller and Skia.
  setupFilesAfterEnv: ["<rootDir>/test/setup/native.ts"],
  // jest-expo's default pattern, extended so the pure-JS crypto and codec
  // packages, the protocol package and the native UI libraries (shipped as
  // untranspiled ESM) are transformed too.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-worklets|react-native-keyboard-controller|lucide-react-native|@shopify/react-native-skia|@noble/.*|@porecatu/.*|cbor-x))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
};
