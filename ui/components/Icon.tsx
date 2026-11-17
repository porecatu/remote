// SPDX-License-Identifier: GPL-3.0-or-later
// The only way the chrome draws an icon (ADR-0008): a closed list of the
// Lucide icons the anatomy uses, each imported from its own subpath (the
// package index would bundle every icon). Size and stroke come from the role
// (anatomy §2.7), color from a chrome color token; the icon is fixed-size
// (it does not follow the system font scale) and hidden from screen readers,
// since the label belongs to the touchable that holds it.
import AppWindow from "lucide-react-native/icons/app-window";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import ArrowDownToLine from "lucide-react-native/icons/arrow-down-to-line";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import ArrowRight from "lucide-react-native/icons/arrow-right";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Bell from "lucide-react-native/icons/bell";
import Camera from "lucide-react-native/icons/camera";
import CameraOff from "lucide-react-native/icons/camera-off";
import Check from "lucide-react-native/icons/check";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronsDownUp from "lucide-react-native/icons/chevrons-down-up";
import ChevronsUpDown from "lucide-react-native/icons/chevrons-up-down";
import Circle from "lucide-react-native/icons/circle";
import CircleCheck from "lucide-react-native/icons/circle-check";
import CircleDashed from "lucide-react-native/icons/circle-dashed";
import CircleX from "lucide-react-native/icons/circle-x";
import ClipboardPaste from "lucide-react-native/icons/clipboard-paste";
import EllipsisVertical from "lucide-react-native/icons/ellipsis-vertical";
import Flashlight from "lucide-react-native/icons/flashlight";
import FolderInput from "lucide-react-native/icons/folder-input";
import FolderPlus from "lucide-react-native/icons/folder-plus";
import Keyboard from "lucide-react-native/icons/keyboard";
import LayoutPanelLeft from "lucide-react-native/icons/layout-panel-left";
import LoaderCircle from "lucide-react-native/icons/loader-circle";
import LocateFixed from "lucide-react-native/icons/locate-fixed";
import Lock from "lucide-react-native/icons/lock";
import Monitor from "lucide-react-native/icons/monitor";
import MonitorOff from "lucide-react-native/icons/monitor-off";
import MonitorSmartphone from "lucide-react-native/icons/monitor-smartphone";
import Palette from "lucide-react-native/icons/palette";
import PanelTopClose from "lucide-react-native/icons/panel-top-close";
import Pencil from "lucide-react-native/icons/pencil";
import Pin from "lucide-react-native/icons/pin";
import Plus from "lucide-react-native/icons/plus";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Scan from "lucide-react-native/icons/scan";
import Search from "lucide-react-native/icons/search";
import SearchX from "lucide-react-native/icons/search-x";
import Settings from "lucide-react-native/icons/settings";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import ShieldOff from "lucide-react-native/icons/shield-off";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import Ungroup from "lucide-react-native/icons/ungroup";
import Unplug from "lucide-react-native/icons/unplug";
import WifiOff from "lucide-react-native/icons/wifi-off";
import X from "lucide-react-native/icons/x";

import { icon as iconTokens, type IconRole } from "../theme/tokens";
import type { ColorToken } from "../theme/colors";
import { useTheme } from "../theme/ThemeProvider";

/** Every icon of the anatomy, by its Lucide name. */
const icons = {
  "app-window": AppWindow,
  "arrow-down": ArrowDown,
  "arrow-down-to-line": ArrowDownToLine,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  bell: Bell,
  camera: Camera,
  "camera-off": CameraOff,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevrons-down-up": ChevronsDownUp,
  "chevrons-up-down": ChevronsUpDown,
  circle: Circle,
  "circle-check": CircleCheck,
  "circle-dashed": CircleDashed,
  "circle-x": CircleX,
  "clipboard-paste": ClipboardPaste,
  "ellipsis-vertical": EllipsisVertical,
  flashlight: Flashlight,
  "folder-input": FolderInput,
  "folder-plus": FolderPlus,
  keyboard: Keyboard,
  "layout-panel-left": LayoutPanelLeft,
  "loader-circle": LoaderCircle,
  "locate-fixed": LocateFixed,
  lock: Lock,
  monitor: Monitor,
  "monitor-off": MonitorOff,
  "monitor-smartphone": MonitorSmartphone,
  palette: Palette,
  "panel-top-close": PanelTopClose,
  pencil: Pencil,
  pin: Pin,
  plus: Plus,
  "refresh-cw": RefreshCw,
  scan: Scan,
  search: Search,
  "search-x": SearchX,
  settings: Settings,
  "shield-alert": ShieldAlert,
  "shield-off": ShieldOff,
  "triangle-alert": TriangleAlert,
  ungroup: Ungroup,
  unplug: Unplug,
  "wifi-off": WifiOff,
  x: X,
} as const;

/** The Lucide name of an icon the app uses. */
export type IconName = keyof typeof icons;

/** Every icon name, in the order of the list. */
export const iconNames = Object.keys(icons) as IconName[];

export type IconProps = {
  readonly name: IconName;
  /** Size and stroke come from the role (anatomy §2.7). */
  readonly role: IconRole;
  /** A chrome color token (anatomy §2.1, §2.2). */
  readonly color: ColorToken;
  readonly testID?: string;
};

/** A decorative Lucide icon, sized by role and colored by token. */
export function Icon({ name, role, color, testID }: IconProps) {
  const { colors } = useTheme();
  const Glyph = icons[name];
  const { size, strokeWidth } = iconTokens[role];
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      color={colors[color]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
