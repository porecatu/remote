// SPDX-License-Identifier: GPL-3.0-or-later
import {
  type OverlayCloseReason,
  createOverlayController,
  sessionOwner,
  toastPriority,
} from "./overlay";

function controller() {
  return createOverlayController<string>();
}

describe("overlay stack", () => {
  it("pushes entries on top, owned by the app by default", () => {
    const overlays = controller();
    const first = overlays.push({ kind: "sheet", content: "menu" });
    const second = overlays.push({ kind: "dialog", content: "confirm", owner: sessionOwner("d1") });

    expect(first).not.toBe(second);
    expect(overlays.store.getState().entries).toEqual([
      { id: first, kind: "sheet", owner: "app", content: "menu", closing: false },
      { id: second, kind: "dialog", owner: "session:d1", content: "confirm", closing: false },
    ]);
    expect(overlays.top()?.id).toBe(second);
    expect(overlays.hasOpen()).toBe(true);
  });

  it("closes in two steps: closing at once, removed after the exit", () => {
    const overlays = controller();
    const id = overlays.push({ kind: "sheet", content: "menu" });

    expect(overlays.close(id)).toBe(true);
    expect(overlays.store.getState().entries).toEqual([
      { id, kind: "sheet", owner: "app", content: "menu", closing: true },
    ]);
    expect(overlays.hasOpen()).toBe(false);
    expect(overlays.top()).toBeNull();
    expect(overlays.close(id)).toBe(false);

    overlays.remove(id);
    expect(overlays.store.getState().entries).toEqual([]);
  });

  it("runs onClose once, with the reason", () => {
    const overlays = controller();
    const reasons: OverlayCloseReason[] = [];
    const id = overlays.push({ kind: "dialog", content: "x", onClose: (reason) => reasons.push(reason) });

    overlays.close(id, "dismiss");
    overlays.close(id, "action");
    overlays.remove(id);

    expect(reasons).toEqual(["dismiss"]);
  });

  it("remove closes an entry that is still open", () => {
    const overlays = controller();
    const onClose = jest.fn();
    const id = overlays.push({ kind: "sheet", content: "x", onClose });

    overlays.remove(id);

    expect(onClose).toHaveBeenCalledWith("action");
    expect(overlays.store.getState().entries).toEqual([]);
  });

  it("closeTop closes the top open entry, skipping those already closing", () => {
    const overlays = controller();
    const reasons: string[] = [];
    const bottom = overlays.push({ kind: "sheet", content: "a", onClose: (r) => reasons.push(`a:${r}`) });
    const top = overlays.push({ kind: "dialog", content: "b", onClose: (r) => reasons.push(`b:${r}`) });

    expect(overlays.closeTop()?.id).toBe(top);
    expect(overlays.top()?.id).toBe(bottom);
    expect(overlays.closeTop("action")?.id).toBe(bottom);
    expect(overlays.closeTop()).toBeNull();
    expect(reasons).toEqual(["b:dismiss", "a:action"]);
  });

  it("closeOwnedBy closes only the entries of that owner", () => {
    const overlays = controller();
    const reasons: string[] = [];
    const app = overlays.push({ kind: "sheet", content: "app" });
    const d1 = overlays.push({
      kind: "dialog",
      content: "d1",
      owner: sessionOwner("d1"),
      onClose: (reason) => reasons.push(reason),
    });
    const d2 = overlays.push({ kind: "sheet", content: "d2", owner: sessionOwner("d2") });

    expect(overlays.closeOwnedBy(sessionOwner("d1"))).toBe(1);
    expect(overlays.closeOwnedBy(sessionOwner("d1"))).toBe(0);

    const closing = Object.fromEntries(
      overlays.store.getState().entries.map((entry) => [entry.id, entry.closing]),
    );
    expect(closing).toEqual({ [app]: false, [d1]: true, [d2]: false });
    expect(reasons).toEqual(["owner"]);
  });

  it("ignores unknown ids", () => {
    const overlays = controller();
    expect(overlays.close("nope")).toBe(false);
    overlays.remove("nope");
    expect(overlays.store.getState().entries).toEqual([]);
  });
});

describe("snackbars", () => {
  it("ranks the severities", () => {
    expect(toastPriority("error")).toBeGreaterThan(toastPriority("warning"));
    expect(toastPriority("warning")).toBeGreaterThan(toastPriority("info"));
  });

  it("shows one at a time: the next replaces the current", () => {
    const overlays = controller();
    overlays.showToast({ message: "one", durationMs: 6000 });
    const second = overlays.showToast({ message: "two", durationMs: 6000 });

    expect(overlays.store.getState().toast).toEqual({
      id: second,
      message: "two",
      severity: "info",
      durationMs: 6000,
      priority: toastPriority("info"),
    });
    expect(overlays.store.getState().toastQueue).toEqual([]);
  });

  it("a more severe notice replaces a lighter one", () => {
    const overlays = controller();
    overlays.showToast({ message: "info", durationMs: 6000 });
    overlays.showToast({ message: "error", severity: "error", durationMs: 8000 });

    expect(overlays.store.getState().toast?.message).toBe("error");
    expect(overlays.store.getState().toastQueue).toEqual([]);
  });

  it("a lighter notice waits behind a more severe one, the newest of each level", () => {
    const overlays = controller();
    const error = overlays.showToast({ message: "error", severity: "error", durationMs: 8000 });
    overlays.showToast({ message: "info 1", durationMs: 6000 });
    overlays.showToast({ message: "warning", severity: "warning", durationMs: 6000 });
    overlays.showToast({ message: "info 2", durationMs: 6000 });

    const state = overlays.store.getState();
    expect(state.toast?.id).toBe(error);
    expect(state.toastQueue.map((toast) => toast.message)).toEqual(["warning", "info 2"]);
  });

  it("a newer warning drops the waiting info notices below it", () => {
    const overlays = controller();
    overlays.showToast({ message: "error", severity: "error", durationMs: 8000 });
    overlays.showToast({ message: "info", durationMs: 6000 });
    overlays.showToast({ message: "warning", severity: "warning", durationMs: 6000 });

    expect(overlays.store.getState().toastQueue.map((toast) => toast.message)).toEqual(["warning"]);
  });

  it("dismissing the current notice shows the next one waiting", () => {
    const overlays = controller();
    const error = overlays.showToast({ message: "error", severity: "error", durationMs: 8000 });
    overlays.showToast({ message: "info", durationMs: 6000 });

    expect(overlays.dismissToast(error)).toBe(true);
    expect(overlays.store.getState().toast?.message).toBe("info");
    expect(overlays.store.getState().toastQueue).toEqual([]);

    const info = overlays.store.getState().toast?.id ?? "";
    expect(overlays.dismissToast(info)).toBe(true);
    expect(overlays.store.getState().toast).toBeNull();
  });

  it("dismisses a waiting notice and ignores unknown ids", () => {
    const overlays = controller();
    overlays.showToast({ message: "error", severity: "error", durationMs: 8000 });
    const info = overlays.showToast({ message: "info", durationMs: 6000 });

    expect(overlays.dismissToast(info)).toBe(true);
    expect(overlays.store.getState().toastQueue).toEqual([]);
    expect(overlays.dismissToast("nope")).toBe(false);
    expect(overlays.store.getState().toast?.message).toBe("error");
  });

  it("snackbars do not count as open overlays", () => {
    const overlays = controller();
    overlays.showToast({ message: "info", durationMs: 6000 });
    expect(overlays.hasOpen()).toBe(false);
  });
});
