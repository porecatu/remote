// SPDX-License-Identifier: GPL-3.0-or-later
// The form sheets of tabs and groups (anatomy §4.12.3 to §4.12.7, PRD-004):
// each one takes the session and its target, sends its action and closes.
// The menus open them with the `openXxxSheet` functions.
export { GroupColorSheet, openGroupColorSheet, type GroupColorSheetProps } from "./GroupColorSheet";
export { MoveTabToGroupSheet, openMoveTabToGroupSheet, type MoveTabToGroupSheetProps } from "./MoveTabToGroupSheet";
export { MoveToWindowSheet, openMoveToWindowSheet, type MoveToWindowSheetProps } from "./MoveToWindowSheet";
export { NewGroupSheet, openNewGroupSheet, type NewGroupSheetProps } from "./NewGroupSheet";
export { RenameGroupSheet, openRenameGroupSheet, type RenameGroupSheetProps } from "./RenameGroupSheet";
export { RenameTabSheet, openRenameTabSheet, type RenameTabSheetProps } from "./RenameTabSheet";
export {
  groupChoices,
  groupPalette,
  windowChoices,
  windowOf,
  type GroupChoice,
  type GroupChoices,
  type MoveTarget,
  type WindowChoice,
} from "./model";
export { type FormSheetOpenOptions } from "./useSheetAction";
