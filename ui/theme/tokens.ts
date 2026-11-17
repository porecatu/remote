// SPDX-License-Identifier: GPL-3.0-or-later
// Mode-independent visual tokens of the app chrome. Every value mirrors
// docs/design/proposta-de-anatomia.md §2 one to one (English camelCase of the
// anatomy name: `row.padding-x` is `row.paddingX`). A value missing here goes
// into the anatomy first, never straight into a screen.
// Colors live in ./colors.ts (they depend on the light/dark mode).

/** §2.5 `space.scale`: the only spacing steps of the chrome. */
export const spaceScale = [4, 8, 12, 16, 24, 32] as const;

/** A spacing step of `space.scale`. */
export type SpaceStep = (typeof spaceScale)[number];

/** §2.5 `space.scale` by name, for padding and gaps not covered by `spacing`. */
export const space = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
} as const satisfies Record<string, SpaceStep>;

/** §2.4 Radii. `round` is "50%": use `radius.round` with {@link roundRadius}. */
export const radius = {
  /** `radius.sheet`: top corners of a bottom sheet. */
  sheet: 10,
  /** `radius.card`: row, card, central dialog, snackbar. */
  card: 8,
  /** `radius.control`: button, field, key, menu item. */
  control: 6,
  /** `radius.chip`: badge, chip, counter. */
  chip: 4,
} as const;

/** §2.4 `radius.round` (50%): the radius that rounds an element of this side. */
export function roundRadius(side: number): number {
  return side / 2;
}

/** §2.5 Dimensions of the mobile chrome and §2.6 component spacing. */
export const size = {
  /** `target.min`: primary touch target. */
  targetMin: 48,
  /** `target.min` floor (iOS HIG), only where height is short (key bar). */
  targetFloor: 44,
  /** `target.gap`: minimum space between targets. */
  targetGap: 8,
  /** `row.single`. */
  rowSingle: 56,
  /** `row.double`. */
  rowDouble: 64,
  /** `row.group-header`. */
  rowGroupHeader: 52,
  /** `row.sheet`: sheet action item. */
  rowSheet: 52,
  /** `button.height`. */
  buttonHeight: 48,
  /** `field.height`. */
  fieldHeight: 48,
  /** `bar.height` of a screen bar. */
  barHeight: 56,
  /** `bar.height` of the terminal bar. */
  terminalBarHeight: 48,
  /** `bar.height` of the terminal bar in landscape (§4.6). */
  terminalBarHeightLandscape: 40,
  /** `keybar.height` (keys of 44, margin of 4). */
  keybarHeight: 52,
  /** `gutter`: side margin of screens, plus the safe area. */
  gutter: 16,
  /** `badge.height`. */
  badgeHeight: 20,
  /** `swatch`: drawn size of a group color swatch (target is `targetMin`). */
  swatch: 40,
  /** `swatch.small`: swatch in the move-to-group list (§4.12.4). */
  swatchSmall: 16,
  /** `fab`: floating buttons of the grid (§4.7). */
  fab: 44,
  /** `dialog.width`: maximum width of a central dialog. */
  dialogMaxWidth: 360,
  /** `dialog.width`: margin on each side of a central dialog. */
  dialogMargin: 24,
  /** `border.width`: card, bar, sheet and dialog borders; dividers. */
  borderWidth: 1,
  /** `border.emphasis`: armed key, fab on, focused pane, chosen swatch ring, radio ring. */
  borderEmphasis: 2,
  /** `focus.width`. */
  focusWidth: 2,
  /** `focus.offset`. */
  focusOffset: 2,
  /** `group.stripe`: group color stripe (§4.5.2). */
  groupStripe: 4,
  /** `indicator.slot`: indicator space at the left of a tab row. */
  indicatorSlot: 24,
  /** `dot`: status dot, one size everywhere. */
  dot: 8,
  /** `sheet.handle` width. */
  sheetHandleWidth: 48,
  /** `sheet.handle` height. */
  sheetHandleHeight: 4,
  /** `scrollbar.width`. */
  scrollbarWidth: 3,
  /** `radio` outer size. */
  radio: 20,
  /** `radio` inner dot. */
  radioDot: 10,
  /** `key.size` (44 × 44). */
  key: 44,
  /** `keybar.separator` width. */
  keybarSeparatorWidth: 1,
  /** `keybar.separator` height. */
  keybarSeparatorHeight: 24,
  /** `keybar.fade`: width of the right-edge gradient of the key bar. */
  keybarFade: 40,
  /** `banner.height`: connection banner (§4.5.4). */
  bannerHeight: 36,
  /** `bottom-banner.height`: bottom banner of `exited`/`disconnected` (§4.10). */
  bottomBannerHeight: 56,
  /** `severity.width`: severity bar of the snackbar (§4.14). */
  severityWidth: 3,
  /** `deadline.height`: deadline bar of the confirmation dialog (§4.13). */
  deadlineHeight: 2,
  /** `state-card.max-width` (§4.10). */
  stateCardMaxWidth: 300,
  /** `button.wide`: primary button of empty and state screens. */
  buttonWide: 240,
  /** `lock.button`: "Unlock" button (§4.1). */
  lockButton: 280,
  /** `app-icon` on the lock screen (§4.1). */
  appIcon: 72,
  /** `camera.frame`: QR frame (§4.3.2). */
  cameraFrame: 260,
  /** `camera.corner` length. */
  cameraCornerLength: 24,
  /** `camera.corner` thickness. */
  cameraCornerWidth: 4,
  /** `zoom-chip.height` (§4.7). */
  zoomChipHeight: 28,
  /** `grid.padding-top`. */
  gridPaddingTop: 4,
} as const;

