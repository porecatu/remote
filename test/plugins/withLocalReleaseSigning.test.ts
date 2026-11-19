// SPDX-License-Identifier: GPL-3.0-or-later
import { applyLocalReleaseSigning } from "../../plugins/withLocalReleaseSigning";

// Trimmed copy of the `android { ... }` block that `expo prebuild` generates.
const TEMPLATE = `android {
    defaultConfig {
        versionCode 1
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

describe("applyLocalReleaseSigning", () => {
  it("adds a release signing config that reads the Gradle properties", () => {
    const out = applyLocalReleaseSigning(TEMPLATE);
    expect(out).toContain("PORECATU_KEYSTORE_FILE");
    expect(out).toContain("storePassword findProperty('PORECATU_KEYSTORE_PASSWORD')");
    expect(out).toContain("keyAlias findProperty('PORECATU_KEY_ALIAS')");
    expect(out).toContain("keyPassword findProperty('PORECATU_KEY_PASSWORD')");
  });

  it("points only the release build type at the new config", () => {
    const out = applyLocalReleaseSigning(TEMPLATE);
    const debugType = out.slice(out.indexOf("buildTypes"), out.indexOf("release {", out.indexOf("buildTypes")));
    expect(debugType).toContain("signingConfig signingConfigs.debug");
    expect(out).toMatch(/release \{\s*\/\/ Caution[^]*?signingConfig signingConfigs\.release/);
    expect(out.match(/signingConfig signingConfigs\.debug/g)).toHaveLength(1);
  });

  it("keeps the debug keystore config and the signingConfigs braces balanced", () => {
    const out = applyLocalReleaseSigning(TEMPLATE);
    expect(out).toContain("storeFile file('debug.keystore')");
    expect(out.match(/\{/g)?.length).toBe(out.match(/\}/g)?.length);
  });

  it("guards release tasks only, with a readable error", () => {
    const out = applyLocalReleaseSigning(TEMPLATE);
    expect(out).toContain(":app:bundleRelease");
    expect(out).toContain(":app:assembleRelease");
    expect(out).toContain("Local release signing: missing Gradle properties");
  });

  it("is idempotent", () => {
    const once = applyLocalReleaseSigning(TEMPLATE);
    expect(applyLocalReleaseSigning(once)).toBe(once);
  });

  it("throws when the template layout is not recognized", () => {
    expect(() => applyLocalReleaseSigning("android { }")).toThrow(/expected/);
  });

  it("never embeds a secret or a keystore path", () => {
    const out = applyLocalReleaseSigning(TEMPLATE);
    expect(out).not.toMatch(/\.jks|\.keystore'\)?\s*\n\s*storePassword '(?!android)/);
  });
});
