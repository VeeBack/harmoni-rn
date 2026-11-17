import { Image } from "expo-image";
import { memo, useEffect, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, interpolateColor } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import type { ArtworkColors } from "harmoni-player";
import { sized } from "@/ui/Artwork";

/**
 * The living backdrop: the cover's colour, with three huge blurred copies of
 * the cover turning and drifting slowly, under a soft veil. New songs fade in
 * over the old one.
 */
export const Backdrop = memo(function Backdrop({ art, theme }: { art?: string; theme: ArtworkColors | null }) {
  const [layers, setLayers] = useState<{ key: string; art: string }[]>([]);
  useEffect(() => {
    if (!art) return;
    setLayers((l) => (l[l.length - 1]?.art === art ? l : [...l.slice(-1), { key: `${art}:${Date.now()}`, art }]));
  }, [art]);

  const base = useSharedValue(0);
  const from = useSharedValue("#2a2a2a");
  const to = useSharedValue("#2a2a2a");
  useEffect(() => {
    from.value = to.value;
    to.value = theme?.color ?? "#2a2a2a";
    base.value = 0;
    base.value = withTiming(1, { duration: 1200, easing: Easing.bezier(0.2, 0.7, 0.2, 1) });
  }, [theme, base, from, to]);
  const baseStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(base.value, [0, 1], [from.value, to.value]) }));

  const dark = theme?.light ? [0.32, 0.58] : [0.04, 0.32];
  return (
    <Animated.View style={[StyleSheet.absoluteFill, baseStyle]} pointerEvents="none">
      {layers.map((l) => (
        <Animated.View key={l.key} entering={FadeIn.duration(1400)} exiting={FadeOut.duration(1400)} style={StyleSheet.absoluteFill}>
          <Blobs art={l.art} />
        </Animated.View>
      ))}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="veil" cx="25%" cy="20%" rx="140%" ry="110%">
            <Stop offset="0" stopColor="#000" stopOpacity={dark[0]} />
            <Stop offset="1" stopColor="#000" stopOpacity={dark[1]} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#veil)" />
      </Svg>
    </Animated.View>
  );
});

function Blobs({ art }: { art: string }) {
  const { width, height } = useWindowDimensions();
  const vmax = Math.max(width, height) / 100;
  const t1 = useSharedValue(0);
  const t2 = useSharedValue(0);
  const t3 = useSharedValue(0);
  useEffect(() => {
    t1.value = withRepeat(withTiming(1, { duration: 46000, easing: Easing.linear }), -1, false);
    t2.value = withRepeat(withTiming(1, { duration: 62000, easing: Easing.linear }), -1, false);
    t3.value = withRepeat(withSequence(withTiming(1, { duration: 28000, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 28000, easing: Easing.inOut(Easing.ease) })), -1, false);
  }, [t1, t2, t3]);
  const turn = (t: number, reverse = false) => {
    "worklet";
    const scale = 1 + 0.12 * Math.sin(Math.PI * t);
    return [{ rotate: `${(reverse ? -360 : 360) * t}deg` }, { scale }];
  };
  const s1 = useAnimatedStyle(() => ({ transform: turn(t1.value) }));
  const s2 = useAnimatedStyle(() => ({ transform: turn(t2.value, true) }));
  const s3 = useAnimatedStyle(() => ({
    transform: [
      { translateX: (-6 + 14 * t3.value) * vmax },
      { translateY: (-4 + 10 * t3.value) * vmax },
      { rotate: `${-20 + 55 * t3.value}deg` },
    ],
  }));
  const src = { uri: sized(art, 200) };
  // Android 12+ blurs the whole circle (soft edges); the image is also pre-blurred for older phones.
  const blur = { filter: [{ blur: 60 }, { saturate: 1.8 }] } as object;
  const big = 80 * vmax;
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <Animated.View style={[{ position: "absolute", width: big, height: big, top: -32 * vmax, left: -24 * vmax, borderRadius: big / 2, overflow: "hidden" }, blur, s1]}>
        <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={12} />
      </Animated.View>
      <Animated.View style={[{ position: "absolute", width: big, height: big, right: -30 * vmax, bottom: -38 * vmax, borderRadius: big / 2, overflow: "hidden", opacity: 0.9 }, blur, s2]}>
        <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={12} />
      </Animated.View>
      <Animated.View style={[{ position: "absolute", width: 56 * vmax, height: 56 * vmax, top: height * 0.12, left: width * 0.28, borderRadius: 28 * vmax, overflow: "hidden", opacity: 0.6 }, blur, s3]}>
        <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={12} />
      </Animated.View>
    </View>
  );
}
