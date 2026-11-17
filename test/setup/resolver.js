// SPDX-License-Identifier: GPL-3.0-or-later
// Jest resolver: Reanimated's (which also covers Worklets) chained before
// jest-expo's. Reanimated 4 runs in Jest through the non-native builds of a
// few of its modules; its resolver picks them, and jest-expo's still applies
// to everything else.
const jestExpoPreset = require("jest-expo/jest-preset");
const reanimatedResolver = require("react-native-reanimated/jest/resolver");

const expoResolver = require(jestExpoPreset.resolver);

/** @type {import('jest-resolve').SyncResolver} */
module.exports = (request, options) =>
  reanimatedResolver(request, {
    ...options,
    defaultResolver: (nextRequest, nextOptions) =>
      expoResolver(nextRequest, { ...nextOptions, defaultResolver: options.defaultResolver }),
  });
