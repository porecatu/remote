// SPDX-License-Identifier: GPL-3.0-or-later
import { withAppBuildGradle, type ConfigPlugin } from "expo/config-plugins";

/**
 * Local release signing for `expo prebuild` + Gradle builds.
 *
 * The prebuild template signs the `release` build type with the debug
 * keystore. This plugin points it at a real keystore instead (for example
 * the one EAS generated), read from Gradle properties so that no secret ever
 * lands in the repository or in the generated `android/` folder. Put them in
 * the user-level `~/.gradle/gradle.properties`:
 *
 *   PORECATU_KEYSTORE_FILE=C:/Users/me/keys/porecatu-remote/keystore.jks
 *   PORECATU_KEYSTORE_PASSWORD=...
 *   PORECATU_KEY_ALIAS=...
 *   PORECATU_KEY_PASSWORD=...
 *
 * It is opt-in: it only runs when `PORECATU_LOCAL_SIGNING=1` is set during
 * prebuild. EAS Build injects its own signing config into `build.gradle`, and
 * a second `release` config would collide with it, so EAS never sets the flag.
 */
export const LOCAL_SIGNING_ENV = "PORECATU_LOCAL_SIGNING";

const MARKER = "porecatu-local-release-signing";

const RELEASE_SIGNING_CONFIG = `
        // BEGIN ${MARKER}
        release {
            def keystorePath = findProperty('PORECATU_KEYSTORE_FILE')
            if (keystorePath) storeFile file(keystorePath)
            storePassword findProperty('PORECATU_KEYSTORE_PASSWORD')
            keyAlias findProperty('PORECATU_KEY_ALIAS')
            keyPassword findProperty('PORECATU_KEY_PASSWORD')
        }
        // END ${MARKER}
`;

// Fails the build early, with a readable message, instead of letting Gradle
// fall over deep inside the signing task. Only release tasks are checked, so
// debug builds and `gradlew clean` keep working without the properties.
const RELEASE_SIGNING_CHECK = `
    // BEGIN ${MARKER}-check
    project.gradle.taskGraph.whenReady { graph ->
        def releaseBuild = graph.allTasks.any {
            it.path == ':app:assembleRelease' || it.path == ':app:bundleRelease'
        }
        if (releaseBuild) {
            def required = ['PORECATU_KEYSTORE_FILE', 'PORECATU_KEYSTORE_PASSWORD', 'PORECATU_KEY_ALIAS', 'PORECATU_KEY_PASSWORD']
            def missing = required.findAll { !findProperty(it) }
            if (!missing.isEmpty()) {
                throw new GradleException("Local release signing: missing Gradle properties \${missing.join(', ')}. Set them in ~/.gradle/gradle.properties.")
            }
            if (!file(findProperty('PORECATU_KEYSTORE_FILE')).exists()) {
                throw new GradleException("Local release signing: keystore not found at \${findProperty('PORECATU_KEYSTORE_FILE')}.")
            }
        }
    }
    // END ${MARKER}-check
`;

// The debug `signingConfigs` entry, through its closing brace, and the
// `signingConfig signingConfigs.debug` line inside the `release` build type.
const SIGNING_CONFIGS_PATTERN = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\}[ \t]*\n?)([ \t]*\})/;
const RELEASE_BUILD_TYPE_PATTERN =
  /(buildTypes\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;

/**
 * Rewrites the contents of `android/app/build.gradle` so that the `release`
 * build type is signed with `signingConfigs.release`. Idempotent, and it
 * throws if the template no longer has the shape it expects, so a change in
 * the Expo template is noticed at prebuild instead of silently shipping a
 * debug-signed build.
 */
export function applyLocalReleaseSigning(contents: string): string {
  if (contents.includes(`BEGIN ${MARKER}`)) {
    return contents;
  }
  if (!SIGNING_CONFIGS_PATTERN.test(contents) || !RELEASE_BUILD_TYPE_PATTERN.test(contents)) {
    throw new Error(
      "withLocalReleaseSigning: android/app/build.gradle does not have the expected " +
        "signingConfigs/buildTypes layout; update plugins/withLocalReleaseSigning.ts.",
    );
  }
  return contents
    .replace(
      SIGNING_CONFIGS_PATTERN,
      (_match, debugBlock: string, close: string) =>
        `${debugBlock}${RELEASE_SIGNING_CONFIG}${close}\n${RELEASE_SIGNING_CHECK}`,
    )
    .replace(RELEASE_BUILD_TYPE_PATTERN, "$1signingConfig signingConfigs.release");
}

const withLocalReleaseSigning: ConfigPlugin = (config) => {
  if (process.env[LOCAL_SIGNING_ENV] !== "1") {
    return config;
  }
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== "groovy") {
      throw new Error("withLocalReleaseSigning: only a Groovy build.gradle is supported.");
    }
    modConfig.modResults.contents = applyLocalReleaseSigning(modConfig.modResults.contents);
    return modConfig;
  });
};

export default withLocalReleaseSigning;
