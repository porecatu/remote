// SPDX-License-Identifier: GPL-3.0-or-later
// The overlay layer of the app: sheets, dialogs and snackbars (ADR-0011).
export {
  Dialog,
  LiveDialog,
  initialFocusIndex,
  isDestructiveButton,
  type DialogButton,
  type DialogProps,
  type LiveDialogProps,
} from "./Dialog";
export { OverlayHost } from "./OverlayHost";
export {
  OverlayProvider,
  OverlayUnderlay,
  createAppOverlayController,
  useOverlayActive,
  useOverlayController,
  useToastOffset,
  useUnderlayAccessibilityProps,
  type AppOverlayController,
  type AppToastInput,
  type FocusOrigin,
  type OverlayContent,
  type OverlayControls,
} from "./OverlayProvider";
export { Sheet, SheetDivider, SheetItem, type SheetItemProps, type SheetProps } from "./Sheet";
export { Toast, toastMessageParts, type ToastMessageParts, type ToastProps } from "./Toast";
export {
  overlayApi,
  toastDuration,
  useOverlay,
  type DialogDescriptor,
  type DialogOptions,
  type LiveDialogDescriptor,
  type OverlayApi,
  type SheetOptions,
  type ToastOptions,
} from "./useOverlay";
