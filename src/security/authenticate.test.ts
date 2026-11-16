// SPDX-License-Identifier: GPL-3.0-or-later
import {
  createAuthenticator,
  mapAuthError,
  type LocalAuthModule,
} from "./authenticate";

function fakeModule(overrides: Partial<LocalAuthModule> = {}): LocalAuthModule {
  return {
    hasHardwareAsync: async () => true,
    isEnrolledAsync: async () => true,
    getEnrolledLevelAsync: async () => 2,
    authenticateAsync: async () => ({ success: true }),
    ...overrides,
  };
}

describe("capability", () => {
  it("is available with an enrolled level", async () => {
    const a = createAuthenticator(fakeModule());
    await expect(a.capability()).resolves.toBe("available");
  });

  it("is available with only a passcode (no biometric hardware)", async () => {
    const a = createAuthenticator(
      fakeModule({
        hasHardwareAsync: async () => false,
        isEnrolledAsync: async () => false,
        getEnrolledLevelAsync: async () => 1,
      }),
    );
    await expect(a.capability()).resolves.toBe("available");
  });

  it("is available with hardware and an enrolled biometric when the level reads none", async () => {
    const a = createAuthenticator(fakeModule({ getEnrolledLevelAsync: async () => 0 }));
    await expect(a.capability()).resolves.toBe("available");
  });

  it("is unavailable with no biometric and no passcode", async () => {
    const a = createAuthenticator(
      fakeModule({
        isEnrolledAsync: async () => false,
        getEnrolledLevelAsync: async () => 0,
      }),
    );
    await expect(a.capability()).resolves.toBe("unavailable");
  });

  it("is unavailable with no hardware and nothing enrolled", async () => {
    const a = createAuthenticator(
      fakeModule({
        hasHardwareAsync: async () => false,
        isEnrolledAsync: async () => false,
        getEnrolledLevelAsync: async () => 0,
      }),
    );
    await expect(a.capability()).resolves.toBe("unavailable");
  });
});

describe("authenticate", () => {
  it("asks with the device fallback enabled and the caller's text", async () => {
    const authenticateAsync = jest.fn(async () => ({ success: true as const }));
    const a = createAuthenticator(fakeModule({ authenticateAsync }));
    await expect(
      a.authenticate({ promptMessage: "Unlock", cancelLabel: "Cancel" }),
    ).resolves.toEqual({ kind: "success" });
    expect(authenticateAsync).toHaveBeenCalledWith({
      promptMessage: "Unlock",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
  });

  it("omits the cancel label when none is given", async () => {
    const authenticateAsync = jest.fn(async () => ({ success: true as const }));
    const a = createAuthenticator(fakeModule({ authenticateAsync }));
    await a.authenticate({ promptMessage: "Unlock" });
    expect(authenticateAsync).toHaveBeenCalledWith({
      promptMessage: "Unlock",
      disableDeviceFallback: false,
    });
  });

  it("maps a refusal to a failure", async () => {
    const a = createAuthenticator(
      fakeModule({
        authenticateAsync: async () => ({ success: false, error: "authentication_failed" }),
      }),
    );
    await expect(a.authenticate({ promptMessage: "Unlock" })).resolves.toEqual({
      kind: "failure",
      reason: "failed",
    });
  });

  it("never unlocks when the native call throws", async () => {
    const a = createAuthenticator(
      fakeModule({
        authenticateAsync: async () => {
          throw new Error("native");
        },
      }),
    );
    await expect(a.authenticate({ promptMessage: "Unlock" })).resolves.toEqual({
      kind: "failure",
      reason: "failed",
    });
  });
});

describe("mapAuthError", () => {
  it.each(["not_enrolled", "not_available", "passcode_not_set"])(
    "%s means unavailable",
    (error) => {
      expect(mapAuthError(error)).toEqual({ kind: "unavailable" });
    },
  );

  it.each(["user_cancel", "app_cancel", "system_cancel", "user_fallback"])(
    "%s means cancelled",
    (error) => {
      expect(mapAuthError(error)).toEqual({ kind: "failure", reason: "cancelled" });
    },
  );

  it("maps lockout", () => {
    expect(mapAuthError("lockout")).toEqual({ kind: "failure", reason: "lockout" });
  });

  it.each(["authentication_failed", "timeout", "unknown", "something_new"])(
    "%s means failed",
    (error) => {
      expect(mapAuthError(error)).toEqual({ kind: "failure", reason: "failed" });
    },
  );
});
