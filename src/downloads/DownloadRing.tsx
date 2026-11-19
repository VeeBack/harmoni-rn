import { memo, useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { colors } from "@/ui/theme";
import { useDownloadPercent, useDownloadState } from "./downloads";

const ACircle = Animated.createAnimatedComponent(Circle);

/**
 * A song's download, as a ring by its row (Apple Music): a dashed ring turning slowly while
 * it waits its turn, then a ring filling round from the top as it downloads. Nothing once
 * it's saved (the row's download mark takes over) or when it isn't downloading at all.
 */
export const DownloadRing = memo(function DownloadRing({ id, size = 20 }: { id: string; size?: number }) {
  const state = useDownloadState(id);
  if (state !== "queued" && state !== "downloading") return null;
  return state === "queued" ? <Waiting size={size} /> : <Filling id={id} size={size} />;
});

function geometry(size: number) {
  const stroke = Math.max(1.75, size / 11);
  const r = (size - stroke) / 2;
  return { stroke, r, c: 2 * Math.PI * r };
}

function Waiting({ size }: { size: number }) {
  const { stroke, r, c } = geometry(size);
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  return (
    <View accessibilityLabel="Waiting to download" style={{ width: size, height: size }}>
      <Animated.View style={spin}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.text3}
            strokeWidth={stroke}
            strokeDasharray={`${c / 16} ${c / 16}`}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

function Filling({ id, size }: { id: string; size: number }) {
  const percent = useDownloadPercent(id);
  const { stroke, r, c } = geometry(size);
  // Never quite empty, so a download that has just started still shows.
  const p = useSharedValue(Math.max(0.04, percent / 100));
  useEffect(() => {
    p.value = withTiming(Math.max(0.04, percent / 100), { duration: 450, easing: Easing.out(Easing.cubic) });
  }, [p, percent]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));
  return (
    <View accessibilityLabel={`Downloading, ${percent}%`} style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.text4} strokeWidth={stroke} fill="none" />
        <ACircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.tint}
          strokeWidth={stroke}
          strokeDasharray={`${c} ${c}`}
          strokeLinecap="round"
          fill="none"
          animatedProps={arc}
        />
      </Svg>
    </View>
  );
}
