// SPDX-License-Identifier: GPL-3.0-or-later
// The central dialog (anatomy §4.13, §4.14 "Diálogo central"; ADR-0011):
// `bg.sheet`, `radius.card`, `border.sheet`, `shadow.dialog`, the width of the
// screen minus `dialog.width`'s margins and at most its maximum, `dialog.padding`
// inside and `dialog.gap` between title, body and buttons. The buttons sit at
// the right, Cancel first; the button with the initial focus (Cancel by
// default) shows the focus ring (`focus.width`, `focus.offset`, `accent`), as
// the desktop dialog does. The screen reader focus goes to the title, and an
// optional announcement is queued after it ("60 seconds to answer").
//
// `bg.scrim` behind it does not close it: the back button, the screen reader
// escape and Cancel do. It has no transition (the anatomy animates only
// sheets).
//
// A dialog is drawn only by the overlay layer: `useOverlay().openDialog({...})`.
// `LiveDialog` is the dialog of a live descriptor: its props come from a hook
// run at every render, so they follow the language and any store.
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";

import { Button, type ButtonVariant } from "@ui/components/Button";
import { useT } from "@ui/i18n/LocaleProvider";
import { radius, shadow, size, spacing, typeStyle, useTheme } from "@ui/theme";

import { useOverlayFrame, type OverlayControls } from "./OverlayProvider";

export type DialogButton = {
  /** Already translated. */
  readonly label: string;
  /** Runs before the dialog closes. */
  readonly onPress?: () => void;
  /** Default `secondary` (the Cancel look); the destructive answer is `destructiveText` (§4.13). */
  readonly variant?: ButtonVariant;
  /** `cancel`: the default initial focus, and what the back button answers. */
  readonly role?: "cancel";
  /** Default true; false keeps the dialog open (the caller closes it later). */
  readonly closes?: boolean;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  /** Already translated; a destructive button says "destructive action" before it. */
  readonly accessibilityHint?: string;
  readonly testID?: string;
};

export type DialogProps = {
  /** Already translated. */
  readonly title: string;
  /** A plain text (`type.body`) or any content (process list). */
  readonly body?: ReactNode;
  /** Under the buttons (the deadline bar of §4.13). */
  readonly footer?: ReactNode;
  /** Left to right; Cancel first. */
  readonly buttons: readonly DialogButton[];
  /** Index of the button with the initial focus; default the `cancel` button, else the first. */
  readonly initialFocus?: number;
  /** Queued for the screen reader after the title ("60 seconds to answer"). */
  readonly announcement?: string;
  /** Default `dialog`; the parts get `-scrim`, `-card`, `-title`, `-focus` (ring). */
  readonly testID?: string;
};

/** The index of the button that starts with the focus. */
export function initialFocusIndex(buttons: readonly DialogButton[], initialFocus?: number): number {
  if (initialFocus !== undefined && initialFocus >= 0 && initialFocus < buttons.length) {
    return initialFocus;
  }
  const cancel = buttons.findIndex((button) => button.role === "cancel");
  return cancel >= 0 ? cancel : 0;
}

const DESTRUCTIVE_VARIANTS: ReadonlySet<ButtonVariant> = new Set(["destructive", "destructiveText"]);

/** Whether a dialog button is the destructive answer. */
export function isDestructiveButton(button: DialogButton): boolean {
  return button.variant !== undefined && DESTRUCTIVE_VARIANTS.has(button.variant);
}

/** A central dialog of the overlay layer. */
export function Dialog({
  title,
  body,
  footer,
  buttons,
  initialFocus,
  announcement,
  testID = "dialog",
}: DialogProps) {
  const { colors } = useTheme();
  const { t } = useT();
  const { close, finish, closing } = useOverlayFrame();
  const titleRef = useRef<ComponentRef<typeof Text>>(null);
  const focused = initialFocusIndex(buttons, initialFocus);
  // Only the announcement at the opening: a later change of it is not news.
  const [openingAnnouncement] = useState(announcement);

  useEffect(() => {
    const titleView = titleRef.current;
    if (titleView !== null) {
      AccessibilityInfo.sendAccessibilityEvent(titleView, "focus");
    }
    if (openingAnnouncement !== undefined) {
      AccessibilityInfo.announceForAccessibilityWithOptions(openingAnnouncement, { queue: true });
    }
  }, [openingAnnouncement]);

  useEffect(() => {
    if (closing) {
      finish();
    }
  }, [closing, finish]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={closing ? "none" : "auto"} testID={testID}>
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgScrim }]}
        testID={`${testID}-scrim`}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
      <View style={styles.center} pointerEvents="box-none">
        <View
          testID={`${testID}-card`}
          style={[styles.card, { backgroundColor: colors.bgSheet, borderColor: colors.borderSheet }]}
        >
          <Text
            ref={titleRef}
            accessibilityRole="header"
            testID={`${testID}-title`}
            style={[typeStyle("dialogTitle"), { color: colors.textTitle }]}
          >
            {title}
          </Text>
          {typeof body === "string" ? (
            <Text style={[typeStyle("body"), { color: colors.textBody }]}>{body}</Text>
          ) : (
            body
          )}
          <View style={styles.buttons}>
            {buttons.map((button, index) => {
              const hints = [
                ...(isDestructiveButton(button) ? [t("a11y.destructive")] : []),
                ...(button.accessibilityHint === undefined ? [] : [button.accessibilityHint]),
              ];
              const element = (
                <Button
                  label={button.label}
                  variant={button.variant ?? "secondary"}
                  onPress={() => {
                    button.onPress?.();
                    if (button.closes !== false) {
                      close("action");
                    }
                  }}
                  {...(button.disabled === undefined ? {} : { disabled: button.disabled })}
                  {...(button.loading === undefined ? {} : { loading: button.loading })}
                  {...(hints.length === 0 ? {} : { accessibilityHint: hints.join(t("a11y.separator")) })}
                  {...(button.testID === undefined ? {} : { testID: button.testID })}
                />
              );
              return index === focused ? (
                <View
                  key={index}
                  testID={`${testID}-focus`}
                  style={[styles.focusRing, { outlineColor: colors.accent }]}
                >
                  {element}
                </View>
              ) : (
                <View key={index}>{element}</View>
              );
            })}
          </View>
          {footer}
        </View>
      </View>
    </View>
  );
}

export type LiveDialogProps = {
  /** Runs at every render (a hook): the props of the dialog, read live. */
  readonly useProps: (controls: OverlayControls) => DialogProps;
  readonly controls: OverlayControls;
  /** Told the props of every render: the layer answers the back button with the latest Cancel. */
  readonly onProps?: (props: DialogProps) => void;
};

/** A dialog whose title, body and buttons are read at every render (`openDialog({ useProps })`). */
export function LiveDialog({ useProps, controls, onProps }: LiveDialogProps) {
  const props = useProps(controls);
  // During the render, not in an effect: the back button may come before any
  // commit. Idempotent (it keeps the latest props), so a second render is harmless.
  onProps?.(props);
  return <Dialog {...props} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: size.dialogMargin,
  },
  card: {
    width: "100%",
    maxWidth: size.dialogMaxWidth,
    padding: spacing.dialogPadding,
    rowGap: spacing.dialogGap,
    borderRadius: radius.card,
    borderWidth: size.borderWidth,
    boxShadow: [shadow.dialog],
  },
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.buttonGap,
  },
  focusRing: {
    borderRadius: radius.control,
    outlineWidth: size.focusWidth,
    outlineOffset: size.focusOffset,
    outlineStyle: "solid",
  },
});
