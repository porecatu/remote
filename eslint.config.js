// SPDX-License-Identifier: GPL-3.0-or-later
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const react = require("eslint-plugin-react");

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: ["dist/*", "coverage/*", ".expo/*", "android/*", "ios/*", "vendor/*"],
  },
  {
    plugins: { react },
    rules: {
      // UI text only comes from the i18n catalog (ADR-0005).
      "react/jsx-no-literals": "error",
      // Only src/log.ts may write to the console (logs carry events, never content).
      "no-console": "error",
      // Randomness comes from crypto.getRandomValues, never Math.random.
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use crypto.getRandomValues; Math.random is not a secure source.",
        },
      ],
    },
  },
  {
    files: ["src/log.ts"],
    rules: {
      "no-console": "off",
    },
  },
]);
