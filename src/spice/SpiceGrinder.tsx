import {
  BlurMask,
  Canvas,
  Group,
  ImageShader,
  LinearGradient,
  Points,
  RadialGradient,
  RoundedRect,
  Skia,
  useImage,
  vec,
  type SkPoint,
} from "@shopify/react-native-skia";
import { useEffect, useMemo } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";

function hash(s: string) {
  let h = 2166136261;
  const t = s.toLowerCase();
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return h >>> 0;
}

const N = 900;
/** Three tones × three brightnesses. */
const LAYERS = 9;
const GRAIN = require("../../assets/images/grain.png");

type Sim = {
  x: number[];
  y: number[];
  vx: number[];
  vy: number[];
  /** How far above the floor this grain settles: the grains make a bed. */
  bed: number[];
  /** Shimmer speed and phase. */
  sp: number[];
  ph: number[];
  /** A glint in progress: time left and its length; 0 when not glinting. */
  gt: number[];
  gd: number[];
  gs: number[];
  t: number;
  toss: number;
};

/**
 * Your Spice being made: a jar of fine glitter, shaken. Physics on the UI thread
 * (gravity, a swing, bounces, tosses out of a settled bed); every fleck shimmers
 * at its own pace like noise, now and then one catches the light in an eight-point
 * glint that swells and fades, and film grain crawls over it all. Skia, in colours
 * from the Spice's name.
 */
