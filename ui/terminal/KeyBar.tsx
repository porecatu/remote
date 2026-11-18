// SPDX-License-Identifier: GPL-3.0-or-later
// The special-keys bar of the terminal (anatomy §4.8, PRD-003 RF-3.15,
// RF-3.16, RF-3.17, RF-3.19): two rows of keys of 44, `bg.bar` with a
// `border.row` on top, a margin of 4 and a gap of 6 (100 high; 52 in landscape,
// where it is a single row).
//
// - Row 1, fixed, every key sharing the width: `Esc`, `Tab`, `Shift`, `Ctrl`,
//   `Alt`, `Fn` and `Paste`.
// - Row 2, scrolling, with a fade on the right edge while there is more to the
//   right: `Home`, `End`, `PgUp`, `PgDn`, then the symbols the phone keyboard
//   hides (`|` `~` `/` `\` `-` `_` `` ` ``), which go as text.
// - `Fn` swaps row 2 for `F1`…`F12`, behind an `x` key that goes back; while it
//   is open `Fn` itself looks on.
// - The arrows are not here: they live in the arrow pad (`ArrowPad.tsx`).
//
// The bar sends nothing itself: keys go to `onKey` (the terminal controller
// adds the armed modifiers), symbols to `onText`, `Shift`/`Ctrl`/`Alt` to
// `onModifier`, and `Paste` to `onPaste`. `Fn` and "close F" only change the
// bar. Every touch on a key gives a light haptic tick when the vibration
// setting is on (the same setting as the bell). The screen shows the bar only
// while the system keyboard is open, stuck to it.
import { useEffect, useId, useRef, useState } from "react";
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
import {
  FUNCTION_KEYS,
  KEY_BAR_FIXED,
  KEY_BAR_NAVIGATION,
  KEY_BAR_SYMBOLS,
  type KeyBarKeyId,
  type KeyBarModifierId,
} from "@/input/keyBar";
import type { ModifierState } from "@/input/modifiers";

import { useT } from "../i18n/LocaleProvider";
import { size, spacing, useTheme } from "../theme";
import { KeyBarKey } from "./KeyBarKey";
import { useKeyTick } from "./keyParts";

export type KeyBarProps = {
  /** State of `Shift`, `Ctrl` and `Alt` (the terminal controller's `modifiers`). */
  readonly modifiers: TerminalModifiers;
  /** A key that sends a named key (`Esc`, `Tab`, navigation, `F1`–`F12`). */
  readonly onKey: (id: KeyBarKeyId) => void;
  /** A tap on `Shift`, `Ctrl` or `Alt`. */
  readonly onModifier: (modifier: KeyBarModifierId) => void;
  /** A symbol key: the text it types. */
  readonly onText: (text: string) => void;
  /** The `Paste` key (`clipboard-paste`). */
  readonly onPaste: () => void;
  /** Landscape: a single row, the fixed keys then the scrolling ones. */
  readonly landscape?: boolean;
  readonly testID?: string;
};

type NavigationId = (typeof KEY_BAR_NAVIGATION)[number];
type FunctionId = (typeof FUNCTION_KEYS)[number];
type FixedId = (typeof KEY_BAR_FIXED)[number];

const NAVIGATION: Readonly<Record<NavigationId, { readonly label: MessageKey; readonly a11y: MessageKey }>> = {
  home: { label: "keybar.label.home", a11y: "keybar.a11y.home" },
  end: { label: "keybar.label.end", a11y: "keybar.a11y.end" },
  pgup: { label: "keybar.label.pgup", a11y: "keybar.a11y.pgup" },
  pgdn: { label: "keybar.label.pgdn", a11y: "keybar.a11y.pgdn" },
};

const MODIFIER_A11Y: Readonly<Record<KeyBarModifierId, MessageKey>> = {
  shift: "keybar.a11y.shift",
  ctrl: "keybar.a11y.ctrl",
  alt: "keybar.a11y.alt",
};

const STATE_KEYS: Readonly<Record<ModifierState, MessageKey>> = {
  off: "keybar.state.off",
  once: "keybar.state.once",
  locked: "keybar.state.locked",
};