/** §2.5 Terminal font limits, in points, and line height as a factor of the font. */
export const terminal = {
  /** `terminal.min-font`: threshold of "fit the width" (RF-3.7). */
  minFont: 8,
  /** `terminal.read-font`: reading size when the width does not fit. */
  readFont: 12,
  /** `terminal.read-font` maximum (pinch zoom ceiling). */
  maxFont: 24,
  /** `terminal.line-height`. */
  lineHeight: 1.3,
} as const;

/** `thumbnail.ratio` (16 : 10), width over height (§4.9). */
export const thumbnailAspectRatio = 16 / 10;

/** §2.6 Component spacing, all on `space.scale` (two exceptions noted). */
export const spacing = {
  /** `list.padding`. */
  listPadding: 16,
  /** `list.gap`: between cards. */
  listGap: 8,
  /** `row.padding-x`. */
  rowPaddingX: 16,
  /** `row.padding-y`. */
  rowPaddingY: 12,
  /** `row.icon-gap`: left icon to text. */
  rowIconGap: 16,
  /** `row.line-gap`: between line 1 and line 2 (the line height gives the air). */
  rowLineGap: 0,
  /** `row.inline-gap`: title, badge and chips on one line. */
  rowInlineGap: 4,
  /** `tab-row.padding-x`. */
  tabRowPaddingX: 12,
  /** `tab-row.gap`: indicator slot to title. */
  tabRowGap: 8,
  /** `tree.loose-indent`: loose tab card indent (= `group.stripe`). */
  treeLooseIndent: 4,
  /** `divider.inset`: side inset of the menu divider. */
  dividerInset: 16,
  /** `divider.margin-y`: above and below the menu divider. */
  dividerMarginY: 8,
  /** `window.gap`: margin of the divider on top of each window after the first. */
  windowGap: 12,
  /** `bar.padding-x`. */
  barPaddingX: 4,
  /** `bar.title-inset`: bar title with no back button. */
  barTitleInset: 16,
  /** `section.padding-top` between blocks. */
  sectionPaddingTop: 24,
  /** `section.padding-top-first`: section label at the top of a window. */
  sectionPaddingTopFirst: 4,
  /** `section.padding-x`. */
  sectionPaddingX: 16,
  /** `section.padding-bottom`. */
  sectionPaddingBottom: 8,
  /** `chip.padding-x`. */
  chipPaddingX: 8,
  /** `chip.gap`: icon or dot to text. */
  chipGap: 4,
  /** `sheet.padding-x`. */
  sheetPaddingX: 16,
  /** `sheet.padding-bottom` (plus the safe area). */
  sheetPaddingBottom: 24,
  /** `sheet.handle-padding` above the handle. */
  sheetHandlePaddingTop: 8,
  /** `sheet.handle-padding` below the handle. */
  sheetHandlePaddingBottom: 4,
  /** `sheet.title-padding` above the title. */
  sheetTitlePaddingTop: 8,
  /** `sheet.title-padding` below the title and subtitle. */
  sheetTitlePaddingBottom: 12,
  /** `dialog.padding` (§4.13 fixes 20, an exception to `space.scale`). */
  dialogPadding: 20,
  /** `dialog.gap`. */
  dialogGap: 12,
  /** `dialog.list-indent`: process list indent. */
  dialogListIndent: 12,
  /** `button.padding-x`: dialog and text buttons. */
  buttonPaddingX: 16,
  /** `button.gap` (= `target.gap`). */
  buttonGap: 8,
  /** `field.padding-x`. */
  fieldPaddingX: 12,
  /** `form.gap`: label, field and help line. */
  formGap: 8,
  /** `card.padding`. */
  cardPadding: 16,
  /** `state.padding-x`: state screen and empty state. */
  statePaddingX: 32,
  /** `state.gap`: title to body. */
  stateGap: 12,
  /** `state.block-gap`: icon to title, body to button. */
  stateBlockGap: 24,
  /** `banner.padding-x`. */
  bannerPaddingX: 16,
  /** `banner.gap`. */
  bannerGap: 8,
  /** `snackbar.margin`: from the screen end and above the key bar. */
  snackbarMargin: 16,
  /** `snackbar.padding`. */
  snackbarPadding: 12,
  /** `key.margin`. */
  keyMargin: 4,
  /** `key.gap` (§4.8 fixes 6, an exception to `space.scale`). */
  keyGap: 6,
  /** `key.padding-x`. */
  keyPaddingX: 8,
  /** `fab.gap`. */
  fabGap: 8,
  /** `fab.inset`: to the right edge and the bottom of the grid. */
  fabInset: 16,
  /** `zoom-chip.padding-x`. */
  zoomChipPaddingX: 12,
  /** `zoom-chip.top`. */
  zoomChipTop: 12,
  /** `scrollbar.inset`. */
  scrollbarInset: 4,
  /** `thumbnail.padding`. */
  thumbnailPadding: 4,
} as const;

