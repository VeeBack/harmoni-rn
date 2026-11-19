import { Canvas, Group, LinearGradient, RadialGradient, Rect, Skia, vec, Path } from "@shopify/react-native-skia";
import { Image } from "expo-image";
import { LinearGradient as Fade } from "expo-linear-gradient";
import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import type { ProfileBanner } from "@/api/types";
import { colors } from "@/ui/theme";
import { mediaUrl } from "./Avatar";
import { alpha, shift } from "./style";

/** Where a CSS `linear-gradient(<deg>deg, …)` starts and ends in a w×h box. */
function cssLine(deg: number, w: number, h: number) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  return { start: vec(w / 2 - (dx * len) / 2, h / 2 - (dy * len) / 2), end: vec(w / 2 + (dx * len) / 2, h / 2 + (dy * len) / 2) };
}

/**
 * A profile banner: the web app's presets, drawn from the person's colour with
 * Skia, or their photo. It melts into the page at the bottom.
 */
export const Banner = memo(function Banner({
  kind,
  accent,
  url,
  width,
  height,
  fade = true,
}: {
  kind: ProfileBanner | undefined;
  accent: string;
  url?: string;
  width: number;
  height: number;
  fade?: boolean;
}) {
  const photo = kind === "image" ? mediaUrl(url) : undefined;
  return (
    <View style={{ width, height, overflow: "hidden", backgroundColor: "#141414" }}>
      {photo ? (
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" />
      ) : (
        <Preset kind={kind === "image" ? "glow" : (kind ?? "glow")} accent={accent} w={width} h={height} />
      )}
      {fade ? (
        <Fade
          colors={["rgba(12,11,10,0)", colors.bg]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: height * 0.45 }}
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
});

function Preset({ kind, accent: a, w, h }: { kind: Exclude<ProfileBanner, "image">; accent: string; w: number; h: number }) {
  const stripes = useMemo(() => {
    if (kind !== "stripes") return null;
    // repeating-linear-gradient(-45deg, accent 0 18px, transparent 18px 36px)
    const p = Skia.PathBuilder.Make();
    const step = 36 / Math.SQRT1_2 / 2; // 36px measured across the stripes
    for (let x = -h; x < w + h; x += step * 2) {
      p.moveTo(x, 0);
      p.lineTo(x + step, 0);
      p.lineTo(x + step + h, h);
      p.lineTo(x + h, h);
      p.close();
    }
    return p.detach();
  }, [kind, w, h]);

  const dots = useMemo(() => {
    if (kind !== "dots") return null;
    const p = Skia.PathBuilder.Make();
    for (let y = 0; y < h + 18; y += 18) for (let x = 0; x < w + 18; x += 18) p.addCircle(x + 9, y + 9, 1.7);
    return p.detach();
  }, [kind, w, h]);

  const grid = useMemo(() => {
    if (kind !== "grid") return null;
    const p = Skia.PathBuilder.Make();
    for (let x = 0; x <= w; x += 28) p.addRect(Skia.XYWHRect(x, 0, 1, h));
    for (let y = 0; y <= h; y += 28) p.addRect(Skia.XYWHRect(0, y, w, 1));
    return p.detach();
  }, [kind, w, h]);

  const R = Math.max(w, h);
  return (
    <Canvas style={{ width: w, height: h }}>
      {kind === "plain" ? <Rect x={0} y={0} width={w} height={h} color={a} /> : null}

      {kind === "glow" ? (
        <>
          <Rect x={0} y={0} width={w} height={h}>
            <LinearGradient {...cssLine(180, w, h)} colors={[alpha(a, 0.33), "#141414"]} />
          </Rect>
          <Group transform={[{ translateX: w * 0.2 }, { scaleX: (w * 0.9) / (h * 1.4) }, { translateX: -w * 0.2 }]}>
            <Rect x={-w} y={0} width={w * 3} height={h}>
              <RadialGradient c={vec(w * 0.2, 0)} r={h * 1.4} colors={[a, alpha(a, 0)]} positions={[0, 0.7]} />
            </Rect>
          </Group>
        </>
      ) : null}

      {kind === "aurora" ? (
        <>
          <Rect x={0} y={0} width={w} height={h} color="#141414" />
          <Rect x={0} y={0} width={w} height={h}>
            <RadialGradient c={vec(w * 0.15, h * 0.1)} r={R * 0.6} colors={[alpha(a, 0.8), alpha(a, 0)]} positions={[0, 0.6]} />
          </Rect>
          <Rect x={0} y={0} width={w} height={h}>
            <RadialGradient
              c={vec(w * 0.85, h * 0.3)}
              r={R * 0.5}
              colors={[alpha(shift(a, 60), 0.67), alpha(shift(a, 60), 0)]}
              positions={[0, 0.6]}
            />
          </Rect>
          <Rect x={0} y={0} width={w} height={h}>
            <RadialGradient
              c={vec(w * 0.5, h * 1.2)}
              r={R * 0.7}
              colors={[alpha(shift(a, -50), 0.6), alpha(shift(a, -50), 0)]}
              positions={[0, 0.6]}
            />
          </Rect>
        </>
      ) : null}

      {kind === "sunset" ? (
        <Rect x={0} y={0} width={w} height={h}>
          <LinearGradient {...cssLine(160, w, h)} colors={[a, shift(a, 35), "#1a1218"]} positions={[0, 0.45, 1]} />
        </Rect>
      ) : null}

      {kind === "tide" ? (
        <Rect x={0} y={0} width={w} height={h}>
          <LinearGradient {...cssLine(200, w, h)} colors={[shift(a, -40), alpha(a, 0.53), "#0e1418"]} positions={[0, 0.5, 1]} />
        </Rect>
      ) : null}

      {kind === "stripes" && stripes ? (
        <>
          <Rect x={0} y={0} width={w} height={h}>
            <LinearGradient {...cssLine(180, w, h)} colors={[alpha(a, 0.2), "#151515"]} />
          </Rect>
          <Path path={stripes} color={alpha(a, 0.33)} />
        </>
      ) : null}

      {kind === "dots" && dots ? (
        <>
          <Rect x={0} y={0} width={w} height={h}>
            <LinearGradient {...cssLine(160, w, h)} colors={[alpha(a, 0.27), "#141414"]} />
          </Rect>
          <Path path={dots} color={alpha(a, 0.53)} />
        </>
      ) : null}

      {kind === "grid" && grid ? (
        <>
          <Rect x={0} y={0} width={w} height={h}>
            <LinearGradient {...cssLine(180, w, h)} colors={[alpha(a, 0.33), "#141414"]} />
          </Rect>
          <Path path={grid} color={alpha(a, 0.2)} />
        </>
      ) : null}
    </Canvas>
  );
}
