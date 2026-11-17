// SPDX-License-Identifier: GPL-3.0-or-later
// Jest environment: jest-expo's native environment plus the CanvasKit (WASM)
// build of Skia on `global.CanvasKit`, which @shopify/react-native-skia's Jest
// mock (`jestSetup.js`) needs. Mirrors the package's own `jestEnv.js`, but on
// top of jest-expo's environment instead of a plain Node one.
//
// `src/` holds no React and no drawing (docs/arquitetura.md), so its suites
// skip CanvasKit: compiling the WASM per suite costs time and memory.
const path = require("node:path");
const jestExpoPreset = require("jest-expo/jest-preset");

const ExpoNativeEnvironment = require(jestExpoPreset.testEnvironment);

// canvaskit-wasm is a dependency of Skia, resolved from Skia's own location.
const skiaRoot = path.dirname(require.resolve("@shopify/react-native-skia/package.json"));
const canvasKitPath = require.resolve("canvaskit-wasm/bin/full/canvaskit", { paths: [skiaRoot] });

class NativeTestEnvironment extends ExpoNativeEnvironment {
  constructor(config, context) {
    super(config, context);
    const pureLogic = path.join(config.projectConfig.rootDir, "src") + path.sep;
    this.needsCanvasKit = !context.testPath.startsWith(pureLogic);
  }

  async setup() {
    await super.setup();
    if (this.needsCanvasKit) {
      const CanvasKitInit = require(canvasKitPath);
      this.global.CanvasKit = await CanvasKitInit({});
    }
  }
}

module.exports = NativeTestEnvironment;