/** §2.7 Icon roles. */
export type IconRole =
  | "bar"
  | "row"
  | "item"
  | "chevron"
  | "inline"
  | "fab"
  | "key"
  | "indicator"
  | "spinner"
  | "chip"
  | "thumb"
  | "lock"
  | "state";

/** §2.7 Stroke widths. */
export const stroke = {
  /** Default Lucide stroke. */
  standard: 2,
  /** Large icons (48): thinner, so they do not look heavy. */
  thin: 1.5,
  /** The 10 lock: thicker, so it survives antialiasing. */
  thick: 2.5,
} as const;

/** §2.7 Icon size and stroke by role (`icon.*`). */
export const icon = {
  bar: { size: 24, strokeWidth: stroke.standard },
  row: { size: 24, strokeWidth: stroke.standard },
  item: { size: 22, strokeWidth: stroke.standard },
  chevron: { size: 20, strokeWidth: stroke.standard },
  inline: { size: 20, strokeWidth: stroke.standard },
  fab: { size: 20, strokeWidth: stroke.standard },
  key: { size: 18, strokeWidth: stroke.standard },
  indicator: { size: 16, strokeWidth: stroke.standard },
  spinner: { size: 16, strokeWidth: stroke.standard },
  chip: { size: 14, strokeWidth: stroke.standard },
  thumb: { size: 12, strokeWidth: stroke.standard },
  lock: { size: 10, strokeWidth: stroke.thick },
  state: { size: 48, strokeWidth: stroke.thin },
} as const satisfies Record<IconRole, { size: number; strokeWidth: number }>;

/** Font weight as React Native takes it. */
export type FontWeight = "400" | "500" | "600";

/** Font family of a type role: the system font or the embedded mono (./fonts.ts). */
export type FontKind = "system" | "mono";

/** A type role of §2.3. `lineHeight` is absolute (pt/sp), like `fontSize`. */
export type TypeRole = {
  readonly font: FontKind;
  readonly fontSize: number;
  readonly fontWeight: FontWeight;
  readonly lineHeight: number;
  readonly letterSpacing?: number;
  readonly uppercase?: boolean;
};

