// SPDX-License-Identifier: GPL-3.0-or-later
// A banner under the bar or at the top of a list (anatomy §2.5
// `banner.height` 36, §2.6 `banner.padding-x` and `banner.gap`, §2.7
// `icon.indicator`; §4.2 read error, §4.1 no screen lock, §4.5.4 connection
// banner): `bg.sheet` with the `border.sheet` bottom border, an optional
// icon (or a spinner while something waits), the text and an optional text
// action. The tone colors the icon and the text; the text always carries the
// meaning (§1 principle 3). It is a polite live region: the screen reader
// announces it without moving the focus (Android live region; an announcement
// in the queue on iOS, which has no live regions).
import { useEffect } from "react";
import { AccessibilityInfo, Platform, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { radius, size, space, spacing, typeStyle, useTheme, type ColorToken } from "../theme";
import { Icon, type IconName } from "./Icon";
import { Spinner } from "./Spinner";

/** `neutral` is the normal offline tone (§1 principle 5); only a real error is `error`. */
export type BannerTone = "info" | "warning" | "error" | "neutral";

/** The text action at the end of the banner (e.g. "Try again"). */
export type BannerAction = {
  /** Already translated. */
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
};

export type BannerProps = {
  readonly tone: BannerTone;
  /** Already translated. */
  readonly message: string;
  readonly icon?: IconName;
  /** A spinner in place of the icon (reconnecting, §4.5.4). */
  readonly busy?: boolean;
  readonly action?: BannerAction;
  readonly testID?: string;
};

type ToneLook = { readonly icon: ColorToken; readonly text: ColorToken };

const tones: Record<BannerTone, ToneLook> = {
  info: { icon: "accent", text: "textBody" },
  warning: { icon: "warning", text: "warningText" },
  error: { icon: "error", text: "errorText" },
  neutral: { icon: "textSecondary", text: "textBody" },
};

/** The touch target of the action reaches `target.min` beyond the banner (§5 item 1). */
const actionSlop = (size.targetMin - size.bannerHeight) / 2;

/** A full-width banner that the screen reader announces politely. */
export function Banner({ tone, message, icon, busy = false, action, testID }: BannerProps) {
  const { colors } = useTheme();
  const look = tones[tone];

  useEffect(() => {
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
    }
  }, [message]);

  return (
    <View
      accessibilityLiveRegion="polite"
      {...(testID === undefined ? {} : { testID })}
      style={{
        minHeight: size.bannerHeight,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.bannerGap,
        paddingHorizontal: spacing.bannerPaddingX,
        // The text may wrap (§4.1's long warning); one `space.scale` step keeps it off the edges.
        paddingVertical: space.s,
        backgroundColor: colors.bgSheet,
        borderBottomWidth: size.borderWidth,
        borderBottomColor: colors.borderSheet,
      }}
    >
      {busy ? (
        <Spinner color="accent" {...(testID === undefined ? {} : { testID: `${testID}-spinner` })} />
      ) : icon === undefined ? null : (
        <Icon
          name={icon}
          role="indicator"
          color={look.icon}
          {...(testID === undefined ? {} : { testID: `${testID}-icon` })}
        />
      )}
      <Text style={[typeStyle("secondary"), { color: colors[look.text], flex: 1 }]}>{message}</Text>
      {action === undefined ? null : (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={{ top: actionSlop, bottom: actionSlop }}
          {...(action.testID === undefined ? {} : { testID: action.testID })}
          style={({ pressed }): StyleProp<ViewStyle> => [
            { minHeight: size.bannerHeight, justifyContent: "center", borderRadius: radius.control },
            pressed ? { backgroundColor: colors.bgPressed } : null,
          ]}
        >
          <Text style={[typeStyle("button"), { color: colors.accentText }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
