import { BlurMask, Canvas, Group, LinearGradient, Points, RoundedRect, vec, type SkPoint } from "@shopify/react-native-skia";
import { useEffect, useMemo } from "react";
import { View } from "react-native";
import Animated, { Easing, useDerivedValue, useFrameCallback, useSharedValue, withRepeat, withTiming, useAnimatedStyle } from "react-native-reanimated";

import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";

function hash(s: string) {
  let h = 2166136261;
  const t = s.toLowerCase();
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return h >>> 0;
}

const N = 240;

/**
 * Your Spice being made: grains of spice in a glass jar, shaken hard. Real
 * physics on the UI thread (gravity, the jar's swing, bounces off the walls,
 * a toss every so often), drawn by Skia. The colours come from the Spice's name,
 * like its cover will.
 */
export function SpiceGrinder({ size, seed }: { size: number; seed: string }) {
  const h = hash(seed || "spice");
  const A = h % 360;
  const B = (A + 40 + ((h >>> 9) % 90)) % 360;
  const pad = size * 0.07;
  const min = pad;
  const max = size - pad;

  // Grain state lives in plain arrays on the UI thread.
  const sim = useSharedValue<{ x: number[]; y: number[]; vx: number[]; vy: number[]; t: number; toss: number } | null>(null);
  const jar = useSharedValue(0);
  const ptsA = useSharedValue<SkPoint[]>([]);
  const ptsB = useSharedValue<SkPoint[]>([]);
  const ptsC = useSharedValue<SkPoint[]>([]);

  useFrameCallback((f) => {
    "worklet";
    const dt = Math.min(0.033, (f.timeSincePreviousFrame ?? 16) / 1000);
    let s = sim.value;
    if (!s || s.x.length !== N) {
      const x: number[] = [];
      const y: number[] = [];
      const vx: number[] = [];
      const vy: number[] = [];
      for (let i = 0; i < N; i++) {
        x.push(min + Math.random() * (max - min));
        y.push(max - Math.random() * (max - min) * 0.4);
        vx.push(0);
        vy.push(0);
      }
      s = { x, y, vx, vy, t: 0, toss: 0.6 };
    }
    s.t += dt;
    s.toss -= dt;
    // The jar swings side to side; the grains feel the opposite pull.
    const w = Math.PI * 2 * 2.6;
    const amp = size * 0.028;
    jar.value = amp * Math.sin(w * s.t);
    const pull = amp * w * w * Math.sin(w * s.t);
    const g = size * 6;
    const tossing = s.toss <= 0;
    if (tossing) s.toss = 0.55 + Math.random() * 0.5;
    for (let i = 0; i < N; i++) {
      s.vx[i] += (pull + (Math.random() - 0.5) * size * 4) * dt;
      s.vy[i] += g * dt;
      // A toss: grains near the bottom fly up, like a shaken grinder.
      if (tossing && s.y[i] > max - (max - min) * 0.35) s.vy[i] -= size * (1.1 + Math.random() * 1.7);
      s.x[i] += s.vx[i] * dt;
      s.y[i] += s.vy[i] * dt;
      if (s.x[i] < min) {
        s.x[i] = min;
        s.vx[i] = -s.vx[i] * 0.55;
      } else if (s.x[i] > max) {
        s.x[i] = max;
        s.vx[i] = -s.vx[i] * 0.55;
      }
      if (s.y[i] > max) {
        s.y[i] = max - Math.random() * 2;
        s.vy[i] = -s.vy[i] * 0.35;
        s.vx[i] *= 0.9;
      } else if (s.y[i] < min) {
        s.y[i] = min;
        s.vy[i] = Math.abs(s.vy[i]) * 0.3;
      }
    }
    sim.value = s;
    const a: SkPoint[] = [];
    const b: SkPoint[] = [];
    const c: SkPoint[] = [];
    const ox = jar.value;
    for (let i = 0; i < N; i++) {
      const p = vec(s.x[i] + ox, s.y[i]);
      if (i % 7 === 0) c.push(p);
      else if (i % 2 === 0) a.push(p);
      else b.push(p);
    }
    ptsA.value = a;
    ptsB.value = b;
    ptsC.value = c;
  });

  const jarX = useDerivedValue(() => [{ translateX: jar.value }]);
  const colorA = `hsl(${A}, 85%, 62%)`;
  const colorB = `hsl(${B}, 80%, 55%)`;

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={jarX}>
        <RoundedRect x={0} y={0} width={size} height={size} r={size * 0.045}>
          <LinearGradient start={vec(0, 0)} end={vec(size, size)} colors={[`hsla(${A}, 45%, 18%, 0.9)`, `hsla(${B}, 40%, 10%, 0.9)`]} />
        </RoundedRect>
        
      </Group>
      {/* Glow under the grains, then the grains themselves. */}
      <Points points={ptsA} mode="points" color={colorA} style="stroke" strokeWidth={size * 0.05} strokeCap="round" opacity={0.35}>
        <BlurMask blur={size * 0.03} style="normal" />
      </Points>
      <Points points={ptsA} mode="points" color={colorA} style="stroke" strokeWidth={size * 0.018} strokeCap="round" />
      <Points points={ptsB} mode="points" color={colorB} style="stroke" strokeWidth={size * 0.014} strokeCap="round" />
      <Points points={ptsC} mode="points" color="rgba(255,255,255,0.9)" style="stroke" strokeWidth={size * 0.009} strokeCap="round" />
    </Canvas>
  );
}

/** The grinder with its words, for a Spice page that's still being made. */
export function GrindingNote() {
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: 0.55 + o.value * 0.45 }));
  const lines = useMemo(() => ["Grinding your Spice…", "Finding songs that go with the ones you picked."], []);
  return (
    <View style={{ alignItems: "center", gap: 4, paddingVertical: 8 }}>
      <Animated.View style={style}>
        <Text variant="headline" align="center">
          {lines[0]}
        </Text>
      </Animated.View>
      <Text variant="subhead" color={colors.text2} align="center">
        {lines[1]}
      </Text>
    </View>
  );
}
