// SPDX-License-Identifier: GPL-3.0-or-later
// The terminal grid of the terminal screen (PRD-003 RF-3.4 to RF-3.13,
// anatomy §4.6 and §4.7): the Skia canvas, the gestures, the scroll bars, the
// thin history spinner and the minimal accessibility element, over the
// controller of the tab (src/controllers/terminalSession.ts).
//
// React renders this component for layout, theme, font and the few states
// the screen shows (floating buttons, zoom chip); a `grid-diff` never
// re-renders it: the engine (./gridEngine.ts) listens to the controller and
// hands new pictures to the canvas through shared values (ADR-0002 item 1).
// The render is isolated here so it can be swapped without touching the
// screen (decision 1).
import { type SkPicture, type Transforms3d, useTypeface } from "@shopify/react-native-skia";
import { type Ref, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { Theme as GridTheme } from "@/grid/colorMath";
import {
  type ZoomKey,
  type ZoomMemory,
  cellMetrics,
  contentSize,
  createZoomMemory,
  isAtBottom,
  maxScroll,
} from "@/terminal/viewport";

import { Spinner } from "../../components";
import { useT } from "../../i18n/LocaleProvider";
import { duration, monoFontFiles, rgbToCss, roundRadius, size, spacing, useTheme } from "../../theme";
import { GridCanvas } from "./GridCanvas";
import { A11Y_SUMMARY_INTERVAL_MS, gridSummary, useScreenReaderEnabled } from "./gridA11y";
import {
  type GridEngine,
  type GridSession,
  INITIAL_GRID_STATE,
  type TerminalGridState,
  createGridEngine,
} from "./gridEngine";
import { createGridRenderer } from "./gridRenderer";
import { RECORDING_FONT_SIZE } from "./lineRecording";
import { createGridPainter, emptyPicture } from "./skiaPainter";
import { type GridViewValues, useGridGestures } from "./useGridGestures";

export type { GridSession, TerminalGridState } from "./gridEngine";

/**
 * The zoom chosen per tab during the app session (RF-3.9): memory only, shared
 * by every terminal screen unless the screen passes its own.
 */
export const terminalZoomMemory: ZoomMemory = createZoomMemory();

/** What the terminal screen can ask of the grid (its floating buttons, anatomy §4.7). */
export interface TerminalGridHandle {
  /** "Back to the end" (RF-3.12): shows the end of the live grid. */
  scrollToBottom(): void;
  /** "Follow the cursor" (RF-3.8): frames the cursor column and keeps it framed while on. */
  setFollowCursor(on: boolean): void;
  /** "Fit the width" (decision 7): the zoom that fits every column, remembered for the tab. */
  fitWidth(): void;
  getState(): TerminalGridState;
}

export interface TerminalGridProps {
  /** The controller of the tab on screen (fixed for the life of the component: key it by the controller). */
  readonly session: GridSession;
  /** The desktop `theme`; before it arrives the grid shows only `bg.terminal`. */
  readonly theme: GridTheme | null;
  /** Title of the tab, for the accessibility label ("Terminal, {title}"). */
  readonly title: string;
  /** Key of the tab in the zoom memory (RF-3.9); without one the zoom is not remembered. */
  readonly zoomKey?: ZoomKey | null;
  readonly zoomMemory?: ZoomMemory;
  /** A simple tap on the grid (the screen opens the keyboard, RF-3.14). */
  readonly onTap?: () => void;
  /** The states of the floating buttons and the zoom chip changed. */
  readonly onStateChange?: (state: TerminalGridState) => void;
  readonly ref?: Ref<TerminalGridHandle>;
  readonly testID?: string;
}

const noop = (): void => undefined;

interface HostDeps {
  readonly session: GridSession;
  readonly values: GridViewValues;
  readonly frame: SharedValue<SkPicture>;
  readonly cursor: SharedValue<SkPicture>;
  readonly zoomMemory: ZoomMemory;
  readonly setGridState: (state: TerminalGridState) => void;
  readonly setSummary: (summary: string) => void;
}

interface HostConfig {
  readonly onStateChange: ((state: TerminalGridState) => void) | undefined;
  readonly screenReader: boolean;
  readonly zoomKey: ZoomKey | null;
}

/**
 * The engine plus what the component feeds it after each render (the latest
 * props) and the throttle of the accessibility summary: only with a screen
 * reader on, at most every 2 s (anatomy §4.7).
 */
function createGridHost(deps: HostDeps) {
  let config: HostConfig = { onStateChange: undefined, screenReader: false, zoomKey: null };
  let summaryAt = 0;
  let summaryTimer: ReturnType<typeof setTimeout> | null = null;

  const refreshSummary = (): void => {
    summaryAt = Date.now();
    deps.setSummary(gridSummary(deps.session.grid()));
  };

  const engine: GridEngine<SkPicture> = createGridEngine<SkPicture>({
    session: deps.session,
    values: deps.values,
    frame: deps.frame,
    cursor: deps.cursor,
    zoomMemory: deps.zoomMemory,
    zoomKey: () => config.zoomKey,
    zoomChipMs: duration.zoomChip,
    publish: (state) => {
      deps.setGridState(state);
      config.onStateChange?.(state);
    },
    onContentChange: () => {
      if (!config.screenReader || summaryTimer !== null) {
        return;
      }
      const wait = summaryAt + A11Y_SUMMARY_INTERVAL_MS - Date.now();
      if (wait <= 0) {
        refreshSummary();
        return;
      }
      summaryTimer = setTimeout(() => {
        summaryTimer = null;
        refreshSummary();
      }, wait);
    },
  });

  return {
    engine,
    configure(next: HostConfig): void {
      const turnedOn = next.screenReader && !config.screenReader;
      config = next;
      if (turnedOn) {
        refreshSummary();
      }
    },
    start(): void {
      engine.start();
    },
    dispose(): void {
      engine.dispose();
      if (summaryTimer !== null) {
        clearTimeout(summaryTimer);
        summaryTimer = null;
      }
    },
  };
}

export function TerminalGrid({
  session,
  theme,
  title,
  zoomKey = null,
  zoomMemory = terminalZoomMemory,
  onTap = noop,
  onStateChange,
  ref,
  testID = "terminal-grid",
}: TerminalGridProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const screenReader = useScreenReaderEnabled();
  const regular = useTypeface(monoFontFiles[400]);
  const medium = useTypeface(monoFontFiles[500]);

  // ------------------------------------------------------------ shared view state

  const fontSize = useSharedValue(0);
  const scrollX = useSharedValue(0);
  const scrollTop = useSharedValue(0);
  const viewWidth = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const paddingTop = useSharedValue<number>(size.gridPaddingTop);
  const cols = useSharedValue(0);
  const liveRows = useSharedValue(0);
  const historyRows = useSharedValue(0);
  const following = useSharedValue(false);
  const [blank] = useState(emptyPicture);
  const frame = useSharedValue<SkPicture>(blank);
  const cursor = useSharedValue<SkPicture>(blank);

  const values: GridViewValues = {
    fontSize,
    scrollX,
    scrollTop,
    viewWidth,
    viewHeight,
    paddingTop,
    cols,
    liveRows,
    historyRows,
    following,
  };

  const transform = useDerivedValue<Transforms3d>(() => [
    { translateX: -scrollX.value },
    { translateY: paddingTop.value - scrollTop.value },
    { scale: fontSize.value / RECORDING_FONT_SIZE },
  ]);

  // ------------------------------------------------------------ engine

  const [gridState, setGridState] = useState<TerminalGridState>(INITIAL_GRID_STATE);
  const [summary, setSummary] = useState("");
  const [host] = useState(() =>
    createGridHost({ session, values, frame, cursor, zoomMemory, setGridState, setSummary }),
  );
  const engine = host.engine;
  // Worklets capture this one function, never the engine object.
  const viewChanged = engine.viewChanged;
  useEffect(() => {
    host.configure({ onStateChange, screenReader, zoomKey });
  });
  useEffect(() => {
    host.start();
    return () => {
      host.dispose();
    };
  }, [host]);

  // A new font or theme: a new renderer, and every line is recorded again.
  const renderer = useMemo(
    () => (theme === null ? null : createGridRenderer(createGridPainter({ regular, medium }), theme)),
    [regular, medium, theme],
  );
  useEffect(() => {
    engine.setRenderer(renderer);
    return () => {
      renderer?.dispose();
    };
  }, [engine, renderer]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom: () => engine.scrollToBottom(),
      setFollowCursor: (on: boolean) => engine.setFollowCursor(on),
      fitWidth: () => engine.fitWidth(),
      getState: () => engine.getState(),
    }),
    [engine],
  );

  // ------------------------------------------------------------ UI thread → JS

  // The view crossed a row (scroll or zoom): compose, prefetch and publish on the JS thread.
  useAnimatedReaction(
    () => {
      const lh = cellMetrics(fontSize.value).lineHeight;
      const content = contentSize(cols.value, liveRows.value, historyRows.value, fontSize.value);
      return {
        row: lh > 0 ? Math.floor(scrollTop.value / lh) : -1,
        bottom: isAtBottom(scrollTop.value, content.height, viewHeight.value),
        font: fontSize.value,
      };
    },
    (current, previous) => {
      if (
        previous !== null &&
        (current.row !== previous.row || current.bottom !== previous.bottom || current.font !== previous.font)
      ) {
        scheduleOnRN(viewChanged, {
          fontSize: current.font,
          scrollX: scrollX.value,
          scrollTop: scrollTop.value,
        });
      }
    },
  );

  const gesture = useGridGestures(values, {
    onTap,
    onZoom: (percent, ui) => engine.zoomed(percent, ui),
    onSettle: (kind, ui) => engine.settled(kind, ui),
    onFollowStopped: () => engine.followStopped(),
  });

  // ------------------------------------------------------------ scroll bars

  const verticalThumb = useAnimatedStyle(() => {
    const content = contentSize(cols.value, liveRows.value, historyRows.value, fontSize.value);
    const limit = maxScroll(content, { width: viewWidth.value, height: viewHeight.value }).scrollTop;
    const track = Math.max(0, viewHeight.value + paddingTop.value - 2 * spacing.scrollbarInset);
    if (!(limit > 0) || !(content.height > 0)) {
      return { opacity: 0, height: 0, transform: [{ translateY: 0 }] };
    }
    const length = Math.max(size.scrollbarWidth, (track * viewHeight.value) / content.height);
    return { opacity: 1, height: length, transform: [{ translateY: ((track - length) * scrollTop.value) / limit }] };
  });

  const horizontalThumb = useAnimatedStyle(() => {
    const content = contentSize(cols.value, liveRows.value, historyRows.value, fontSize.value);
    const limit = maxScroll(content, { width: viewWidth.value, height: viewHeight.value }).scrollX;
    const track = Math.max(0, viewWidth.value - 2 * spacing.scrollbarInset);
    if (!(limit > 0) || !(content.width > 0)) {
      return { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
    }
    const length = Math.max(size.scrollbarWidth, (track * viewWidth.value) / content.width);
    return { opacity: 1, width: length, transform: [{ translateX: ((track - length) * scrollX.value) / limit }] };
  });

  const verticalTrack = useAnimatedStyle(() => {
    const content = contentSize(cols.value, liveRows.value, historyRows.value, fontSize.value);
    return { opacity: content.height > viewHeight.value ? 1 : 0 };
  });

  const horizontalTrack = useAnimatedStyle(() => {
    const content = contentSize(cols.value, liveRows.value, historyRows.value, fontSize.value);
    return { opacity: content.width > viewWidth.value ? 1 : 0 };
  });

  // ------------------------------------------------------------ layout

  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    engine.setViewport(width, Math.max(0, height - size.gridPaddingTop));
  };

  const background = theme === null ? colors.bgTerminal : rgbToCss(theme.bg);
  const radius = roundRadius(size.scrollbarWidth);

  return (
    <View
      testID={testID}
      style={[styles.root, { backgroundColor: background }]}
      onLayout={onLayout}
      accessible
      accessibilityLabel={t("terminal.grid", { title })}
      {...(screenReader ? { accessibilityValue: { text: summary } } : {})}
      onAccessibilityTap={onTap}
    >
      <GestureDetector gesture={gesture}>
        <Animated.View style={StyleSheet.absoluteFill} testID={`${testID}-surface`}>
          <GridCanvas
            frame={frame}
            cursor={cursor}
            transform={transform}
            background={background}
            style={StyleSheet.absoluteFill}
            testID={`${testID}-canvas`}
          />
        </Animated.View>
      </GestureDetector>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.verticalTrack,
          {
            top: spacing.scrollbarInset,
            bottom: spacing.scrollbarInset,
            right: spacing.scrollbarInset,
            width: size.scrollbarWidth,
            borderRadius: radius,
            backgroundColor: colors.scrollbarTrack,
          },
          verticalTrack,
        ]}
      >
        <Animated.View
          style={[{ width: size.scrollbarWidth, borderRadius: radius, backgroundColor: colors.scrollbarThumb }, verticalThumb]}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.horizontalTrack,
          {
            left: spacing.scrollbarInset,
            right: spacing.scrollbarInset,
            bottom: spacing.scrollbarInset,
            height: size.scrollbarWidth,
            borderRadius: radius,
            backgroundColor: colors.scrollbarTrack,
          },
          horizontalTrack,
        ]}
      >
        <Animated.View
          style={[{ height: size.scrollbarWidth, borderRadius: radius, backgroundColor: colors.scrollbarThumb }, horizontalThumb]}
        />
      </Animated.View>
      {gridState.loadingHistory ? (
        <View pointerEvents="none" style={[styles.spinnerRow, { top: size.gridPaddingTop }]}>
          <Spinner accessibilityLabel={t("terminal.loading_history")} testID={`${testID}-history-spinner`} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  verticalTrack: { position: "absolute" },
  horizontalTrack: { position: "absolute" },
  spinnerRow: { position: "absolute", left: 0, right: 0, alignItems: "center" },
});
