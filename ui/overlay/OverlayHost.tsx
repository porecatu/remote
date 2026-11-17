// SPDX-License-Identifier: GPL-3.0-or-later
// The overlay layer (ADR-0011): draws the stack of sheets and dialogs over the
// navigator and the snackbar over them, in the same native window (never a
// `Modal`, which would sit above the privacy cover). The root mounts it after
// the navigator and before the privacy cover, inside an `OverlayProvider`.
//
// - Every entry fills the screen; the top one is modal for VoiceOver
//   (`accessibilityViewIsModal`) and the ones under it leave the screen reader
//   tree. The content under the layer leaves it too (`OverlayUnderlay`).
// - The Android back button closes the top overlay before the navigator sees
//   it: the layer listens only while an overlay is open, so its listener is
//   the latest and runs first.
// - When an entry is dropped, the screen reader focus returns to the element
//   that opened it (§5 item 2).
import { useCallback, useEffect, useMemo } from "react";
import { AccessibilityInfo, BackHandler, StyleSheet, View } from "react-native";

import type { OverlayEntry } from "@/controllers/overlay";
import { useStoreState } from "@ui/hooks/useStoreState";

import {
  OverlayFrameContext,
  useOverlayController,
  useToastOffsetValue,
  type AppOverlayController,
  type OverlayContent,
  type OverlayFrame,
} from "./OverlayProvider";
import { Toast } from "./Toast";

type EntryViewProps = {
  readonly entry: OverlayEntry<OverlayContent>;
  readonly controller: AppOverlayController;
  /** The top open entry: modal for the screen reader. */
  readonly top: boolean;
};

function EntryView({ entry, controller, top }: EntryViewProps) {
  const { id, closing, content } = entry;
  const origin = content.origin;
  const frame = useMemo<OverlayFrame>(
    () => ({
      id,
      closing,
      close: (reason) => {
        controller.close(id, reason);
      },
      finish: () => {
        controller.remove(id);
      },
    }),
    [controller, id, closing],
  );
  const controls = useMemo(
    () => ({
      id,
      close: () => {
        controller.close(id, "action");
      },
    }),
    [controller, id],
  );

  useEffect(
    () => () => {
      // A sheet that opened another one on its way out (a menu item that opens
      // a form) leaves the focus with the open one: the origin is under it.
      const othersOpen = controller.store.getState().entries.some((other) => other.id !== id && !other.closing);
      const target = origin?.current;
      if (!othersOpen && target !== null && target !== undefined) {
        AccessibilityInfo.sendAccessibilityEvent(target, "focus");
      }
    },
    [controller, id, origin],
  );

  const hidden = !top;
  return (
    <OverlayFrameContext.Provider value={frame}>
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
        accessibilityViewIsModal={top}
        importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
        accessibilityElementsHidden={hidden}
        onAccessibilityEscape={() => {
          controller.close(id, "dismiss");
        }}
        testID={`overlay-${id}`}
      >
        {content.render(controls)}
      </View>
    </OverlayFrameContext.Provider>
  );
}

/** Closes the top overlay on the Android back button while one is open. */
function useBackButton(controller: AppOverlayController, open: boolean) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      return controller.closeTop("dismiss") !== null;
    });
    return () => {
      subscription.remove();
    };
  }, [controller, open]);
}

function withCode(code: string | undefined): { readonly code?: string } {
  return code === undefined ? {} : { code };
}

/** The layer of sheets, dialogs and snackbars, over the navigator. */
export function OverlayHost() {
  const controller = useOverlayController();
  const entries = useStoreState(controller.store, (state) => state.entries);
  const toast = useStoreState(controller.store, (state) => state.toast);
  const offset = useToastOffsetValue();
  const topId = useMemo(() => {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry !== undefined && !entry.closing) {
        return entry.id;
      }
    }
    return null;
  }, [entries]);
  useBackButton(controller, topId !== null);
  const dismissToast = useCallback(
    (id: string) => {
      controller.dismissToast(id);
    },
    [controller],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID="overlay-host">
      {entries.map((entry) => (
        <EntryView key={entry.id} entry={entry} controller={controller} top={entry.id === topId} />
      ))}
      {toast === null ? null : (
        <Toast
          key={toast.id}
          toast={toast}
          {...withCode(controller.toastCode(toast.id))}
          offset={offset}
          onDismiss={dismissToast}
        />
      )}
    </View>
  );
}
