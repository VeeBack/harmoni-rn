import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { Text } from "@/ui/Text";

function hash(name: string) {
  let h = 2166136261;
  const s = name.toLowerCase();
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h % 360}, ${s}%, ${l}%, ${a})`;

/** The generated Spice cover: two hues from the name, blurred covers, a tint and the label. */
export const SpiceArt = memo(function SpiceArt({ name, covers = [], label = true, clearRight = false }: { name: string; covers?: string[]; label?: boolean; clearRight?: boolean }) {
  const [w, setW] = useState(0);
  const h = hash(name);
  const A = h % 360;
  const B = A + 40 + ((h >>> 9) % 90);
  const id = `s${h}`;
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden", backgroundColor: hsl(A, 45, 16) }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id={`${id}a`} cx="22%" cy="18%" r="58%">
            <Stop offset="0" stopColor={hsl(A, 85, 62)} />
            <Stop offset="1" stopColor={hsl(A, 85, 62)} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}b`} cx="85%" cy="90%" r="60%">
            <Stop offset="0" stopColor={hsl(B, 80, 52)} />
            <Stop offset="1" stopColor={hsl(B, 80, 52)} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id}a)`} />
        <Rect width="100%" height="100%" fill={`url(#${id}b)`} />
      </Svg>
      {w > 0 && covers[0] ? (
        <View style={{ position: "absolute", left: -0.3 * w, top: -0.3 * w, width: 1.4 * w, height: 1.2 * w, opacity: 0.85, filter: [{ blur: w * 0.14 }, { saturate: 1.7 }] } as object}>
          <Image source={{ uri: covers[0] }} blurRadius={6} style={StyleSheet.absoluteFill} contentFit="cover" />
        </View>
      ) : null}
      {w > 0 && covers[1] ? (
        <View style={{ position: "absolute", left: 0.25 * w, top: 0.3 * w, width: 1.05 * w, height: 1.0 * w, opacity: 0.6, filter: [{ blur: w * 0.14 }, { saturate: 1.7 }] } as object}>
          <Image source={{ uri: covers[1] }} blurRadius={6} style={StyleSheet.absoluteFill} contentFit="cover" />
        </View>
      ) : null}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id={`${id}c`} cx="18%" cy="12%" r="55%">
            <Stop offset="0" stopColor={hsl(A, 90, 65)} stopOpacity={0.45} />
            <Stop offset="1" stopColor={hsl(A, 90, 65)} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}d`} cx="90%" cy="85%" r="55%">
            <Stop offset="0" stopColor={hsl(B, 85, 55)} stopOpacity={0.4} />
            <Stop offset="1" stopColor={hsl(B, 85, 55)} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id}c)`} />
        <Rect width="100%" height="100%" fill={`url(#${id}d)`} />
      </Svg>
      <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.45)"]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
      {label && w > 0 ? (
        <View style={{ position: "absolute", left: w * 0.08, right: clearRight ? w * 0.28 : w * 0.08, bottom: w * 0.07, gap: w * 0.015 }}>
          <Text size={Math.max(8, w * 0.055)} weight={700} color="rgba(255,255,255,0.85)" style={{ letterSpacing: Math.max(8, w * 0.055) * 0.24, lineHeight: Math.max(8, w * 0.055) * 1.2 }}>
            SPICE
          </Text>
          <Text
            size={Math.max(13, w * 0.13)}
            weight={700}
            color="#fff"
            numberOfLines={3}
            style={{ lineHeight: Math.max(13, w * 0.13) * 0.98 + 1, letterSpacing: -Math.max(13, w * 0.13) * 0.03, textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 12, textShadowOffset: { width: 0, height: 1 } }}
          >
            {name}
          </Text>
        </View>
      ) : null}
    </View>
  );
});
