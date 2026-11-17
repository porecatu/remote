// SPDX-License-Identifier: GPL-3.0-or-later
// Official Jest mocks of the native UI libraries (ADR-0002, ADR-0008, ADR-0010),
// installed for every test. The Expo modules (expo-font, expo-haptics,
// expo-screen-capture, expo-camera, expo-device, expo-local-authentication,
// expo-secure-store) are already mocked by jest-expo's preset.
import { setUpTests } from "react-native-reanimated";

// Gesture Handler: native module, buttons, touchables and the v3 detector.
import "react-native-gesture-handler/jestSetup";
// Skia: the CanvasKit-backed mock; `Canvas` becomes a plain `View`, and the
// `Skia` API (paths, pictures, fonts) runs on CanvasKit from the environment.
import "@shopify/react-native-skia/jestSetup";

// Worklets: the package's own mock (synchronous runtimes, a UI runtime holder
// for Gesture Handler); Reanimated runs on top of it.
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));

// Keyboard Controller: the package's own mock (providers, hooks, sticky views).
jest.mock("react-native-keyboard-controller", () =>
  jest.requireActual("react-native-keyboard-controller/jest"),
);

// Reanimated runs for real, on its Jest build (see test/setup/resolver.js),
// with fake-timer driven animations and the `toHaveAnimatedStyle` matchers.
setUpTests();
