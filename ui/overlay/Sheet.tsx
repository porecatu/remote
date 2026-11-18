// SPDX-License-Identifier: GPL-3.0-or-later
// The bottom sheet (anatomy §4.12, §4.12.9, §1 principle 9, §5; ADR-0011):
// `bg.sheet` with the `radius.sheet` top corners, the `border.sheet` top
// border and `shadow.sheet`, the handle (48 × 4, `border.sheet`, round), the
// title (`type.dialog-title`) and an optional subtitle (`type.secondary`),
// then the content, which scrolls, and an optional fixed footer. `bg.scrim`
// behind it closes it on touch.
//
// It rises and falls in `duration.sheet`, with no transition when the system
// asks to reduce motion (Reanimated, ADR-0010). Dragging the handle or the
// title down closes it (Gesture Handler; only there, so the list inside
// scrolls freely); a drag shorter than a touch target springs back. With
// `avoidKeyboard`, the sheet rises above the keyboard (Keyboard Controller).
// The screen reader focus goes to the title when it opens.
//
// A sheet is drawn only by the overlay layer: `useOverlay().openSheet(({ close }) => <Sheet …/>)`.
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { Divider } from "@ui/components/Divider";
import { Icon, type IconName } from "@ui/components/Icon";
import { Spinner } from "@ui/components/Spinner";
import { useT } from "@ui/i18n/LocaleProvider";
import {
  opacity,
  radius,
  roundRadius,
  shadow,
  size,
  spacing,
  transitionDuration,
  typeStyle,
  useReducedMotion,
  useTheme,
  type ColorToken,
} from "@ui/theme";

import { useOverlayFrame } from "./OverlayProvider";

/** A drag down of at least one touch target closes the sheet; a shorter one springs back. */
const DRAG_CLOSE_DISTANCE = size.targetMin;

export type SheetProps = {
  /** Already translated; the screen reader focus lands on it. */
  readonly title: string;
  /** Context line under the title ("In Window 1"). */
  readonly subtitle?: string;
  /** Items, a list, a form. Scrolls when it does not fit. */
  readonly children?: ReactNode;
  /** Fixed at the end of the sheet, out of the scroll (the "Create tab" button). */
  readonly footer?: ReactNode;
  /** The content gets the side margin `sheet.padding-x` (forms); items bring their own. */
  readonly padded?: boolean;
  /** The sheet has a text field: it rises above the keyboard. */
  readonly avoidKeyboard?: boolean;
  /** Default `sheet`; the parts get `-scrim`, `-panel`, `-handle`, `-title`, `-drag` (gesture). */
  readonly testID?: string;
};

