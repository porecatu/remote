// SPDX-License-Identifier: GPL-3.0-or-later
import {
  MAX_DESKTOPS,
  addOrReplaceDesktop,
  createDesktopId,
  createDesktopRepository,
  loadDesktops,
  markDesktopStatus,
  normalizeName,
  parseDesktopListFile,
  removeDesktop,
  renameDesktop,
  saveDesktops,
  serializeDesktopList,
  type Desktop,
  type NewDesktop,
} from "./desktopList";
import { createMemoryStore } from "./secureStore";

const KEY_A = "A".repeat(43);
const KEY_B = "B".repeat(43);
const HOST_ID = "abcdefghijklmnopqrstuvwxyz234567".slice(0, 32);
const T0 = "2026-11-15T10:00:00.000Z";
const T1 = "2026-11-15T11:30:00Z";

let counter = 0;
function fakeRandom(length: number): Uint8Array {
  counter += 1;
  return Uint8Array.from({ length }, (_, i) => (counter * 7 + i) & 0xff);
}

function input(overrides: Partial<NewDesktop> = {}): NewDesktop {
  return {
    name: "Casa",
    relayUrl: "wss://relay.example.com/relay",
    hostId: HOST_ID,
    hostKeyB64: KEY_A,
    pairedAt: T0,
    ...overrides,
  };
}

function added(list: readonly Desktop[], overrides: Partial<NewDesktop> = {}): readonly Desktop[] {
  const result = addOrReplaceDesktop(list, input(overrides), fakeRandom);
  if (!result.ok) {
    throw new Error(`add failed: ${result.reason}`);
  }
  return result.list;
}

function keyN(n: number): string {
  return String.fromCharCode(65 + (n % 26)).repeat(42) + String.fromCharCode(97 + Math.floor(n / 26));
}