/** §2.3 Type scale (`type.*`). */
export const type = {
  /** `type.screen-title`. */
  screenTitle: { font: "system", fontSize: 20, fontWeight: "600", lineHeight: 25 },
  /** `type.dialog-title`: dialog and sheet title. */
  dialogTitle: { font: "system", fontSize: 17, fontWeight: "600", lineHeight: 21 },
  /** `type.group-title`: group and window name. */
  groupTitle: { font: "system", fontSize: 16, fontWeight: "600", lineHeight: 20 },
  /** `type.button`: primary, text and dialog buttons. */
  button: { font: "system", fontSize: 16, fontWeight: "600", lineHeight: 20 },
  /** `type.row-title`: tab title, desktop name. */
  rowTitle: { font: "system", fontSize: 16, fontWeight: "500", lineHeight: 20 },
  /** `type.body`: body, sheet and menu item, settings row name. */
  body: { font: "system", fontSize: 15, fontWeight: "400", lineHeight: 22 },
  /** `type.secondary`: secondary line, sheet subtitle, dialog deadline. */
  secondary: { font: "system", fontSize: 13, fontWeight: "400", lineHeight: 19 },
  /** `type.section`: section label, uppercase, spacing .6. */
  section: {
    font: "system",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 15,
    letterSpacing: 0.6,
    uppercase: true,
  },
  /** `type.chip`: chip, badge, counter, status label. */
  chip: { font: "system", fontSize: 11, fontWeight: "600", lineHeight: 14 },
  /** `type.key`: key label (mono). */
  key: { font: "mono", fontSize: 13, fontWeight: "500", lineHeight: 16 },
  /** `type.mono-chip`: profile badge (mono). */
  monoChip: { font: "mono", fontSize: 11, fontWeight: "500", lineHeight: 14 },
  /** `type.mono-secondary`: user@host, cwd, paste preview (mono). */
  monoSecondary: { font: "mono", fontSize: 12, fontWeight: "400", lineHeight: 17 },
  /** `type.mono-body`: process name, relay host (mono). */
  monoBody: { font: "mono", fontSize: 13, fontWeight: "400", lineHeight: 19 },
  /** `type.fingerprint` (mono, §4.3.4). */
  fingerprint: { font: "mono", fontSize: 24, fontWeight: "500", lineHeight: 30 },
} as const satisfies Record<string, TypeRole>;

/** Name of a type role. */
export type TypeName = keyof typeof type;

/** §2.3 Font scale cap of fixed-height bars and the key bar (`maxFontSizeMultiplier`). */
export const barMaxFontScale = 1.3;

/** §2.8 Shadows, the same in both modes, in black. Values are React Native `boxShadow`. */
export const shadow = {
  /** `shadow.sheet`. */
  sheet: { offsetX: 0, offsetY: -8, blurRadius: 24, color: "rgba(0, 0, 0, 0.3)" },
  /** `shadow.dialog`. */
  dialog: { offsetX: 0, offsetY: 16, blurRadius: 40, color: "rgba(0, 0, 0, 0.45)" },
  /** `shadow.fab`. */
  fab: { offsetX: 0, offsetY: 4, blurRadius: 12, color: "rgba(0, 0, 0, 0.35)" },
} as const;

/** §2.9 Opacities. */
export const opacity = {
  /** `opacity.pending`: row with a pending action. */
  pending: 0.6,
  /** `opacity.read-only`: tree while reconnecting; grid in `reconnecting`. */
  readOnly: 0.6,
  /** `opacity.fab`: `bgBar` behind the floating buttons. */
  fab: 0.9,
  /** `opacity.zoom-chip`: `bgSheet` behind the zoom chip. */
  zoomChip: 0.92,
  /** `opacity.group-tint`: group color tint. */
  groupTint: 0.14,
} as const;

/** §2.9 Durations, in milliseconds. */
export const duration = {
  /** `duration.sheet`: sheet in and out. */
  sheet: 200,
  /** `duration.reflow`: tree rows in, out and reorder (linear). */
  reflow: 150,
  /** `duration.spinner`: one spinner turn (linear). */
  spinner: 1000,
  /** `duration.qr-invalid`: red QR frame. */
  qrInvalid: 400,
  /** `duration.pair-success`: "Paired with …" before the workspace. */
  pairSuccess: 800,
  /** `duration.zoom-chip`. */
  zoomChip: 1000,
  /** `duration.bell`: bell flashing in the terminal bar. */
  bell: 2000,
  /** `duration.snackbar-info`. */
  snackbarInfo: 6000,
  /** `duration.snackbar-error`. */
  snackbarError: 8000,
  /** `duration.key-repeat-delay`. */
  keyRepeatDelay: 400,
  /** `duration.key-repeat-interval`. */
  keyRepeatInterval: 80,
} as const;

/** Transition durations that "reduce motion" turns into zero (§2.9, §5 item 6). */
export type TransitionName = "sheet" | "reflow";

/** The duration of a transition, zero when the system asks to reduce motion. */
export function transitionDuration(name: TransitionName, reducedMotion: boolean): number {
  return reducedMotion ? 0 : duration[name];
}
