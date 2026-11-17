// SPDX-License-Identifier: GPL-3.0-or-later
// The gestures of the grid (anatomy §4.7, ADR-0010), recognized and applied
// on the UI thread: they move shared values the canvas reads, never waiting
// for the JS thread that decodes diffs.
// - Pinch: zoom between "fit the width" and 24 pt (RF-3.7), around the
//   fingers; the percentage goes to the JS thread for the zoom chip.
// - One-finger drag: scroll, with the axis lock (8 pt decide, diagonal past
//   24 pt on both); vertical is the history (RF-3.11), or the grid itself on
//   the alternate screen when it is taller than the view (RF-3.13: there is no
//   history row then). A horizontal move stops "follow the cursor".
// - Tap: `onTap` (the screen opens the keyboard). No double tap: it would
//   delay the tap (anatomy §4.7); no long press in v1.
// The math is src/terminal/viewport.ts; only its standalone worklet functions
// are called here.
import { useCallback, useEffect, useRef } from "react";
import {
  useCompetingGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from "react-native-gesture-handler";
import { ReduceMotion, type SharedValue, cancelAnimation, useSharedValue, withDecay } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import {
  type DragAxis,
  axisLockMove,
  axisLockStart,
  bottomScrollTop,
  clampFontSize,
  clampScroll,
  contentSize,
  isAtBottom,
  lockedDelta,
  maxScroll,
  zoomPercent,
} from "@/terminal/viewport";

import type { UiView } from "./gridEngine";

/** The view state the gestures move, shared with the canvas and the grid. */
export interface GridViewValues {
  /** Font size in points (the zoom). */
  readonly fontSize: SharedValue<number>;
  readonly scrollX: SharedValue<number>;
  readonly scrollTop: SharedValue<number>;
  /** The viewport the content scrolls in, in points. */
  readonly viewWidth: SharedValue<number>;
  readonly viewHeight: SharedValue<number>;
  /** Top inset of the content in the view (`grid.padding-top`). */
  readonly paddingTop: SharedValue<number>;
  readonly cols: SharedValue<number>;
  readonly liveRows: SharedValue<number>;
  /** History rows in the content (0 on the alternate screen). */
  readonly historyRows: SharedValue<number>;
  /** "Follow the cursor" is on. */
  readonly following: SharedValue<boolean>;
}

export interface GridGestureCallbacks {
  /** A simple tap on the grid. */
  readonly onTap: () => void;
  /** The pinch changed the zoom percentage (100 = fit). */
  readonly onZoom: (percent: number, ui: UiView) => void;
  /** A drag or a pinch ended (with its momentum still running, for a drag). */
  readonly onSettle: (gesture: "pan" | "pinch", ui: UiView) => void;
  /** A horizontal drag turned "follow the cursor" off. */
  readonly onFollowStopped: () => void;
}

/** `testID`s of the gestures, for `getByGestureTestId` in tests. */
export const GRID_GESTURE_IDS = {
  tap: "terminal-grid-tap",
  pan: "terminal-grid-pan",
  pinch: "terminal-grid-pinch",
} as const;

/** Keeps the latest callbacks behind stable functions the worklets can schedule. */
function useStableCallbacks(callbacks: GridGestureCallbacks): GridGestureCallbacks {
  const ref = useRef(callbacks);
  useEffect(() => {
    ref.current = callbacks;
  });
  const onTap = useCallback(() => ref.current.onTap(), []);
  const onZoom = useCallback((percent: number, ui: UiView) => ref.current.onZoom(percent, ui), []);
  const onSettle = useCallback((gesture: "pan" | "pinch", ui: UiView) => ref.current.onSettle(gesture, ui), []);
  const onFollowStopped = useCallback(() => ref.current.onFollowStopped(), []);
  return { onTap, onZoom, onSettle, onFollowStopped };
}

/** The composed gesture of the grid: a tap races the drag and the pinch, which run together. */
export function useGridGestures(values: GridViewValues, callbacks: GridGestureCallbacks) {
  const { onTap, onZoom, onSettle, onFollowStopped } = useStableCallbacks(callbacks);
  const { fontSize, scrollX, scrollTop, viewWidth, viewHeight, paddingTop, cols, liveRows, historyRows, following } =
    values;

  const axis = useSharedValue<DragAxis>("none");
  const pinchStartFont = useSharedValue(0);
  const pinchAtBottom = useSharedValue(false);
  const pinchPercent = useSharedValue(0);

  const tap = useTapGesture({
    testID: GRID_GESTURE_IDS.tap,
    onActivate: () => {
      "worklet";
      scheduleOnRN(onTap);
    },
  });

  const pan = usePanGesture({
    testID: GRID_GESTURE_IDS.pan,
    maxPointers: 1,
    onBegin: () => {
      "worklet";
      axis.value = axisLockStart().axis;
      cancelAnimation(scrollX);
      cancelAnimation(scrollTop);
    },
    onUpdate: (event) => {
      "worklet";
      const next = axisLockMove({ axis: axis.value }, event.translationX, event.translationY);
      axis.value = next.axis;
      const delta = lockedDelta(next.axis, event.changeX, event.changeY);
      if (delta.dx !== 0 && following.value) {
        following.set(false);
        scheduleOnRN(onFollowStopped);
      }
      const content = contentSize(cols.value, liveRows.value, historyRows.value, fontSize.value);
      const view = { width: viewWidth.value, height: viewHeight.value };
      const scroll = clampScroll(
        { scrollX: scrollX.value - delta.dx, scrollTop: scrollTop.value - delta.dy },
        content,
        view,
      );
      scrollX.set(scroll.scrollX);
      scrollTop.set(scroll.scrollTop);
    },
    onDeactivate: (event) => {
      "worklet";
      const content = contentSize(cols.value, liveRows.value, historyRows.value, fontSize.value);
      const limit = maxScroll(content, { width: viewWidth.value, height: viewHeight.value });
      const velocity = lockedDelta(axis.value, event.velocityX, event.velocityY);
      // Momentum continues the finger's own movement; it is not a transition.
      if (velocity.dx !== 0 && limit.scrollX > 0) {
        scrollX.set(withDecay({ velocity: -velocity.dx, clamp: [0, limit.scrollX], reduceMotion: ReduceMotion.Never }));
      }
      if (velocity.dy !== 0 && limit.scrollTop > 0) {
        scrollTop.set(
          withDecay({ velocity: -velocity.dy, clamp: [0, limit.scrollTop], reduceMotion: ReduceMotion.Never }),
        );
      }
    },
    onFinalize: () => {
      "worklet";
      axis.value = "none";
      scheduleOnRN(onSettle, "pan", { fontSize: fontSize.value, scrollX: scrollX.value, scrollTop: scrollTop.value });
    },
  });

  const pinch = usePinchGesture({
    testID: GRID_GESTURE_IDS.pinch,
    onBegin: () => {
      "worklet";
      pinchStartFont.value = fontSize.value;
      const content = contentSize(cols.value, liveRows.value, historyRows.value, fontSize.value);
      pinchAtBottom.value = isAtBottom(scrollTop.value, content.height, viewHeight.value);
      pinchPercent.value = 0;
      cancelAnimation(scrollX);
      cancelAnimation(scrollTop);
    },
    onUpdate: (event) => {
      "worklet";
      const previous = fontSize.value;
      const next = clampFontSize(pinchStartFont.value * event.scale, cols.value, viewWidth.value);
      if (!(previous > 0) || !(next > 0)) {
        return;
      }
      const ratio = next / previous;
      const focalY = event.focalY - paddingTop.value;
      fontSize.set(next);
      const content = contentSize(cols.value, liveRows.value, historyRows.value, next);
      const view = { width: viewWidth.value, height: viewHeight.value };
      const anchoredTop = pinchAtBottom.value
        ? bottomScrollTop(content.height, view.height)
        : (scrollTop.value + focalY) * ratio - focalY;
      const scroll = clampScroll(
        { scrollX: (scrollX.value + event.focalX) * ratio - event.focalX, scrollTop: anchoredTop },
        content,
        view,
      );
      scrollX.set(scroll.scrollX);
      scrollTop.set(scroll.scrollTop);
      const percent = zoomPercent(next, cols.value, viewWidth.value);
      if (percent !== pinchPercent.value) {
        pinchPercent.value = percent;
        scheduleOnRN(onZoom, percent, { fontSize: next, scrollX: scroll.scrollX, scrollTop: scroll.scrollTop });
      }
    },
    onFinalize: () => {
      "worklet";
      // A touch that never changed the zoom is not a pinch to settle.
      if (pinchPercent.value !== 0) {
        scheduleOnRN(onSettle, "pinch", {
          fontSize: fontSize.value,
          scrollX: scrollX.value,
          scrollTop: scrollTop.value,
        });
      }
    },
  });

  const scrollAndZoom = useSimultaneousGestures(pinch, pan);
  return useCompetingGestures(scrollAndZoom, tap);
}
