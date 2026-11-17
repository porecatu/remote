// SPDX-License-Identifier: GPL-3.0-or-later
// Smoke test of the Jest setup: every native UI library mounts under its mock.
import { Canvas, Rect, Skia } from "@shopify/react-native-skia";
import { render, screen } from "@testing-library/react-native";
import X from "lucide-react-native/icons/x";
import { GestureDetector, GestureHandlerRootView, useTapGesture } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { KeyboardProvider } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

function Tappable({ onTap }: { onTap: () => void }) {
  const tap = useTapGesture({ testID: "tap", runOnJS: true, onActivate: onTap });
  return (
    <GestureDetector gesture={tap}>
      <Animated.View testID="tappable" />
    </GestureDetector>
  );
}

function Faded() {
  const opacity = useSharedValue(0.5);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View testID="faded" style={style} />;
}

describe("native test setup", () => {
  it("mounts Gesture Handler, Reanimated, Keyboard Controller, a Lucide icon and a Skia canvas", async () => {
    await render(
      <GestureHandlerRootView testID="gesture-root">
        <KeyboardProvider>
          <Animated.View testID="animated-view">
            <X testID="icon-x" />
            <Canvas testID="skia-canvas" style={{ width: 10, height: 10 }}>
              <Rect x={0} y={0} width={10} height={10} color="black" />
            </Canvas>
          </Animated.View>
        </KeyboardProvider>
      </GestureHandlerRootView>,
    );

    expect(screen.getByTestId("gesture-root")).toBeTruthy();
    expect(screen.getByTestId("animated-view")).toBeTruthy();
    // Lucide renders its SVG with aria-hidden, so queries must opt in.
    expect(screen.getByTestId("icon-x", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("skia-canvas")).toBeTruthy();
  });

  it("fires a gesture through Gesture Handler's Jest utilities", async () => {
    const onTap = jest.fn();
    await render(
      <GestureHandlerRootView>
        <Tappable onTap={onTap} />
      </GestureHandlerRootView>,
    );

    fireGestureHandler(getByGestureTestId("tap"));

    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("evaluates Reanimated animated styles", async () => {
    await render(<Faded />);

    expect(screen.getByTestId("faded")).toHaveStyle({ opacity: 0.5 });
  });

  it("runs the Skia API on CanvasKit", () => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, 10, 10));
    const paint = Skia.Paint();
    paint.setColor(Skia.Color("black"));
    canvas.drawRect(Skia.XYWHRect(0, 0, 10, 10), paint);
    const picture = recorder.finishRecordingAsPicture();
    expect(picture.serialize()?.byteLength).toBeGreaterThan(0);
  });
});
