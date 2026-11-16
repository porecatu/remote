// SPDX-License-Identifier: GPL-3.0-or-later
import { logEvent } from "../log";
import type { SecureStore } from "./secureStore";

// The paired-desktop list: item `desktops.v1` of the secure store (ADR-0003).
// Pure operations over an immutable list, strict validation on read, and a
// small repository that serializes read-modify-write cycles.

export const MAX_DESKTOPS = 20;
export const MAX_NAME_LENGTH = 64;

export type DesktopStatusKind = "connected" | "offline" | "connecting" | "error" | "not-paired";

export interface DesktopStatus {
  readonly kind: DesktopStatusKind;
  /** ISO 8601 UTC instant of the last connection attempt. */
  readonly at: string;
  readonly errorCode?: string;
}

export interface Desktop {
  /** Local random id; never leaves the device. */
  readonly id: string;
  readonly name: string;
  readonly relayUrl: string;
  readonly hostId: string;
  /** Desktop static public key, base64url without padding (43 characters). */
  readonly hostKeyB64: string;
  /** ISO 8601 UTC instant of the pairing. */
  readonly pairedAt: string;
  readonly lastStatus: DesktopStatus;
}

export type DesktopList = readonly Desktop[];

interface DesktopListFile {
  readonly schema: 1;
  readonly desktops: DesktopList;
}

// ---------------------------------------------------------------- validation

const STATUS_KINDS: readonly string[] = ["connected", "offline", "connecting", "error", "not-paired"];
const ID_RE = /^[0-9a-f]{32}$/;
const HOST_ID_RE = /^[a-z2-7]{32}$/; // base32 (no padding, lowercase) of 20 bytes, spec 01 §3
const HOST_KEY_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes in base64url, spec 02 §3.1
const RELAY_URL_RE = /^wss?:\/\/[^\s/?#]+[^\s]*$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
const ERROR_CODE_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_URL_LENGTH = 2048;

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function isValidIso(value: unknown): value is string {
  return typeof value === "string" && ISO_RE.test(value) && !Number.isNaN(Date.parse(value));
}

/** Names are 1 to 64 code points after trimming, with no control characters. */
export function normalizeName(name: string): string | null {
  const trimmed = name.trim();
  const length = Array.from(trimmed).length;
  if (length === 0 || length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function parseStatus(raw: unknown): ValidationResult<DesktopStatus> {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ["kind", "at", "errorCode"])) {
    return fail("status-shape");
  }
  const { kind, at, errorCode } = raw;
  if (typeof kind !== "string" || !STATUS_KINDS.includes(kind)) {
    return fail("status-kind");
  }
  if (!isValidIso(at)) {
    return fail("status-at");
  }
  if (errorCode === undefined) {
    return { ok: true, value: { kind: kind as DesktopStatusKind, at } };
  }
  if (typeof errorCode !== "string" || !ERROR_CODE_RE.test(errorCode)) {
    return fail("status-error-code");
  }
  return { ok: true, value: { kind: kind as DesktopStatusKind, at, errorCode } };
}

function parseDesktop(raw: unknown): ValidationResult<Desktop> {
  if (
    !isRecord(raw) ||
    !hasOnlyKeys(raw, ["id", "name", "relayUrl", "hostId", "hostKeyB64", "pairedAt", "lastStatus"])
  ) {
    return fail("desktop-shape");
  }
  const { id, name, relayUrl, hostId, hostKeyB64, pairedAt, lastStatus } = raw;
  if (typeof id !== "string" || !ID_RE.test(id)) {
    return fail("desktop-id");
  }
  if (typeof name !== "string" || normalizeName(name) !== name) {
    return fail("desktop-name");
  }
  if (typeof relayUrl !== "string" || relayUrl.length > MAX_URL_LENGTH || !RELAY_URL_RE.test(relayUrl)) {
    return fail("desktop-relay-url");
  }
  if (typeof hostId !== "string" || !HOST_ID_RE.test(hostId)) {
    return fail("desktop-host-id");
  }
  if (typeof hostKeyB64 !== "string" || !HOST_KEY_RE.test(hostKeyB64)) {
    return fail("desktop-host-key");
  }
  if (!isValidIso(pairedAt)) {
    return fail("desktop-paired-at");
  }
  const status = parseStatus(lastStatus);
  if (!status.ok) {
    return status;
  }
  return {
    ok: true,
    value: { id, name, relayUrl, hostId, hostKeyB64, pairedAt, lastStatus: status.value },
  };
}

/** Validates a parsed `desktops.v1` document. Any deviation rejects the whole file. */
export function parseDesktopListFile(raw: unknown): ValidationResult<DesktopList> {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ["schema", "desktops"])) {
    return fail("file-shape");
  }
  if (raw["schema"] !== 1) {
    return fail("schema");
  }
  const items = raw["desktops"];
  if (!Array.isArray(items)) {
    return fail("file-shape");
  }
  if (items.length > MAX_DESKTOPS) {
    return fail("too-many");
  }
  const list: Desktop[] = [];
  for (const item of items as unknown[]) {
    const parsed = parseDesktop(item);
    if (!parsed.ok) {
      return parsed;
    }
    list.push(parsed.value);
  }
  const ids = new Set(list.map((d) => d.id));
  const keys = new Set(list.map((d) => d.hostKeyB64));
  if (ids.size !== list.length || keys.size !== list.length) {
    return fail("duplicate");
  }
  return { ok: true, value: list };
}

