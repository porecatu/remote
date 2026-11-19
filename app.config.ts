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
  version: "0.10.0",
  platforms: ["ios", "android"],
  userInterfaceStyle: "automatic",
  icon: "./assets/icon/icon.png",
  extra: {
    eas: {
		projectId: "6230f90e-d900-49b7-b590-c86a58e1ca14"
    },
  },
  ios: {
    bundleIdentifier: "com.porecatu.remote",
  },
  android: {
    package: "com.porecatu.remote",
    // Same artwork as the desktop; the background is the dark `bg.base` token.
    adaptiveIcon: {
      foregroundImage: "./assets/icon/adaptive-foreground.png",
      monochromeImage: "./assets/icon/adaptive-monochrome.png",
      backgroundColor: "#171b21",
    },
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
    // Iosevka Fixed 400 and 500, copied from the desktop (ADR-0009), are
    // registered in the binary at build time: nothing loads at runtime.
    [
      "expo-font",
      {
        fonts: [
          "./assets/fonts/IosevkaFixed-Regular.ttf",
          "./assets/fonts/IosevkaFixed-Medium.ttf",
        ],
      },
    ],
    // expo-screen-capture (SDK 58) ships no config plugin: nothing to register.
    // Neither do react-native-svg, Gesture Handler, Reanimated, Worklets,
    // Keyboard Controller and Skia (autolinked native modules).
  ],
};

export default config;
