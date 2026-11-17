// SPDX-License-Identifier: GPL-3.0-or-later
// The Skia canvas of the grid (ADR-0002): the theme background, the frame of
// line pictures and, above it, the cursor layer. Zoom and scroll are one
// transform read from shared values on the UI thread (items 5 and 6): a pinch
// or a drag never re-renders React nor records a line again. The pictures
// themselves change by shared value too, so a `grid-diff` reaches the screen
// without going through the reconciler (item 1).
import { Canvas, Fill, Group, Picture, type SkPicture, type Transforms3d } from "@shopify/react-native-skia";
import type { StyleProp, ViewStyle } from "react-native";
import type { SharedValue } from "react-native-reanimated";

export interface GridCanvasProps {
  /** The lines of the drawn window, in recording units. */
  readonly frame: SharedValue<SkPicture>;
  /** The cursor layer, in the same units. */
  readonly cursor: SharedValue<SkPicture>;
  /** Content → screen: scroll translation and zoom scale. */
  readonly transform: SharedValue<Transforms3d>;
  /** The desktop theme background (`bg.terminal` before the theme arrives). */
  readonly background: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function GridCanvas({ frame, cursor, transform, background, style, testID }: GridCanvasProps) {
  return (
    <Canvas style={style} {...(testID === undefined ? {} : { testID })}>
      <Fill color={background} />
      <Group transform={transform}>
        <Picture picture={frame} />
        <Picture picture={cursor} />
      </Group>
    </Canvas>
  );
}
