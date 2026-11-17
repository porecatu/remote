// SPDX-License-Identifier: GPL-3.0-or-later
// The special-keys bar of the terminal (anatomy §4.8, PRD-003 RF-3.15,
// RF-3.16, RF-3.17, RF-3.19): one row, 52 high, `bg.bar` with a `border.row`
// on top, keys of 44 with a margin of 4 and a gap of 6.
//
// - `Esc`, `Tab`, `Ctrl`, `Alt` stay on the left, always visible.
// - The rest scrolls: the arrows (they repeat while held), then `Home`, `End`,
//   `PgUp`, `PgDn`, `Fn` and `Paste`, with a fade on the right edge while
//   there is more to the right. The arrows scroll too: eight keys of 44 plus
//   their gaps do not fit a phone in portrait next to the scrolling part.
// - `Fn` swaps the scrolling group for `F1`…`F12`, behind an `x` key that
//   goes back.
//
// The bar sends nothing itself: keys go to `onKey` (the terminal controller
// adds the armed modifiers), `Ctrl`/`Alt` to `onModifier`, and `Paste` to
// `onPaste`. `Fn` and "close F" only change the bar. Every touch on a key
// gives a light haptic tick when the vibration setting is on (the same setting
// as the bell). The screen shows the bar only while the system keyboard is
// open, stuck to it.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ScrollView,
  type ScrollViewInstance,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import type { TerminalModifiers } from "@/controllers/terminalSession";
import type { MessageKey } from "@/i18n/catalog";
import { FUNCTION_KEYS, type KeyBarKeyId, type KeyBarModifierId } from "@/input/keyBar";
import type { ModifierState } from "@/input/modifiers";

import type { IconName } from "../components/Icon";
import { useStoreState } from "../hooks/useStoreState";
import { useT } from "../i18n/LocaleProvider";
import { useServices } from "../services/ServicesContext";
import { size, spacing, useTheme } from "../theme";
import { KeyBarKey } from "./KeyBarKey";
import { useKeyRepeat } from "./useKeyRepeat";

export type KeyBarProps = {
  /** State of `Ctrl` and `Alt` (the terminal controller's `modifiers`). */
  readonly modifiers: TerminalModifiers;
  /** A key that sends a named key (`Esc`, `Tab`, arrows, navigation, `F1`–`F12`); arrows repeat. */
  readonly onKey: (id: KeyBarKeyId) => void;
  /** A tap on `Ctrl` or `Alt`. */
  readonly onModifier: (modifier: KeyBarModifierId) => void;
  /** The `Paste` key (`clipboard-paste`). */
  readonly onPaste: () => void;
  readonly testID?: string;
};

type ArrowId = "left" | "down" | "up" | "right";
type NavigationId = "home" | "end" | "pgup" | "pgdn";
type FunctionId = (typeof FUNCTION_KEYS)[number];

/** §4.8 order of the arrows: ← ↓ ↑ →. */
const ARROWS: readonly { readonly id: ArrowId; readonly icon: IconName; readonly a11y: MessageKey }[] = [
  { id: "left", icon: "arrow-left", a11y: "keybar.a11y.left" },
  { id: "down", icon: "arrow-down", a11y: "keybar.a11y.down" },
  { id: "up", icon: "arrow-up", a11y: "keybar.a11y.up" },
  { id: "right", icon: "arrow-right", a11y: "keybar.a11y.right" },
];

const NAVIGATION: readonly { readonly id: NavigationId; readonly label: MessageKey; readonly a11y: MessageKey }[] = [
  { id: "home", label: "keybar.label.home", a11y: "keybar.a11y.home" },
  { id: "end", label: "keybar.label.end", a11y: "keybar.a11y.end" },
  { id: "pgup", label: "keybar.label.pgup", a11y: "keybar.a11y.pgup" },
  { id: "pgdn", label: "keybar.label.pgdn", a11y: "keybar.a11y.pgdn" },
];