describe("createDesktopId", () => {
  it("is 32 lowercase hex characters", () => {
    expect(createDesktopId(fakeRandom)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("draws from the default secure source", () => {
    expect(createDesktopId()).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("normalizeName", () => {
  it("trims and rejects empty, control characters and over 64 code points", () => {
    expect(normalizeName("  Casa ")).toBe("Casa");
    expect(normalizeName("   ")).toBeNull();
    expect(normalizeName("a\nb")).toBeNull();
    expect(normalizeName("x".repeat(64))).toBe("x".repeat(64));
    expect(normalizeName("x".repeat(65))).toBeNull();
    // 64 astral code points are 128 UTF-16 units but still fit.
    expect(normalizeName("😀".repeat(64))).not.toBeNull();
    expect(normalizeName("😀".repeat(65))).toBeNull();
  });
});

describe("addOrReplaceDesktop", () => {
  it("appends a new desktop with a connected status at the pairing time", () => {
    const list = added([]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      name: "Casa",
      hostKeyB64: KEY_A,
      pairedAt: T0,
      lastStatus: { kind: "connected", at: T0 },
    });
    expect(list[0]?.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("keeps the insertion order", () => {
    const list = added(added([]), { name: "Trabalho", hostKeyB64: KEY_B });
    expect(list.map((d) => d.name)).toEqual(["Casa", "Trabalho"]);
  });

  it("replaces the entry with the same public key, in place and keeping the local id", () => {
    const first = added(added([]), { name: "Trabalho", hostKeyB64: KEY_B });
    const originalId = first[0]?.id;
    const result = addOrReplaceDesktop(
      first,
      input({ name: "Casa nova", relayUrl: "wss://outro.example.com", pairedAt: T1 }),
      fakeRandom,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.replaced).toBe(true);
    expect(result.list).toHaveLength(2);
    expect(result.list.map((d) => d.name)).toEqual(["Casa nova", "Trabalho"]);
    expect(result.list[0]).toMatchObject({
      id: originalId,
      relayUrl: "wss://outro.example.com",
      pairedAt: T1,
      lastStatus: { kind: "connected", at: T1 },
    });
  });

  it("recovers a not-paired desktop when it is paired again", () => {
    const first = added([]);
    const marked = markDesktopStatus(first, first[0]?.id ?? "", "not-paired", T1);
    expect(marked[0]?.lastStatus.kind).toBe("not-paired");
    const again = addOrReplaceDesktop(marked, input({ pairedAt: T1 }), fakeRandom);
    expect(again.ok && again.list[0]?.lastStatus.kind).toBe("connected");
  });

  it("refuses a 21st desktop but still replaces when full", () => {
    let list: readonly Desktop[] = [];
    for (let i = 0; i < MAX_DESKTOPS; i += 1) {
      list = added(list, { hostKeyB64: keyN(i), name: `d${i}` });
    }
    expect(list).toHaveLength(MAX_DESKTOPS);
    expect(addOrReplaceDesktop(list, input({ hostKeyB64: keyN(25) }), fakeRandom)).toEqual({
      ok: false,
      reason: "full",
    });
    const replaced = addOrReplaceDesktop(list, input({ hostKeyB64: keyN(3), name: "novo" }), fakeRandom);
    expect(replaced.ok && replaced.list).toHaveLength(MAX_DESKTOPS);
  });

  it("refuses invalid data", () => {
    expect(addOrReplaceDesktop([], input({ name: " " }), fakeRandom)).toEqual({ ok: false, reason: "invalid" });
    expect(addOrReplaceDesktop([], input({ relayUrl: "https://x" }), fakeRandom)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(addOrReplaceDesktop([], input({ hostKeyB64: "short" }), fakeRandom)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(addOrReplaceDesktop([], input({ hostId: "UPPER" }), fakeRandom)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(addOrReplaceDesktop([], input({ pairedAt: "yesterday" }), fakeRandom)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("rename, remove and mark", () => {
  const base = added(added([]), { name: "Trabalho", hostKeyB64: KEY_B });
  const firstId = base[0]?.id ?? "";
  const secondId = base[1]?.id ?? "";

  it("renames only the target and keeps order", () => {
    const result = renameDesktop(base, secondId, "  Escritório ");
    expect(result.ok && result.list.map((d) => d.name)).toEqual(["Casa", "Escritório"]);
  });

  it("rejects an invalid name and an unknown id", () => {
    expect(renameDesktop(base, firstId, "")).toEqual({ ok: false, reason: "invalid-name" });
    expect(renameDesktop(base, "nope", "x")).toEqual({ ok: false, reason: "not-found" });
  });

  it("removes by id and ignores an unknown id", () => {
    expect(removeDesktop(base, firstId).map((d) => d.name)).toEqual(["Trabalho"]);
    expect(removeDesktop(base, "nope")).toHaveLength(2);
  });

  it("marks the status, with and without an error code", () => {
    const withError = markDesktopStatus(base, firstId, "error", T1, "relay-unreachable");
    expect(withError[0]?.lastStatus).toEqual({ kind: "error", at: T1, errorCode: "relay-unreachable" });
    expect(withError[1]).toBe(base[1]);
    const cleared = markDesktopStatus(withError, firstId, "connecting", T1);
    expect(cleared[0]?.lastStatus).toEqual({ kind: "connecting", at: T1 });
    expect(markDesktopStatus(base, "nope", "offline", T1)).toEqual(base);
  });

  it("does not mutate its input", () => {
    const snapshot = JSON.stringify(base);
    renameDesktop(base, firstId, "x");
    removeDesktop(base, firstId);
    markDesktopStatus(base, firstId, "offline", T1);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe("parseDesktopListFile", () => {
  const good = JSON.parse(serializeDesktopList(added([]))) as {
    schema: number;
    desktops: Record<string, unknown>[];
  };

  function mutated(change: (file: typeof good) => void): unknown {
    const copy = JSON.parse(JSON.stringify(good)) as typeof good;
    change(copy);
    return copy;
  }

  it("accepts a valid file", () => {
    const parsed = parseDesktopListFile(good);
    expect(parsed.ok).toBe(true);
  });

  it("accepts an empty list", () => {
    expect(parseDesktopListFile({ schema: 1, desktops: [] })).toEqual({ ok: true, value: [] });
  });

  it.each<[string, (file: typeof good) => void, string]>([
    ["a wrong schema", (f) => void (f.schema = 2), "schema"],
    ["an unknown top-level key", (f) => void Object.assign(f, { extra: 1 }), "file-shape"],
    ["a bad id", (f) => void (f.desktops[0]!["id"] = "xyz"), "desktop-id"],
    ["an untrimmed name", (f) => void (f.desktops[0]!["name"] = " x"), "desktop-name"],
    ["an http relay", (f) => void (f.desktops[0]!["relayUrl"] = "http://x.com"), "desktop-relay-url"],
    ["a bad host id", (f) => void (f.desktops[0]!["hostId"] = "x"), "desktop-host-id"],
    ["a bad host key", (f) => void (f.desktops[0]!["hostKeyB64"] = "x="), "desktop-host-key"],
    ["a bad pairing date", (f) => void (f.desktops[0]!["pairedAt"] = "2026-13-45T99:00:00Z"), "desktop-paired-at"],
    ["an unknown field", (f) => void (f.desktops[0]!["secret"] = "x"), "desktop-shape"],
    ["a bad status kind", (f) => void ((f.desktops[0]!["lastStatus"] as Record<string, unknown>)["kind"] = "up"), "status-kind"],
    ["a bad status date", (f) => void ((f.desktops[0]!["lastStatus"] as Record<string, unknown>)["at"] = 5), "status-at"],
    ["a bad error code", (f) => void ((f.desktops[0]!["lastStatus"] as Record<string, unknown>)["errorCode"] = "has space"), "status-error-code"],
    ["a duplicated id", (f) => void f.desktops.push({ ...f.desktops[0]!, hostKeyB64: KEY_B }), "duplicate"],
    ["a duplicated key", (f) => void f.desktops.push({ ...f.desktops[0]!, id: "f".repeat(32) }), "duplicate"],
    ["a non-array list", (f) => void Object.assign(f, { desktops: {} }), "file-shape"],
  ])("rejects %s", (_name, change, reason) => {
    expect(parseDesktopListFile(mutated(change))).toEqual({ ok: false, reason });
  });

  it("rejects more than 20 desktops", () => {
    const many = Array.from({ length: MAX_DESKTOPS + 1 }, () => good.desktops[0]);
    expect(parseDesktopListFile({ schema: 1, desktops: many })).toEqual({ ok: false, reason: "too-many" });
  });

  it("rejects non-objects", () => {
    expect(parseDesktopListFile(null).ok).toBe(false);
    expect(parseDesktopListFile([]).ok).toBe(false);
    expect(parseDesktopListFile("x").ok).toBe(false);
  });
});

describe("persistence", () => {
  it("returns an empty list when nothing is stored", async () => {
    const log = jest.fn();
    expect(await loadDesktops(createMemoryStore(), log)).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it("round-trips through the store", async () => {
    const store = createMemoryStore();
    const list = markDesktopStatus(added(added([]), { name: "B", hostKeyB64: KEY_B }), "x", "offline", T1);
    await saveDesktops(store, list);
    expect(await loadDesktops(store)).toEqual(list);
  });

  it("returns an empty list and logs on invalid JSON", async () => {
    const log = jest.fn();
    const store = createMemoryStore({ "desktops.v1": "{oops" });
    expect(await loadDesktops(store, log)).toEqual([]);
    expect(log).toHaveBeenCalledWith("storage_invalid", { item: "desktops.v1", reason: "json" });
  });

  it("returns an empty list and logs on an invalid document, without leaking content", async () => {
    const log = jest.fn();
    const store = createMemoryStore({
      "desktops.v1": JSON.stringify({ schema: 1, desktops: [{ name: "segredo" }] }),
    });
    expect(await loadDesktops(store, log)).toEqual([]);
    expect(log).toHaveBeenCalledWith("storage_invalid", { item: "desktops.v1", reason: "desktop-id" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("segredo");
  });
});

describe("createDesktopRepository", () => {
  it("adds, renames, marks and removes, persisting each step", async () => {
    const store = createMemoryStore();
    const repo = createDesktopRepository(store, { randomBytes: fakeRandom, log: jest.fn() });

    const result = await repo.add(input());
    expect(result.ok).toBe(true);
    const id = result.ok ? result.desktop.id : "";
    expect(await loadDesktops(store)).toHaveLength(1);

    expect((await repo.rename(id, "Novo")).ok).toBe(true);
    await repo.markStatus(id, "offline", T1, "host-unavailable");
    const [desktop] = await repo.list();
    expect(desktop).toMatchObject({
      name: "Novo",
      lastStatus: { kind: "offline", at: T1, errorCode: "host-unavailable" },
    });

    await repo.remove(id);
    expect(await repo.list()).toEqual([]);
  });

  it("serializes concurrent additions without losing any", async () => {
    const repo = createDesktopRepository(createMemoryStore(), { randomBytes: fakeRandom, log: jest.fn() });
    await Promise.all([
      repo.add(input({ hostKeyB64: keyN(0), name: "a" })),
      repo.add(input({ hostKeyB64: keyN(1), name: "b" })),
      repo.add(input({ hostKeyB64: keyN(2), name: "c" })),
    ]);
    expect((await repo.list()).map((d) => d.name)).toEqual(["a", "b", "c"]);
  });

  it("does not write when nothing changes", async () => {
    const store = createMemoryStore();
    const set = jest.spyOn(store, "set");
    const repo = createDesktopRepository(store, { log: jest.fn() });
    await repo.remove("nope");
    await repo.markStatus("nope", "offline", T1);
    expect((await repo.rename("nope", "x")).ok).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it("clear forgets every desktop", async () => {
    const store = createMemoryStore();
    const repo = createDesktopRepository(store, { randomBytes: fakeRandom, log: jest.fn() });
    await repo.add(input());
    await repo.clear();
    expect(await store.get("desktops.v1")).toBeNull();
    expect(await repo.list()).toEqual([]);
  });

  it("keeps working after a failed write", async () => {
    const store = createMemoryStore();
    const realSet = store.set.bind(store);
    let fail = true;
    jest.spyOn(store, "set").mockImplementation((key, value) =>
      fail ? Promise.reject(new Error("disk")) : realSet(key, value),
    );
    const repo = createDesktopRepository(store, { randomBytes: fakeRandom, log: jest.fn() });
    await expect(repo.add(input())).rejects.toThrow("disk");
    fail = false;
    expect((await repo.add(input())).ok).toBe(true);
    expect(await repo.list()).toHaveLength(1);
  });
});
