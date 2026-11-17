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
      "no-restricted-imports": [
        "error",
        {
          paths: [
            // Metro does not tree-shake: the index would bundle every icon.
            {
              name: "lucide-react-native",
              message:
                "Import each icon from 'lucide-react-native/icons/<name>', never the package index (ADR-0008).",
            },
            {
              name: "lucide-react-native/icons",
              message:
                "Import each icon from 'lucide-react-native/icons/<name>', never the icons index (ADR-0008).",
            },
            // Modal opens a separate native window, above the privacy cover.
            {
              name: "react-native",
              importNames: ["Modal"],
              message:
                "Sheets, dialogs and snackbars go through the app's overlay layer, never Modal (ADR-0011).",
            },
          ],
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
