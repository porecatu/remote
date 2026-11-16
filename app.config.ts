// SPDX-License-Identifier: GPL-3.0-or-later
import type { ExpoConfig } from "expo/config";

// Permission texts are placeholders: the user-facing wording is decided with
// the visual review (docs/design) and the i18n catalog (ADR-0005). The OS
// permission prompts are the only strings that live outside the catalog,
// because the native build reads them at build time.
const config: ExpoConfig = {
  name: "Porecatu Remote",
  slug: "porecatu-remote",
  scheme: "porecatu",
  version: "0.0.0",
  platforms: ["ios", "android"],
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "br.com.porecatu.remote",
  },
  android: {
    package: "br.com.porecatu.remote",
    // The static key lives in the Keystore (ADR-0003); never back it up.
    allowBackup: false,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-camera",
      {
        cameraPermission: "Porecatu Remote uses the camera to scan the pairing QR code.",
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-local-authentication",
      {
        faceIDPermission: "Porecatu Remote uses Face ID to unlock the app.",
      },
    ],
    // expo-screen-capture (SDK 58) ships no config plugin: nothing to register.
  ],
};

export default config;