/** The number of a function key: `f7` is 7. */
function functionNumber(id: FunctionId): number {
  return Number(id.slice(1));
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
export function KeyBar({
  modifiers,
  onKey,
  onModifier,
  onText,
  onPaste,
  landscape = false,
  testID = "keybar",
}: KeyBarProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const tick = useKeyTick();
  const [fnOpen, setFnOpen] = useState(false);
  const [metrics, setMetrics] = useState<ScrollMetrics>({ x: 0, viewport: 0, content: 0 });
  const scrollRef = useRef<ScrollViewInstance>(null);
  const firstRender = useRef(true);

  // Swapping row 2 shows its start, so "close F" and F1 (or Home) are in view.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ x: 0, animated: false });
    setMetrics((current) => (current.x === 0 ? current : { ...current, x: 0 }));
  }, [fnOpen]);

  const press = (id: KeyBarKeyId) => () => {
    tick();
    onKey(id);
  };
  const pressModifier = (modifier: KeyBarModifierId) => () => {
    tick();
    onModifier(modifier);
  };
  const toggleFn = (open: boolean) => () => {
    tick();
    setFnOpen(open);
  };
  const type = (text: string) => () => {
    tick();
    onText(text);
  };
  const paste = () => {
    tick();
    onPaste();
  };

  const modifierLabel = (modifier: KeyBarModifierId): string =>
    t(MODIFIER_A11Y[modifier], { state: t(STATE_KEYS[modifiers[modifier]]) });

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
  // The scroll view clamps its offset when the content shrinks; half a point
  // of slack for its fractional offsets.
  const maxX = Math.max(0, metrics.content - metrics.viewport);
  const moreToTheRight = maxX - Math.min(metrics.x, maxX) > 0.5;

  const row = { flexDirection: "row", alignItems: "center", gap: spacing.keyGap } as const;

  /** A key of row 1; `grow` shares the width in portrait. */
  const fixedKey = (id: FixedId, grow: boolean) => {
    const common = { grow, testID: `${testID}-${id}` };
    switch (id) {
      case "esc":
      case "tab":
        return (
          <KeyBarKey
            key={id}
            {...common}
            label={t(`keybar.label.${id}`)}
            accessibilityLabel={t(`keybar.a11y.${id}`)}
            onPress={press(id)}
          />
        );
      case "shift":
      case "ctrl":
      case "alt":
        return (
          <KeyBarKey
            key={id}
            {...common}
            label={t(`keybar.label.${id}`)}
            accessibilityLabel={modifierLabel(id)}
            modifierState={modifiers[id]}
            onPress={pressModifier(id)}
          />
        );
      case "fn":
        return (
          <KeyBarKey
            key={id}
            {...common}
            label={t("keybar.label.fn")}
            accessibilityLabel={t("keybar.a11y.fn")}
            open={fnOpen}
            onPress={toggleFn(!fnOpen)}
          />
        );
      case "paste":
        return (
          <KeyBarKey
            key={id}
            {...common}
            icon="clipboard-paste"
            accessibilityLabel={t("common.paste")}
            onPress={paste}
          />
        );
    }
  };

  /** Row 2: the keys that scroll, with the fade while there is more to the right. */
  const scrolling = (
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
            {KEY_BAR_NAVIGATION.map((id) => (
              <KeyBarKey
                key={id}
                label={t(NAVIGATION[id].label)}
                accessibilityLabel={t(NAVIGATION[id].a11y)}
                onPress={press(id)}
                testID={`${testID}-${id}`}
              />
            ))}
            <Separator />
            {KEY_BAR_SYMBOLS.map((symbol) => (
              <KeyBarKey
                key={symbol.id}
                label={symbol.text}
                accessibilityLabel={t(`keybar.a11y.symbol_${symbol.id}`)}
                onPress={type(symbol.text)}
                testID={`${testID}-symbol-${symbol.id}`}
              />
            ))}
          </>
        )}
      </ScrollView>
      {moreToTheRight ? <Fade testID={`${testID}-fade`} /> : null}
    </View>
  );

  const frame = {
    backgroundColor: colors.bgBar,
    borderTopWidth: size.borderWidth,
    borderTopColor: colors.borderRow,
  } as const;

  if (landscape) {
    // One row: the fixed keys, then the scrolling ones.
    return (
      <View
        accessibilityRole="toolbar"
        accessibilityLabel={t("keybar.group")}
        testID={testID}
        style={{ ...row, height: size.keybarHeightLandscape, paddingLeft: spacing.keyMargin, ...frame }}
      >
        {KEY_BAR_FIXED.map((id) => fixedKey(id, false))}
        <Separator />
        {scrolling}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={t("keybar.group")}
      testID={testID}
      style={{ height: size.keybarHeight, justifyContent: "center", rowGap: size.keybarRowGap, ...frame }}
    >
      <View style={{ ...row, paddingHorizontal: spacing.keyMargin }} testID={`${testID}-row-fixed`}>
        {KEY_BAR_FIXED.map((id) => fixedKey(id, true))}
      </View>
      <View style={{ ...row, paddingLeft: spacing.keyMargin }} testID={`${testID}-row-scroll`}>
        {scrolling}
      </View>
    </View>
  );
}