/** A bottom sheet of the overlay layer. */
export function Sheet({
  title,
  subtitle,
  children,
  footer,
  padded = false,
  avoidKeyboard = false,
  testID = "sheet",
}: SheetProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const frame = useOverlayFrame();
  const titleRef = useRef<ComponentRef<typeof Text>>(null);
  const duration = transitionDuration("sheet", reducedMotion);
  // 0: hidden below the screen; 1: up.
  const progress = useSharedValue(duration === 0 ? 1 : 0);
  const drag = useSharedValue(0);
  const { close, finish, closing } = frame;

  // The opening: once, with the duration in effect then.
  const [openingDuration] = useState(duration);
  useEffect(() => {
    if (openingDuration > 0) {
      progress.set(withTiming(1, { duration: openingDuration }));
    }
    const title = titleRef.current;
    if (title !== null) {
      AccessibilityInfo.sendAccessibilityEvent(title, "focus");
    }
  }, [openingDuration, progress]);

  useEffect(() => {
    if (!closing) {
      return;
    }
    if (duration === 0) {
      finish();
      return;
    }
    progress.set(
      withTiming(0, { duration }, () => {
        "worklet";
        scheduleOnRN(finish);
      }),
    );
  }, [closing, duration, finish, progress]);

  const dismiss = () => {
    close("dismiss");
  };

  const pan = usePanGesture({
    testID: `${testID}-drag`,
    enabled: !closing,
    onUpdate: (event) => {
      "worklet";
      drag.set(Math.max(0, event.translationY));
    },
    onDeactivate: (event) => {
      "worklet";
      if (event.translationY >= DRAG_CLOSE_DISTANCE) {
        scheduleOnRN(dismiss);
      } else {
        drag.set(withTiming(0, { duration }));
      }
    },
  });

  const panelMotion = useAnimatedStyle(() => ({
    transform: [
      { translateY: `${(1 - progress.get()) * 100}%` as const },
      { translateY: drag.get() },
    ],
  }));
  const scrimMotion = useAnimatedStyle(() => ({ opacity: progress.get() }));

  const panelStyle = [
    styles.panel,
    {
      backgroundColor: colors.bgSheet,
      borderTopColor: colors.borderSheet,
      paddingBottom: spacing.sheetPaddingBottom + (keyboardVisible ? 0 : insets.bottom),
    },
    panelMotion,
  ];

  const body = (
    <View style={[styles.frame, { paddingTop: insets.top }]} pointerEvents="box-none">
      <Animated.View style={panelStyle} testID={`${testID}-panel`}>
        <GestureDetector gesture={pan}>
          <View>
            <View
              style={styles.handleArea}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <View
                testID={`${testID}-handle`}
                style={[styles.handle, { backgroundColor: colors.borderSheet }]}
              />
            </View>
            <View style={styles.titleArea}>
              <Text
                ref={titleRef}
                accessibilityRole="header"
                testID={`${testID}-title`}
                style={[typeStyle("dialogTitle"), { color: colors.textTitle }]}
              >
                {title}
              </Text>
              {subtitle === undefined ? null : (
                <Text style={[typeStyle("secondary"), { color: colors.textSecondary }]}>{subtitle}</Text>
              )}
            </View>
          </View>
        </GestureDetector>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={padded ? styles.padded : null}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {children}
        </ScrollView>
        {footer === undefined ? null : <View style={styles.padded}>{footer}</View>}
      </Animated.View>
    </View>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={closing ? "none" : "box-none"} testID={testID}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgScrim }, scrimMotion]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} testID={`${testID}-scrim`} />
      </Animated.View>
      {avoidKeyboard ? (
        <KeyboardAvoidingView behavior="padding" style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

export type SheetItemProps = {
  /** Already translated. */
  readonly label: string;
  readonly icon: IconName;
  readonly onPress: () => void;
  /** Destructive tone, and "destructive action" for the screen reader (§4.12.9); goes last in the sheet. */
  readonly destructive?: boolean;
  /** Dimmed, never absent (§4.12.1), with the reason as `note`. */
  readonly disabled?: boolean;
  /** Why it is disabled ("There is only one window on the desktop"), under the label. */
  readonly note?: string;
  /** Its action awaits the result: dimmed, a spinner, no touch (RF-4.9). */
  readonly pending?: boolean;
  /** A toggle item: its state, shown as a check mark at the right and announced as checked or not. */
  readonly checked?: boolean;
  readonly testID?: string;
};

/** An action item of a sheet (`row.sheet`, icon `icon.item`, label `type.body`). */
export function SheetItem({
  label,
  icon,
  onPress,
  destructive = false,
  disabled = false,
  note,
  pending = false,
  checked,
  testID,
}: SheetItemProps) {
  const { colors } = useTheme();
  const { t } = useT();
  const inactive = disabled || pending;
  const toggle = checked !== undefined;
  const tone: ColorToken = disabled ? "textDisabled" : destructive ? "destructive" : "textBody";
  const a11yLabel = pending ? `${label}${t("a11y.separator")}${t("a11y.pending")}` : label;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole={toggle ? "checkbox" : "button"}
      accessibilityLabel={a11yLabel}
      accessibilityState={{
        disabled: inactive,
        ...(pending ? { busy: true } : {}),
        ...(toggle ? { checked } : {}),
      }}
      {...(destructive ? { accessibilityHint: t("a11y.destructive") } : {})}
      {...(testID === undefined ? {} : { testID })}
      style={({ pressed }): StyleProp<ViewStyle> => [
        styles.item,
        pressed && !inactive
          ? { backgroundColor: destructive ? colors.destructivePressed : colors.bgPressed }
          : null,
        pending ? styles.pending : null,
      ]}
    >
      <Icon name={icon} role="item" color={tone} />
      <View style={styles.itemText}>
        <Text style={[typeStyle("body"), { color: colors[tone] }]}>{label}</Text>
        {note === undefined ? null : (
          <Text style={[typeStyle("secondary"), { color: colors.textSecondary }]}>{note}</Text>
        )}
      </View>
      {pending ? <Spinner {...(testID === undefined ? {} : { testID: `${testID}-spinner` })} /> : null}
      {checked === true ? (
        <Icon name="check" role="item" color={tone} {...(testID === undefined ? {} : { testID: `${testID}-check` })} />
      ) : null}
    </Pressable>
  );
}

/** The divider of a sheet menu (before the destructive items). */
export function SheetDivider({ testID }: { readonly testID?: string }) {
  return <Divider variant="menu" {...(testID === undefined ? {} : { testID })} />;
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    justifyContent: "flex-end",
  },
  panel: {
    maxHeight: "100%",
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: size.borderWidth,
    boxShadow: [shadow.sheet],
  },
  handleArea: {
    alignItems: "center",
    paddingTop: spacing.sheetHandlePaddingTop,
    paddingBottom: spacing.sheetHandlePaddingBottom,
  },
  handle: {
    width: size.sheetHandleWidth,
    height: size.sheetHandleHeight,
    borderRadius: roundRadius(size.sheetHandleHeight),
  },
  titleArea: {
    paddingHorizontal: spacing.sheetPaddingX,
    paddingTop: spacing.sheetTitlePaddingTop,
    paddingBottom: spacing.sheetTitlePaddingBottom,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  padded: {
    paddingHorizontal: spacing.sheetPaddingX,
  },
  item: {
    minHeight: size.rowSheet,
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.rowIconGap,
    paddingHorizontal: spacing.rowPaddingX,
    paddingVertical: spacing.rowPaddingY,
  },
  itemText: {
    flex: 1,
  },
  pending: {
    opacity: opacity.pending,
  },
});