export function serializeDesktopList(list: DesktopList): string {
  const file: DesktopListFile = { schema: 1, desktops: list };
  return JSON.stringify(file);
}

// ---------------------------------------------------------------- pure operations

export type RandomBytes = (length: number) => Uint8Array;

function defaultRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** A fresh local id: 16 random bytes in lowercase hex. */
export function createDesktopId(randomBytes: RandomBytes = defaultRandomBytes): string {
  return Array.from(randomBytes(16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface NewDesktop {
  readonly name: string;
  readonly relayUrl: string;
  readonly hostId: string;
  readonly hostKeyB64: string;
  readonly pairedAt: string;
}

export type AddResult =
  | { readonly ok: true; readonly list: DesktopList; readonly desktop: Desktop; readonly replaced: boolean }
  | { readonly ok: false; readonly reason: "full" | "invalid" };

/**
 * Adds a freshly paired desktop. A desktop already in the list (same public
 * key) is replaced in place, keeping its local id, without duplicating
 * (PRD-001 RF-1.11). The status of a new pairing is "connected" at `pairedAt`.
 */
export function addOrReplaceDesktop(
  list: DesktopList,
  input: NewDesktop,
  randomBytes: RandomBytes = defaultRandomBytes,
): AddResult {
  const name = normalizeName(input.name);
  if (name === null) {
    return { ok: false, reason: "invalid" };
  }
  const existing = list.find((d) => d.hostKeyB64 === input.hostKeyB64);
  if (existing === undefined && list.length >= MAX_DESKTOPS) {
    return { ok: false, reason: "full" };
  }
  const desktop: Desktop = {
    id: existing?.id ?? createDesktopId(randomBytes),
    name,
    relayUrl: input.relayUrl,
    hostId: input.hostId,
    hostKeyB64: input.hostKeyB64,
    pairedAt: input.pairedAt,
    lastStatus: { kind: "connected", at: input.pairedAt },
  };
  const candidate = parseDesktop(desktop);
  if (!candidate.ok) {
    return { ok: false, reason: "invalid" };
  }
  if (existing === undefined) {
    return { ok: true, list: [...list, desktop], desktop, replaced: false };
  }
  return {
    ok: true,
    list: list.map((d) => (d.id === existing.id ? desktop : d)),
    desktop,
    replaced: true,
  };
}

export type RenameResult =
  | { readonly ok: true; readonly list: DesktopList }
  | { readonly ok: false; readonly reason: "not-found" | "invalid-name" };

export function renameDesktop(list: DesktopList, id: string, name: string): RenameResult {
  const normalized = normalizeName(name);
  if (normalized === null) {
    return { ok: false, reason: "invalid-name" };
  }
  if (!list.some((d) => d.id === id)) {
    return { ok: false, reason: "not-found" };
  }
  return { ok: true, list: list.map((d) => (d.id === id ? { ...d, name: normalized } : d)) };
}

/** Removes a desktop; an unknown id leaves the list as it is. */
export function removeDesktop(list: DesktopList, id: string): DesktopList {
  return list.filter((d) => d.id !== id);
}

/**
 * Records the outcome of the last connection attempt. `errorCode` is kept only
 * when given; an unknown id leaves the list as it is.
 */
export function markDesktopStatus(
  list: DesktopList,
  id: string,
  kind: DesktopStatusKind,
  at: string,
  errorCode?: string,
): DesktopList {
  const lastStatus: DesktopStatus = errorCode === undefined ? { kind, at } : { kind, at, errorCode };
  return list.map((d) => (d.id === id ? { ...d, lastStatus } : d));
}

// ---------------------------------------------------------------- persistence

/** Loads the list. A missing item is an empty list; an invalid one is an empty list plus a log event. */
export async function loadDesktops(
  store: SecureStore,
  log: typeof logEvent = logEvent,
): Promise<DesktopList> {
  const text = await store.get("desktops.v1");
  if (text === null) {
    return [];
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    log("storage_invalid", { item: "desktops.v1", reason: "json" });
    return [];
  }
  const parsed = parseDesktopListFile(raw);
  if (!parsed.ok) {
    log("storage_invalid", { item: "desktops.v1", reason: parsed.reason });
    return [];
  }
  return parsed.value;
}

export async function saveDesktops(store: SecureStore, list: DesktopList): Promise<void> {
  await store.set("desktops.v1", serializeDesktopList(list));
}

export interface DesktopRepository {
  list(): Promise<DesktopList>;
  add(input: NewDesktop): Promise<AddResult>;
  rename(id: string, name: string): Promise<RenameResult>;
  remove(id: string): Promise<void>;
  markStatus(id: string, kind: DesktopStatusKind, at: string, errorCode?: string): Promise<void>;
  /** Forgets every desktop (recreating the device identity, PRD-001 RF-1.3). */
  clear(): Promise<void>;
}

export interface RepositoryDeps {
  readonly log?: typeof logEvent;
  readonly randomBytes?: RandomBytes;
}

/** Repository over the store; read-modify-write cycles run one at a time. */
export function createDesktopRepository(
  store: SecureStore,
  deps: RepositoryDeps = {},
): DesktopRepository {
  const log = deps.log ?? logEvent;
  let tail: Promise<unknown> = Promise.resolve();

  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  }

  async function update<T>(change: (list: DesktopList) => { list: DesktopList; result: T }): Promise<T> {
    return exclusive(async () => {
      const current = await loadDesktops(store, log);
      const { list, result } = change(current);
      if (list !== current) {
        await saveDesktops(store, list);
      }
      return result;
    });
  }

  return {
    list: () => exclusive(() => loadDesktops(store, log)),
    add: (input) =>
      update((current) => {
        const result = addOrReplaceDesktop(current, input, deps.randomBytes);
        return { list: result.ok ? result.list : current, result };
      }),
    rename: (id, name) =>
      update((current) => {
        const result = renameDesktop(current, id, name);
        return { list: result.ok ? result.list : current, result };
      }),
    remove: (id) =>
      update((current) => {
        const list = removeDesktop(current, id);
        return { list: list.length === current.length ? current : list, result: undefined };
      }),
    markStatus: (id, kind, at, errorCode) =>
      update((current) => {
        const known = current.some((d) => d.id === id);
        return {
          list: known ? markDesktopStatus(current, id, kind, at, errorCode) : current,
          result: undefined,
        };
      }),
    clear: () => exclusive(() => store.delete("desktops.v1")),
  };
}
