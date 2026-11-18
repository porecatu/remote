// SPDX-License-Identifier: GPL-3.0-or-later
// The special-keys bar of the terminal (anatomy §4.8, PRD-003 RF-3.15,
// RF-3.16, RF-3.17, RF-3.19): one row, 52 high, `bg.bar` with a `border.row`
// on top, keys of 44 with a margin of 4 and a gap of 6.
//
// The whole row scrolls horizontally, with a fade on the right edge while
// there is more to the right. Left to right (`KEY_BAR_LAYOUT`), in groups told
// apart by a separator: `Esc`, `Tab`, `Shift`, `Ctrl`, `Alt`; the arrows
// `←` `↓` `↑` `→` (they repeat while held); `Home`, `End`, `PgUp`, `PgDn`;
// `Paste`; and `F1`…`F12`, always in reach (no key opens them).
//
// The bar sends nothing itself: keys go to `onKey` (the terminal controller
// adds the armed modifiers), `Shift`/`Ctrl`/`Alt` to `onModifier`, and `Paste`
// to `onPaste`. Every touch on a key gives a light haptic tick when the
// vibration setting is on (the same setting as the bell). The screen shows the
// bar only while the system keyboard is open, stuck to it.
import { Fragment, useCallback, useId, useState } from "react";
import {
  ScrollView,
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
  KEY_BAR_LAYOUT,
  isKeyBarModifier,
  type KeyBarKeyId,
  type KeyBarModifierId,
} from "@/input/keyBar";
import type { ModifierState } from "@/input/modifiers";

import type { IconName } from "../components/Icon";
import { useStoreState } from "../hooks/useStoreState";
import { useT } from "../i18n/LocaleProvider";
import { useServices } from "../services/ServicesContext";
import { size, spacing, useTheme } from "../theme";
import { KeyBarKey } from "./KeyBarKey";
import { useKeyRepeat } from "./useKeyRepeat";

export type KeyBarProps = {
  /** State of `Shift`, `Ctrl` and `Alt` (the terminal controller's `modifiers`). */
  readonly modifiers: TerminalModifiers;
  /** A key that sends a named key (`Esc`, `Tab`, arrows, navigation, `F1`–`F12`); arrows repeat. */
  readonly onKey: (id: KeyBarKeyId) => void;
  /** A tap on `Shift`, `Ctrl` or `Alt`. */
  readonly onModifier: (modifier: KeyBarModifierId) => void;
  /** The `Paste` key (`clipboard-paste`). */
  readonly onPaste: () => void;
  readonly testID?: string;
};

type ArrowId = "left" | "down" | "up" | "right";
type FunctionId = (typeof FUNCTION_KEYS)[number];

/** The keys that show an icon. */
const ARROWS: Readonly<Record<ArrowId, { readonly icon: IconName; readonly a11y: MessageKey }>> = {
  left: { icon: "arrow-left", a11y: "keybar.a11y.left" },
  down: { icon: "arrow-down", a11y: "keybar.a11y.down" },
  up: { icon: "arrow-up", a11y: "keybar.a11y.up" },
  right: { icon: "arrow-right", a11y: "keybar.a11y.right" },
};

/** The keys with a mono label of their own, and what the screen reader says. */
const LABELLED: Readonly<
  Record<"esc" | "tab" | "home" | "end" | "pgup" | "pgdn", { readonly label: MessageKey; readonly a11y: MessageKey }>
> = {
  esc: { label: "keybar.label.esc", a11y: "keybar.a11y.esc" },
  tab: { label: "keybar.label.tab", a11y: "keybar.a11y.tab" },
  home: { label: "keybar.label.home", a11y: "keybar.a11y.home" },
  end: { label: "keybar.label.end", a11y: "keybar.a11y.end" },
  pgup: { label: "keybar.label.pgup", a11y: "keybar.a11y.pgup" },
  pgdn: { label: "keybar.label.pgdn", a11y: "keybar.a11y.pgdn" },
};