const STATE_KEYS: Readonly<Record<ModifierState, MessageKey>> = {
  off: "keybar.state.off",
  once: "keybar.state.once",
  locked: "keybar.state.locked",
};

/** The number of a function key: `f7` is 7. */
function functionNumber(id: FunctionId): number {
  return Number(id.slice(1));
}

/** A light tick per touch, only when the vibration setting is on. */
function useKeyTick(): () => void {
  const { haptics, settings } = useServices();
  const enabled = useStoreState(settings.store, (state) => state.settings.bellVibration);
  return useCallback(() => {
    if (enabled) {
      haptics.impactLight();
    }
  }, [enabled, haptics]);
}

type RepeatKeyProps = {
  readonly icon: IconName;
  readonly accessibilityLabel: string;
  /** `repeat` is false for the touch itself, true for every repeat. */
  readonly onFire: (repeat: boolean) => void;
  readonly testID: string;
};

function RepeatKey({ icon, accessibilityLabel, onFire, testID }: RepeatKeyProps) {
  const handlers = useKeyRepeat(onFire);
  return (
    <KeyBarKey
      icon={icon}
      accessibilityLabel={accessibilityLabel}
      onPress={handlers.onPress}
      onPressIn={handlers.onPressIn}
      onPressOut={handlers.onPressOut}
      testID={testID}
    />
  );
}

function Separator() {
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={{
        width: size.keybarSeparatorWidth,
        height: size.keybarSeparatorHeight,
        backgroundColor: colors.borderRow,
      }}
    />
  );
}

