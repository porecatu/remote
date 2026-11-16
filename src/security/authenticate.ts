// SPDX-License-Identifier: GPL-3.0-or-later

// Thin wrapper over `expo-local-authentication` (PRD-001 RF-1.17). It turns the
// module's loose results into a closed union the app lock state machine can
// consume, and it takes the module as a parameter so tests never touch native
// code. It carries no user-facing text: the prompt message comes from the
// caller (from the i18n catalog) and nothing is logged here.

import * as LocalAuthentication from "expo-local-authentication";

/** What the device can do for the lock. */
export type AuthCapability = "available" | "unavailable";

/** Why an authentication attempt did not succeed. */
export type AuthFailure = "cancelled" | "lockout" | "failed";

export type AuthResult =
  | { readonly kind: "success" }
  | { readonly kind: "failure"; readonly reason: AuthFailure }
  // The device has no biometrics and no passcode (or lost them mid-flight).
  | { readonly kind: "unavailable" };

/** The slice of `expo-local-authentication` this app uses. */
export interface LocalAuthModule {
  hasHardwareAsync(): Promise<boolean>;
  isEnrolledAsync(): Promise<boolean>;
  /** `SecurityLevel`: 0 = none, 1 = passcode/pattern/PIN, 2+ = biometrics. */
  getEnrolledLevelAsync(): Promise<number>;
  authenticateAsync(options?: {
    promptMessage?: string;
    cancelLabel?: string;
    disableDeviceFallback?: boolean;
  }): Promise<
    { success: true } | { success: false; error: string; warning?: string }
  >;
}

export interface AuthenticateOptions {
  /** Text shown by the system prompt; comes from the i18n catalog. */
  readonly promptMessage: string;
  /** Text of the cancel button; comes from the i18n catalog. */
  readonly cancelLabel?: string;
}

export interface Authenticator {
  capability(): Promise<AuthCapability>;
  authenticate(options: AuthenticateOptions): Promise<AuthResult>;
}

const UNAVAILABLE_ERRORS: ReadonlySet<string> = new Set([
  "not_enrolled",
  "not_available",
  "passcode_not_set",
]);

const CANCELLED_ERRORS: ReadonlySet<string> = new Set([
  "user_cancel",
  "app_cancel",
  "system_cancel",
  "user_fallback",
]);

/** Maps the module's error code to the closed result union. */
export function mapAuthError(error: string): AuthResult {
  if (UNAVAILABLE_ERRORS.has(error)) {
    return { kind: "unavailable" };
  }
  if (CANCELLED_ERRORS.has(error)) {
    return { kind: "failure", reason: "cancelled" };
  }
  if (error === "lockout") {
    return { kind: "failure", reason: "lockout" };
  }
  return { kind: "failure", reason: "failed" };
}

export function createAuthenticator(
  module: LocalAuthModule = LocalAuthentication,
): Authenticator {
  return {
    async capability() {
      // Any enrolled level counts, including a passcode with no biometrics:
      // that is the fallback the PRD asks for. Hardware plus an enrolled
      // biometric is checked too, for platforms that report only that.
      const level = await module.getEnrolledLevelAsync();
      if (level > 0) {
        return "available";
      }
      const [hardware, enrolled] = await Promise.all([
        module.hasHardwareAsync(),
        module.isEnrolledAsync(),
      ]);
      return hardware && enrolled ? "available" : "unavailable";
    },

    async authenticate(options) {
      try {
        const result = await module.authenticateAsync({
          promptMessage: options.promptMessage,
          ...(options.cancelLabel === undefined
            ? {}
            : { cancelLabel: options.cancelLabel }),
          // Biometrics first, the device passcode as the fallback.
          disableDeviceFallback: false,
        });
        return result.success ? { kind: "success" } : mapAuthError(result.error);
      } catch {
        // A native failure must never unlock the app.
        return { kind: "failure", reason: "failed" };
      }
    },
  };
}