const MODIFIER: Readonly<
  Record<KeyBarModifierId, { readonly label: MessageKey; readonly a11y: MessageKey }>
> = {
  shift: { label: "keybar.label.shift", a11y: "keybar.a11y.shift" },
  ctrl: { label: "keybar.label.ctrl", a11y: "keybar.a11y.ctrl" },
  alt: { label: "keybar.label.alt", a11y: "keybar.a11y.alt" },
};

const STATE_KEYS: Readonly<Record<ModifierState, MessageKey>> = {
  off: "keybar.state.off",
  once: "keybar.state.once",
  locked: "keybar.state.locked",
};

/** The first key of each group after the first: a separator goes before it. */
const GROUP_STARTS: ReadonlySet<string> = new Set(["left", "home", "paste", "f1"]);

/** The number of a function key: `f7` is 7. */
function functionNumber(id: FunctionId): number {
  return Number(id.slice(1));
}

function isArrow(id: string): id is ArrowId {
  return id === "left" || id === "down" || id === "up" || id === "right";
}

function isFunctionKey(id: string): id is FunctionId {
  return (FUNCTION_KEYS as readonly string[]).includes(id);
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
  const [metrics, setMetrics] = useState<ScrollMetrics>({ x: 0, viewport: 0, content: 0 });

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
  const paste = () => {
    tick();
    onPaste();
  };

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

  /** One key of `KEY_BAR_LAYOUT`. */
  const key = (id: (typeof KEY_BAR_LAYOUT)[number]) => {
    const keyTestID = `${testID}-${id}`;
    if (id === "paste") {
      return (
        <KeyBarKey icon="clipboard-paste" accessibilityLabel={t("common.paste")} onPress={paste} testID={keyTestID} />
      );
    }
    if (isKeyBarModifier(id)) {
      return (
        <KeyBarKey
          label={t(MODIFIER[id].label)}
          accessibilityLabel={t(MODIFIER[id].a11y, { state: t(STATE_KEYS[modifiers[id]]) })}
          modifierState={modifiers[id]}
          onPress={pressModifier(id)}
          testID={keyTestID}
        />
      );
    }
    if (isArrow(id)) {
      return (
        <RepeatKey
          icon={ARROWS[id].icon}
          accessibilityLabel={t(ARROWS[id].a11y)}
          onFire={fireArrow(id)}
          testID={keyTestID}
        />
      );
    }
    if (isFunctionKey(id)) {
      return (
        <KeyBarKey
          label={t("keybar.label.function", { number: functionNumber(id) })}
          accessibilityLabel={t("keybar.a11y.function", { number: functionNumber(id) })}
          onPress={press(id)}
          testID={keyTestID}
        />
      );
    }
    return (
      <KeyBarKey
        label={t(LABELLED[id].label)}
        accessibilityLabel={t(LABELLED[id].a11y)}
        onPress={press(id)}
        testID={keyTestID}
      />
    );
  };

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={t("keybar.group")}
      testID={testID}
      style={{
        height: size.keybarHeight,
        paddingLeft: spacing.keyMargin,
        backgroundColor: colors.bgBar,
        borderTopWidth: size.borderWidth,
        borderTopColor: colors.borderRow,
      }}
    >
      <View style={{ flex: 1, justifyContent: "center" }} onLayout={onViewportLayout} testID={`${testID}-viewport`}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          onScrollEndDrag={onScroll}
          onMomentumScrollEnd={onScroll}
          onContentSizeChange={onContentSize}
          contentContainerStyle={{ ...row, paddingRight: spacing.keyMargin }}
          testID={`${testID}-scroll`}
        >
          {KEY_BAR_LAYOUT.map((id) => (
            <Fragment key={id}>
              {GROUP_STARTS.has(id) ? <Separator /> : null}
              {key(id)}
            </Fragment>
          ))}
        </ScrollView>
        {moreToTheRight ? <Fade testID={`${testID}-fade`} /> : null}
      </View>
    </View>
  );
}