/** `keybar.fade`: `bg.bar` from transparent to opaque over the right edge. */
function Fade({ testID }: { readonly testID: string }) {
  const { colors } = useTheme();
  // An SVG id is global to the document: make it safe and unique.
  const gradientId = `keybar-fade-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: size.keybarFade }}
      testID={testID}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.bgBar} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.bgBar} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

type ScrollMetrics = { readonly x: number; readonly viewport: number; readonly content: number };

/** The special-keys bar. */
export function KeyBar({ modifiers, onKey, onModifier, onPaste, testID = "keybar" }: KeyBarProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const tick = useKeyTick();
  const [fnOpen, setFnOpen] = useState(false);
  const [metrics, setMetrics] = useState<ScrollMetrics>({ x: 0, viewport: 0, content: 0 });
  const scrollRef = useRef<ScrollViewInstance>(null);
  // Where the swappable group starts inside the scrolling row.
  const swapStart = useRef(0);
  const firstRender = useRef(true);

  // Swapping the group shows its start, so "close F" and F1 are in view.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const x = swapStart.current;
    scrollRef.current?.scrollTo({ x, animated: false });
    setMetrics((current) => (current.x === x ? current : { ...current, x }));
  }, [fnOpen]);

  const press = (id: KeyBarKeyId) => () => {
    tick();
    onKey(id);
  };
  const pressModifier = (modifier: KeyBarModifierId) => () => {
    tick();
    onModifier(modifier);
  };
  const fireArrow = (id: ArrowId) => (repeat: boolean) => {
    if (!repeat) {
      tick();
    }
    onKey(id);
  };
  const toggleFn = (open: boolean) => () => {
    tick();
    setFnOpen(open);
  };
  const paste = () => {
    tick();
    onPaste();
  };

  const modifierLabel = (modifier: KeyBarModifierId): string =>
    t(modifier === "ctrl" ? "keybar.a11y.ctrl" : "keybar.a11y.alt", {
      state: t(STATE_KEYS[modifiers[modifier]]),
    });

  // Read where a scroll settles: the fade only has to be right at rest.
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    setMetrics((current) => (current.x === x ? current : { ...current, x }));
  };
  const onViewportLayout = (event: LayoutChangeEvent) => {
    const viewport = event.nativeEvent.layout.width;
    setMetrics((current) => (current.viewport === viewport ? current : { ...current, viewport }));
  };
  const onContentSize = (content: number) => {
    setMetrics((current) => (current.content === content ? current : { ...current, content }));
  };
  const onSwapLayout = (event: LayoutChangeEvent) => {
    swapStart.current = event.nativeEvent.layout.x;
  };
  // The scroll view clamps its offset when the content shrinks; half a point
  // of slack for its fractional offsets.
  const maxX = Math.max(0, metrics.content - metrics.viewport);
  const moreToTheRight = maxX - Math.min(metrics.x, maxX) > 0.5;

  const row = { flexDirection: "row", alignItems: "center", gap: spacing.keyGap } as const;

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={t("keybar.group")}
      testID={testID}
      style={{
        ...row,
        height: size.keybarHeight,
        paddingLeft: spacing.keyMargin,
        backgroundColor: colors.bgBar,
        borderTopWidth: size.borderWidth,
        borderTopColor: colors.borderRow,
      }}
    >
      <KeyBarKey
        label={t("keybar.label.esc")}
        accessibilityLabel={t("keybar.a11y.esc")}
        onPress={press("esc")}
        testID={`${testID}-esc`}
      />
      <KeyBarKey
        label={t("keybar.label.tab")}
        accessibilityLabel={t("keybar.a11y.tab")}
        onPress={press("tab")}
        testID={`${testID}-tab`}
      />
      <KeyBarKey
        label={t("keybar.label.ctrl")}
        accessibilityLabel={modifierLabel("ctrl")}
        modifierState={modifiers.ctrl}
        onPress={pressModifier("ctrl")}
        testID={`${testID}-ctrl`}
      />
      <KeyBarKey
        label={t("keybar.label.alt")}
        accessibilityLabel={modifierLabel("alt")}
        modifierState={modifiers.alt}
        onPress={pressModifier("alt")}
        testID={`${testID}-alt`}
      />
      <Separator />
      <View
        style={{ flex: 1, alignSelf: "stretch", justifyContent: "center" }}
        onLayout={onViewportLayout}
        testID={`${testID}-viewport`}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          onScrollEndDrag={onScroll}
          onMomentumScrollEnd={onScroll}
          onContentSizeChange={onContentSize}
          contentContainerStyle={{ ...row, paddingRight: spacing.keyMargin }}
          testID={`${testID}-scroll`}
        >
          {ARROWS.map((arrow) => (
            <RepeatKey
              key={arrow.id}
              icon={arrow.icon}
              accessibilityLabel={t(arrow.a11y)}
              onFire={fireArrow(arrow.id)}
              testID={`${testID}-${arrow.id}`}
            />
          ))}
          <Separator />
          <View style={row} onLayout={onSwapLayout}>
            {fnOpen ? (
              <>
                <KeyBarKey
                  icon="x"
                  accessibilityLabel={t("keybar.a11y.close_fn")}
                  onPress={toggleFn(false)}
                  testID={`${testID}-close-fn`}
                />
                {FUNCTION_KEYS.map((id) => (
                  <KeyBarKey
                    key={id}
                    label={t("keybar.label.function", { number: functionNumber(id) })}
                    accessibilityLabel={t("keybar.a11y.function", { number: functionNumber(id) })}
                    onPress={press(id)}
                    testID={`${testID}-${id}`}
                  />
                ))}
              </>
            ) : (
              <>
                {NAVIGATION.map((key) => (
                  <KeyBarKey
                    key={key.id}
                    label={t(key.label)}
                    accessibilityLabel={t(key.a11y)}
                    onPress={press(key.id)}
                    testID={`${testID}-${key.id}`}
                  />
                ))}
                <KeyBarKey
                  label={t("keybar.label.fn")}
                  accessibilityLabel={t("keybar.a11y.fn")}
                  onPress={toggleFn(true)}
                  testID={`${testID}-fn`}
                />
                <KeyBarKey
                  icon="clipboard-paste"
                  accessibilityLabel={t("common.paste")}
                  onPress={paste}
                  testID={`${testID}-paste`}
                />
              </>
            )}
          </View>
        </ScrollView>
        {moreToTheRight ? <Fade testID={`${testID}-fade`} /> : null}
      </View>
    </View>
  );
}
