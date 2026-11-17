// SPDX-License-Identifier: GPL-3.0-or-later
// The temporary notice, or snackbar (anatomy §4.14): `bg.sheet` with the
// `border.sheet` border, `radius.card`, the text in `type.body` `text.body`,
// the severity bar (`severity.width`) at the left in `error`, `warning` or
// `accent`, and `snackbar.margin` from the sides, from the bottom safe area
// and above the key bar (the offset a screen registers with
// `useToastOffset`); it follows the keyboard up. It leaves after its time
// (`duration.snackbar-info` or `duration.snackbar-error`, set when it was
// shown), which pauses while the user touches it; an error also has the `x`
// button. A polite live region: the screen reader announces it and the focus
// never moves to it. The code of a failed action (§4.14, "with the code in
// mono, for a report") is drawn in `type.mono-body` where it appears in the
// message; a code the message does not carry goes under it.
import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ToastEntry, ToastSeverity } from "@/controllers/overlay";
import { IconButton } from "@ui/components/IconButton";
import { useT } from "@ui/i18n/LocaleProvider";
import { radius, size, spacing, typeStyle, useTheme, type ColorToken } from "@ui/theme";

const SEVERITY_COLOR: Readonly<Record<ToastSeverity, ColorToken>> = {
  info: "accent",
  warning: "warning",
  error: "error",
};

export type ToastProps = {
  readonly toast: ToastEntry<string>;
  /** The part of the message drawn in mono (the code of a failed action). */
  readonly code?: string;
  /** Points above the bottom safe area taken by a bar of the screen (key bar). */
  readonly offset?: number;
  readonly onDismiss: (id: string) => void;
  /** Default `toast`; the parts get `-bar` and `-dismiss`. */
  readonly testID?: string;
};

type PausableTimer = {
  /** What runs when the time is up (the latest one given). */
  readonly setOnDone: (onDone: () => void) => void;
  /** Starts, or resumes with the time left. */
  readonly resume: () => void;
  /** Stops the clock, keeping the time left. */
  readonly pause: () => void;
};

/** A one-shot timer of `durationMs` that can be paused. */
function createPausableTimer(durationMs: number): PausableTimer {
  let onDone: () => void = () => undefined;
  let handle: ReturnType<typeof setTimeout> | null = null;
  let remaining = durationMs;
  let startedAt = 0;
  return {
    setOnDone(next) {
      onDone = next;
    },
    resume() {
      if (handle !== null) {
        return;
      }
      startedAt = Date.now();
      handle = setTimeout(() => {
        handle = null;
        onDone();
      }, remaining);
    },
    pause() {
      if (handle === null) {
        return;
      }
      clearTimeout(handle);
      handle = null;
      remaining = Math.max(0, remaining - (Date.now() - startedAt));
    },
  };
}

/** The message around its code: the text before it, the code, the text after it. */
export type ToastMessageParts = {
  readonly before: string;
  readonly code: string;
  readonly after: string;
};

/** Splits `message` at the first occurrence of `code`; null without a code or when the message does not carry it. */
export function toastMessageParts(message: string, code: string | undefined): ToastMessageParts | null {
  if (code === undefined || code === "") {
    return null;
  }
  const at = message.indexOf(code);
  if (at < 0) {
    return null;
  }
  return { before: message.slice(0, at), code, after: message.slice(at + code.length) };
}

const MONO_INLINE = {
  fontFamily: typeStyle("monoBody").fontFamily,
  fontSize: typeStyle("monoBody").fontSize,
};

/** The snackbar on screen. The host keys it by the notice id, so each notice gets its own clock. */
export function Toast({ toast, code, offset = 0, onDismiss, testID = "toast" }: ToastProps) {
  const { colors } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [timer] = useState(() => createPausableTimer(toast.durationMs));
  const { id } = toast;
  const dismiss = useCallback(() => {
    onDismiss(id);
  }, [onDismiss, id]);
  const { pause, resume } = timer;

  useEffect(() => {
    timer.setOnDone(dismiss);
  }, [timer, dismiss]);

  useEffect(() => {
    timer.resume();
    return timer.pause;
  }, [timer]);

  const parts = toastMessageParts(toast.message, code);
  // A code the message does not carry goes under it.
  const codeLine = parts === null && code !== undefined && code !== "" ? code : null;
  const spoken = codeLine === null ? toast.message : [toast.message, codeLine].join(t("a11y.separator"));

  useEffect(() => {
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibilityWithOptions(spoken, { queue: true });
    }
  }, [spoken]);

  return (
    <KeyboardStickyView
      offset={{ closed: 0, opened: insets.bottom }}
      style={styles.dock}
      pointerEvents="box-none"
    >
      <View
        testID={testID}
        accessibilityLiveRegion="polite"
        onTouchStart={pause}
        onTouchEnd={resume}
        onTouchCancel={resume}
        style={[
          styles.toast,
          {
            marginBottom: insets.bottom + spacing.snackbarMargin + offset,
            backgroundColor: colors.bgSheet,
            borderColor: colors.borderSheet,
          },
        ]}
      >
        <View
          testID={`${testID}-bar`}
          style={[styles.bar, { backgroundColor: colors[SEVERITY_COLOR[toast.severity]] }]}
        />
        <View style={styles.message}>
          <Text style={[typeStyle("body"), { color: colors.textBody }]} testID={`${testID}-message`}>
            {parts === null ? (
              toast.message
            ) : (
              <>
                {parts.before}
                <Text style={MONO_INLINE} testID={`${testID}-code`}>
                  {parts.code}
                </Text>
                {parts.after}
              </>
            )}
          </Text>
          {codeLine === null ? null : (
            <Text style={[typeStyle("monoBody"), { color: colors.textBody }]} testID={`${testID}-code`}>
              {codeLine}
            </Text>
          )}
        </View>
        {toast.severity === "error" ? (
          <IconButton
            icon="x"
            role="inline"
            accessibilityLabel={t("toast.dismiss")}
            onPress={dismiss}
            testID={`${testID}-dismiss`}
          />
        ) : null}
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  toast: {
    marginHorizontal: spacing.snackbarMargin,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.card,
    borderWidth: size.borderWidth,
    overflow: "hidden",
  },
  bar: {
    alignSelf: "stretch",
    width: size.severityWidth,
  },
  message: {
    flex: 1,
    padding: spacing.snackbarPadding,
  },
});
