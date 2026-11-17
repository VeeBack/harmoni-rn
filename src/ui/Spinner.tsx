import { useEffect } from "react";
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";

import { colors } from "./theme";

const ALine = Animated.createAnimatedComponent(Line);

/** Harmoni's spinner: eight spokes fading round, like Apple's. */
export function Spinner({ size = 24, color = colors.text }: { size?: number; color?: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, false);
  }, [t]);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {Array.from({ length: 8 }, (_, i) => (
        <Spoke key={i} i={i} t={t} color={color} />
      ))}
    </Svg>
  );
}

function Spoke({ i, t, color }: { i: number; t: SharedValue<number>; color: string }) {
  const props = useAnimatedProps(() => {
    // Each spoke is brightest when the sweep passes it, then fades to 0.25.
    const phase = (t.value - i / 8 + 1) % 1;
    return { strokeOpacity: 1 - 0.75 * phase };
  });
  return (
    <ALine
      x1={12}
      y1={3.5}
      x2={12}
      y2={7.5}
      stroke={color}
      strokeWidth={2.6}
      strokeLinecap="round"
      transform={`rotate(${i * 45} 12 12)`}
      animatedProps={props}
    />
  );
}
