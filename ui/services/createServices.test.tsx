// SPDX-License-Identifier: GPL-3.0-or-later
import { screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { createHarness } from "@/session/testing";
import { type SecureStore, createMemoryStore } from "@/storage/secureStore";
import { DEVICE_KEY_ITEM, deviceFingerprint } from "@/storage/deviceIdentity";
import { loadSettings } from "@/storage/settings";
import { useT } from "@ui/i18n/LocaleProvider";

import { useServices } from "./ServicesContext";
import { createTestServices, renderWithServices } from "./testing";

describe("createServices over fakes", () => {
  it("is not ready until started, then holds the device key", async () => {
    const services = createTestServices();
    expect(services.status.getState()).toMatchObject({ ready: false, fingerprint: null });
    expect(() => services.identity.keypair()).toThrow();
    expect(() => services.registry.open({} as never)).toThrow();
    expect(services.registry.openIds()).toEqual([]);

    await services.start();

    const keypair = services.identity.keypair();
    expect(services.status.getState()).toEqual({
      ready: true,
      failed: false,
      recreating: false,
      fingerprint: deviceFingerprint(keypair),
    });
    expect(await services.fakes.secureStore.get(DEVICE_KEY_ITEM)).not.toBeNull();
    expect(services.settings.store.getState().loaded).toBe(true);
  });

  it("uses the stored key", async () => {
    const h = createHarness();
    const services = createTestServices({ deviceKey: h.device });
    await services.start();
    expect(services.status.getState().fingerprint).toBe(deviceFingerprint(h.device));
    expect(services.identity.keypair().publicKey).toEqual(h.device.publicKey);
  });

  it("hands out a copy of the key", async () => {
    const services = createTestServices();
    await services.start();
    const copy = services.identity.keypair();
    copy.privateKey.fill(0);
    expect(services.identity.keypair().privateKey.some((byte) => byte !== 0)).toBe(true);
  });

  it("reports a failed start and can start again", async () => {
    const base = createMemoryStore();
    let failing = true;
    const store: SecureStore = {
      get: (key) => (failing ? Promise.reject(new Error("locked")) : base.get(key)),
      set: (key, value) => base.set(key, value),
      delete: (key) => base.delete(key),
    };
    const services = createTestServices({ deps: { secureStore: store } });
    await expect(services.start()).rejects.toThrow("locked");
    expect(services.status.getState()).toMatchObject({ ready: false, failed: true });
    failing = false;
    await services.start();
    expect(services.status.getState()).toMatchObject({ ready: true, failed: false });
  });

  it("shares one settings object with the app shell", async () => {
    const services = createTestServices({ settings: { appLock: false } });
    await services.start();
    await services.appShell.start();
    expect(services.appShell.store.getState().lock.appLock).toBe(false);
    await services.appShell.setLockEnabled(true);
    expect(services.settings.store.getState().settings.appLock).toBe(true);
    expect((await loadSettings(services.fakes.secureStore)).appLock).toBe(true);
  });

  it("recreates the identity: sessions closed, list cleared, new key in use", async () => {
    const h = createHarness();
    const services = createTestServices({
      relay: h.relay,
      time: h.time,
      deviceKey: h.device,
      desktops: [h.desktop],
    });
    await services.start();
    await services.desktops.load();
    expect(services.desktops.store.getState().desktops).toHaveLength(1);
    expect(services.desktops.open(h.desktop.id)).toBeDefined();
    const socket = services.fakes.network.last();
    socket.open();
    expect(services.registry.openIds()).toEqual([h.desktop.id]);
    const before = services.status.getState().fingerprint;

    await services.recreateIdentity();

    expect(socket.closedByApp).toBe(true);
    expect(services.registry.openIds()).toEqual([]);
    expect(services.desktops.store.getState().desktops).toEqual([]);
    expect(await services.fakes.secureStore.get("desktops.v1")).toBeNull();
    const after = services.status.getState();
    expect(after.recreating).toBe(false);
    expect(after.fingerprint).not.toBe(before);
    expect(after.fingerprint).toBe(deviceFingerprint(services.identity.keypair()));

    // The registry the screens hold works on the new key.
    services.registry.open(h.desktop);
    expect(services.registry.openIds()).toEqual([h.desktop.id]);
    services.registry.closeAll();
  });

  it("keeps everything when the new key cannot be written", async () => {
    const base = createMemoryStore();
    let failWrites = false;
    const store: SecureStore = {
      get: (key) => base.get(key),
      set: (key, value) => (failWrites ? Promise.reject(new Error("locked")) : base.set(key, value)),
      delete: (key) => base.delete(key),
    };
    const services = createTestServices({ deps: { secureStore: store } });
    await services.start();
    const before = services.status.getState().fingerprint;
    failWrites = true;
    await expect(services.recreateIdentity()).rejects.toThrow("locked");
    expect(services.status.getState()).toMatchObject({ fingerprint: before, recreating: false });
  });

  it("follows the stored key when the list cannot be cleared", async () => {
    const base = createMemoryStore();
    let failDeletes = false;
    const store: SecureStore = {
      get: (key) => base.get(key),
      set: (key, value) => base.set(key, value),
      delete: (key) => (failDeletes ? Promise.reject(new Error("locked")) : base.delete(key)),
    };
    const services = createTestServices({ deps: { secureStore: store } });
    await services.start();
    const before = services.status.getState().fingerprint;
    failDeletes = true;
    await expect(services.recreateIdentity()).rejects.toThrow("locked");
    const after = services.status.getState().fingerprint;
    expect(after).not.toBe(before);
    expect(after).toBe(deviceFingerprint(services.identity.keypair()));
  });
});

describe("renderWithServices", () => {
  function Probe() {
    const services = useServices();
    const { t } = useT();
    return <Text testID="probe">{`${services.appVersion} ${t("common.cancel")}`}</Text>;
  }

  it("renders a screen inside every provider, with the services started", async () => {
    const { services } = await renderWithServices(<Probe />);
    expect(services.status.getState().ready).toBe(true);
    expect(screen.getByTestId("probe").props.children).toBe("0.0.0-test Cancel");
  });

  it("takes prepared services", async () => {
    const services = createTestServices({ appVersion: "9.9.9", settings: { language: "pt_BR" } });
    await renderWithServices(<Probe />, { services });
    expect(screen.getByTestId("probe").props.children).toBe("9.9.9 Cancelar");
  });
});