export function SpiceGrinder({ size, seed }: { size: number; seed: string }) {
  const h = hash(seed || "spice");
  const A = h % 360;
  const B = (A + 40 + ((h >>> 9) % 90)) % 360;
  const pad = size * 0.04;
  const min = pad;
  const max = size - pad;
  const noise = useImage(GRAIN);
  const r = size * 0.045;
  const clip = useMemo(() => Skia.RRectXY(Skia.XYWHRect(0, 0, size, size), r, r), [size, r]);

  const sim = useSharedValue<Sim | null>(null);
  const layers = useSharedValue<SkPoint[][]>([]);
  const sparks = useSharedValue<SkPoint[]>([]);
  const glints = useSharedValue<SkPoint[]>([]);
  const nx = useSharedValue(0);
  const ny = useSharedValue(0);

  useFrameCallback((f) => {
    "worklet";
    const dt = Math.min(0.033, (f.timeSincePreviousFrame ?? 16) / 1000);
    let s = sim.value;
    if (!s || s.x.length !== N) {
      s = { x: [], y: [], vx: [], vy: [], bed: [], sp: [], ph: [], gt: [], gd: [], gs: [], t: 0, toss: 0.4 };
      for (let i = 0; i < N; i++) {
        const u = Math.random();
        s.bed.push(u * u * size * 0.16);
        s.x.push(min + Math.random() * (max - min));
        s.y.push(max - s.bed[i] - Math.random() * size * 0.5);
        s.vx.push(0);
        s.vy.push(0);
        s.sp.push(3 + Math.random() * 14);
        s.ph.push(Math.random() * Math.PI * 2);
        s.gt.push(0);
        s.gd.push(0);
        s.gs.push(0);
      }
    }
    s.t += dt;
    s.toss -= dt;
    const w = Math.PI * 2 * 2.2;
    const pull = size * 0.022 * w * w * Math.sin(w * s.t);
    const g = size * 5;
    const tossing = s.toss <= 0;
    if (tossing) s.toss = 0.45 + Math.random() * 0.6;
    const mid = size / 2;

    const out: SkPoint[][] = [];
    for (let k = 0; k < LAYERS; k++) out.push([]);
    const sp: SkPoint[] = [];
    const gl: SkPoint[] = [];
    for (let i = 0; i < N; i++) {
      s.vx[i] += (pull + (Math.random() - 0.5) * size * 6) * dt;
      s.vy[i] += g * dt;
      // The bed is a mound, higher in the middle.
      const dx = (s.x[i] - mid) / mid;
      const floor = max - s.bed[i] * (1 - dx * dx * 0.55);
      if (tossing && s.y[i] > floor - size * 0.05) s.vy[i] -= size * (0.7 + Math.random() * 1.7);
      s.x[i] += s.vx[i] * dt;
      s.y[i] += s.vy[i] * dt;
      if (s.x[i] < min) {
        s.x[i] = min;
        s.vx[i] = -s.vx[i] * 0.5;
      } else if (s.x[i] > max) {
        s.x[i] = max;
        s.vx[i] = -s.vx[i] * 0.5;
      }
      if (s.y[i] > floor) {
        s.y[i] = floor;
        s.vy[i] = -s.vy[i] * 0.25;
        s.vx[i] *= 0.82;
      } else if (s.y[i] < min) {
        s.y[i] = min;
        s.vy[i] = Math.abs(s.vy[i]) * 0.3;
      }
      const px = s.x[i];
      const py = s.y[i];
      const speed = Math.abs(s.vx[i]) + Math.abs(s.vy[i]);

      // Now and then a fleck catches the light; flying ones more often.
      if (s.gt[i] <= 0 && Math.random() < dt * 0.014 * (1 + Math.min(4, speed / (size * 1.5)))) {
        s.gd[i] = 0.28 + Math.random() * 0.3;
        s.gt[i] = s.gd[i];
        s.gs[i] = 0.55 + Math.random() * 0.6;
      }
      if (s.gt[i] > 0) {
        s.gt[i] -= dt;
        const e = Math.sin(Math.PI * (1 - Math.max(0, s.gt[i]) / s.gd[i]));
        const a = size * 0.034 * s.gs[i] * e;
        const d = a * 0.32;
        gl.push(vec(px - a, py), vec(px + a, py), vec(px, py - a * 0.8), vec(px, py + a * 0.8));
        gl.push(vec(px - d, py - d), vec(px + d, py + d), vec(px - d, py + d), vec(px + d, py - d));
        sp.push(vec(px, py));
        continue;
      }

      // Every fleck shimmers: a fast twinkle of its own, plus flicker when it moves.
      const tw = 0.5 + 0.5 * Math.sin(s.t * s.sp[i] + s.ph[i]) + (speed > size * 0.4 ? (Math.random() - 0.5) * 0.6 : 0);
      if (tw > 0.993) {
        sp.push(vec(px, py));
        continue;
      }
      const level = tw > 0.72 ? 2 : tw > 0.38 ? 1 : 0;
      out[(i % 3) * 3 + level].push(vec(px, py));
    }
    sim.value = s;
    layers.value = out;
    sparks.value = sp;
    glints.value = gl;
    // Film grain: the noise jumps every frame.
    nx.value = Math.floor(Math.random() * 256);
    ny.value = Math.floor(Math.random() * 256);
  });

  const noiseT = useDerivedValue(() => [{ translateX: -nx.value }, { translateY: -ny.value }]);
  const fine = size * 0.0062;
  const tones = [`hsl(${A}, 85%, 68%)`, `hsl(${B}, 80%, 62%)`, `hsl(${(A + 25) % 360}, 95%, 82%)`];

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group clip={clip}>
        <RoundedRect x={0} y={0} width={size} height={size} r={r}>
          <LinearGradient start={vec(0, 0)} end={vec(size, size)} colors={[`hsl(${A}, 38%, 13%)`, `hsl(${B}, 32%, 7%)`]} />
        </RoundedRect>
        {/* A low glow where the glitter lies. */}
        <RoundedRect x={0} y={0} width={size} height={size} r={r} opacity={0.5}>
          <RadialGradient
            c={vec(size / 2, size * 0.95)}
            r={size * 0.7}
            colors={[`hsla(${A}, 70%, 45%, 0.55)`, `hsla(${A}, 70%, 45%, 0)`]}
          />
        </RoundedRect>

        {[0, 1, 2].map((tone) =>
          [0, 1, 2].map((level) => (
            <Layer
              key={`${tone}${level}`}
              layers={layers}
              k={tone * 3 + level}
              color={tones[tone]}
              width={fine * (tone === 2 ? 0.8 : 1)}
              opacity={[0.28, 0.6, 1][level]}
            />
          )),
        )}

        {/* Flecks at their brightest, with a soft halo. */}
        <Points points={sparks} mode="points" color="#fff6e6" style="stroke" strokeWidth={size * 0.02} strokeCap="round" opacity={0.38}>
          <BlurMask blur={size * 0.01} style="normal" />
        </Points>
        <Points points={sparks} mode="points" color="#ffffff" style="stroke" strokeWidth={fine * 1.3} strokeCap="round" />
        {/* Glints. */}
        <Points points={glints} mode="lines" color="#ffffff" style="stroke" strokeWidth={size * 0.0032} strokeCap="round">
          <BlurMask blur={size * 0.003} style="solid" />
        </Points>

        {/* Crawling film grain over everything. */}
        {noise ? (
          <Group transform={noiseT}>
            <RoundedRect x={0} y={0} width={size + 256} height={size + 256} r={0} opacity={0.14} blendMode="screen">
              <ImageShader image={noise} tx="repeat" ty="repeat" />
            </RoundedRect>
          </Group>
        ) : null}
      </Group>
    </Canvas>
  );
}

function Layer({
  layers,
  k,
  color,
  width,
  opacity,
}: {
  layers: SharedValue<SkPoint[][]>;
  k: number;
  color: string;
  width: number;
  opacity: number;
}) {
  const points = useDerivedValue(() => layers.value[k] ?? []);
  return <Points points={points} mode="points" color={color} style="stroke" strokeWidth={width} strokeCap="round" opacity={opacity} />;
}

/** The grinder's words, for a Spice page that's still being made. */
export function GrindingNote({ body = "Finding songs that go with the ones you picked." }: { body?: string }) {
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: 0.55 + o.value * 0.45 }));
  return (
    <View style={{ alignItems: "center", gap: 4, paddingVertical: 8 }}>
      <Animated.View style={style}>
        <Text variant="headline" align="center">
          Grinding your Spice…
        </Text>
      </Animated.View>
      <Text variant="subhead" color={colors.text2} align="center">
        {body}
      </Text>
    </View>
  );
}
