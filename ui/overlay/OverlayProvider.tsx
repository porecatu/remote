// SPDX-License-Identifier: GPL-3.0-or-later
// The overlay store of the app (src/controllers/overlay.ts) handed to the tree
// by context (ADR-0011), and what the root needs around it:
// - `OverlayUnderlay` wraps the navigator: while an overlay is open, its
//   content leaves the screen reader tree (`no-hide-descendants` on Android,
//   `accessibilityElementsHidden` on iOS), so the focus stays in the overlay;
// - `useToastOffset(offset)` lets a screen with a bar at the bottom (the
//   terminal's key bar) lift the snackbar above it while the screen is shown.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { View, type HostInstance, type ViewProps } from "react-native";

import {
  type OverlayCloseReason,
  type OverlayController,
  type ToastInput,
  createOverlayController,
} from "@/controllers/overlay";
import { useStoreState } from "@ui/hooks/useStoreState";

/** The element that opened an overlay: the screen reader focus returns to it on close (§5 item 2). */
export type FocusOrigin = RefObject<HostInstance | null>;

/** What the content of an overlay receives from the layer. */
export type OverlayControls = {
  readonly id: string;
  /** Closes this overlay (reason `action`). */
  readonly close: () => void;
};

/** The content of an overlay entry, as the layer keeps it. */
export type OverlayContent = {
  /** Draws the overlay: a `<Sheet>` for a sheet; `openDialog` draws the `<Dialog>`. */
  readonly render: (controls: OverlayControls) => ReactNode;
  readonly origin?: FocusOrigin;
};

/** A snackbar of the app: its translated text, and the part of it drawn in mono, if any (§4.14). */
export type AppToastInput = ToastInput<string> & {
  /** The protocol code of a failed action, as it appears in the message. */
  readonly code?: string;
};

/**
 * The overlay store of the app, with ready-made (already translated) snackbar
 * messages. A snackbar may carry a code drawn in mono; the store keeps it
 * beside the notice, by id, while the notice is shown or waiting.
 */
export type AppOverlayController = Omit<OverlayController<OverlayContent, string>, "showToast"> & {
  /** Shows (or queues) a snackbar; returns its id. */
  showToast(input: AppToastInput): string;
  /** The code of a snackbar, drawn in mono; undefined when it has none. */
  toastCode(id: string): string | undefined;
};

/** The store of the app's overlays. */
export function createAppOverlayController(): AppOverlayController {
  const base = createOverlayController<OverlayContent, string>();
  const codes = new Map<string, string>();
  return {
    ...base,
    showToast({ code, ...input }) {
      const id = base.showToast(input);
      // Forget the codes of the notices that are gone (replaced or dismissed).
      const { toast, toastQueue } = base.store.getState();
      const kept = new Set([toast?.id, ...toastQueue.map((queued) => queued.id)]);
      for (const known of codes.keys()) {
        if (!kept.has(known)) {
          codes.delete(known);
        }
      }
      if (code !== undefined && kept.has(id)) {
        codes.set(id, code);
      }
      return id;
    },
    toastCode(id) {
      return codes.get(id);
    },
  };
}

type ToastOffsetRegistry = {
  readonly offset: number;
  readonly register: (key: symbol, offset: number) => void;
  readonly unregister: (key: symbol) => void;
};

const ControllerContext = createContext<AppOverlayController | null>(null);
const ToastOffsetContext = createContext<ToastOffsetRegistry | null>(null);

type OverlayProviderProps = {
  /** Default: a new store. Pass one to reach it from outside React (session controllers). */
  readonly controller?: AppOverlayController;
  readonly children: ReactNode;
};

/** Provides the overlay store and the snackbar offset to the tree below. */
export function OverlayProvider({ controller, children }: OverlayProviderProps) {
  const [own] = useState(() => controller ?? createAppOverlayController());
  const value = controller ?? own;
  const [offsets, setOffsets] = useState<readonly { key: symbol; offset: number }[]>([]);
  const register = useCallback((key: symbol, offset: number) => {
    setOffsets((list) => [...list.filter((item) => item.key !== key), { key, offset }]);
  }, []);
  const unregister = useCallback((key: symbol) => {
    setOffsets((list) => list.filter((item) => item.key !== key));
  }, []);
  const registry = useMemo<ToastOffsetRegistry>(
    () => ({ offset: offsets.at(-1)?.offset ?? 0, register, unregister }),
    [offsets, register, unregister],
  );
  return (
    <ControllerContext.Provider value={value}>
      <ToastOffsetContext.Provider value={registry}>{children}</ToastOffsetContext.Provider>
    </ControllerContext.Provider>
  );
}

/** The overlay store; throws outside an `OverlayProvider`. */
export function useOverlayController(): AppOverlayController {
  const controller = useContext(ControllerContext);
  if (controller === null) {
    throw new Error("useOverlayController must be used inside an OverlayProvider");
  }
  return controller;
}

/** Whether an overlay (sheet or dialog) is on screen; snackbars do not count. */
export function useOverlayActive(): boolean {
  const controller = useOverlayController();
  return useStoreState(controller.store, (state) => state.entries.length > 0);
}

/** Accessibility props of the content under the overlays: hidden from the screen reader while one is open. */
export function useUnderlayAccessibilityProps(): Pick<
  ViewProps,
  "importantForAccessibility" | "accessibilityElementsHidden"
> {
  const active = useOverlayActive();
  return active
    ? { importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true }
    : { importantForAccessibility: "auto", accessibilityElementsHidden: false };
}

type OverlayUnderlayProps = {
  readonly children: ReactNode;
  readonly testID?: string;
};

/** The content under the overlay layer (the navigator), hidden from the screen reader while an overlay is open. */
export function OverlayUnderlay({ children, testID }: OverlayUnderlayProps) {
  const a11y = useUnderlayAccessibilityProps();
  return (
    <View style={{ flex: 1 }} {...a11y} {...(testID === undefined ? {} : { testID })}>
      {children}
    </View>
  );
}

/**
 * Lifts the snackbar `offset` points above the bottom safe area while the
 * calling component is mounted (the terminal passes the key bar height). The
 * last component mounted wins.
 */
export function useToastOffset(offset: number): void {
  const registry = useContext(ToastOffsetContext);
  const [key] = useState(() => Symbol("toast-offset"));
  const register = registry?.register;
  const unregister = registry?.unregister;
  useEffect(() => {
    register?.(key, offset);
  }, [register, key, offset]);
  useEffect(
    () => () => {
      unregister?.(key);
    },
    [unregister, key],
  );
}

/** The snackbar offset in effect (0 when no screen asked for one). */
export function useToastOffsetValue(): number {
  return useContext(ToastOffsetContext)?.offset ?? 0;
}

/** Context of one overlay entry, for the `Sheet` and `Dialog` it draws. */
export type OverlayFrame = {
  readonly id: string;
  /** The entry started closing: draw the exit, then call `finish`. */
  readonly closing: boolean;
  readonly close: (reason: OverlayCloseReason) => void;
  /** The exit is drawn: drop the entry. */
  readonly finish: () => void;
};

export const OverlayFrameContext = createContext<OverlayFrame | null>(null);

/** The entry a `Sheet` or `Dialog` belongs to; throws outside the overlay layer. */
export function useOverlayFrame(): OverlayFrame {
  const frame = useContext(OverlayFrameContext);
  if (frame === null) {
    throw new Error("Sheet and Dialog are drawn by the overlay layer: open them with useOverlay()");
  }
  return frame;
}
