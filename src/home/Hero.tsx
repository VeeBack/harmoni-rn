import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { sized } from "@/lib/art";
import { useArtworkColors } from "@/player/hooks";
import { SpiceArt } from "@/spice/SpiceArt";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Kicker, Text } from "@/ui/Text";
import { colors, radius, spring } from "@/ui/theme";

const GRAIN = require("../../assets/images/grain.png");

/**
 * Home's hero, as the web draws it: the cover's colour in two washes (deep
 * across the card, bright where the covers are) under fine grain, a fan of
 * covers, and one big play. The card opens what it's about; its buttons play
 * it right here.
 */
export function Hero({
  kicker,
  title,
  text,
  covers,
  spiceName,
  actions,
  onPress,
  onLongPress,
}: {
  kicker: string;
  title: string;
  text: ReactNode;
  covers: string[];
  /** A Spice with nothing in it yet: its own cover stands in for the fan. */
  spiceName?: string;
  actions: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const theme = useArtworkColors(covers[0] ? sized(covers[0], 256) : undefined);
  // The fan opens as the card arrives, and spreads a little more while held.
  const spread = useSharedValue(0);
  const held = useSharedValue(0);
  const shown = useSharedValue(0);
  useEffect(() => {
    spread.value = withDelay(120, withSpring(1, spring.bouncy));
  }, [spread]);
  useEffect(() => {
    shown.value = withTiming(theme ? 1 : 0, { duration: 720 });
  }, [theme, shown]);
  const wash = useAnimatedStyle(() => ({ opacity: shown.value }));
  const hasArt = covers.length > 0 || !!spiceName;
  return (
    <Press
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => (held.value = withSpring(1, spring.snappy))}
      onPressOut={() => (held.value = withSpring(0, spring.smooth))}
      feedback={onPress ? "tap" : false}
      scaleTo={0.985}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={title}
      style={styles.card}
    >
      <Animated.View style={[StyleSheet.absoluteFill, wash]}>
        <Wash color={theme?.color ?? "#444"} deep={theme?.deep ?? colors.surface3} />
      </Animated.View>
      <Image source={GRAIN} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} contentFit="cover" />
      {hasArt ? <Fan covers={covers} spiceName={spiceName} spread={spread} held={held} /> : null}
      <View style={[styles.body, !hasArt && { paddingTop: 40 }]}>
        <Kicker color="rgba(255,255,255,0.72)">{kicker}</Kicker>
        <Text variant="display" color="#fff" numberOfLines={2} style={title.length > 16 ? { fontSize: 28, lineHeight: 31 } : null}>
          {title}
        </Text>
        <Text variant="subhead" color="rgba(255,255,255,0.74)" numberOfLines={3}>
          {text}
        </Text>
        <View style={styles.actions}>{actions}</View>
      </View>
    </Press>
  );
}

/** The cover's colour, deep across the card and bright up top where the covers sit. */
function Wash({ color, deep }: { color: string; deep: string }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[deep, darken(deep)]} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="heroGlow" cx="70%" cy="12%" rx="95%" ry="70%">
            <Stop offset="0" stopColor={color} stopOpacity={0.85} />
            <Stop offset="0.7" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroGlow)" />
      </Svg>
    </View>
  );
}

/** A colour 30% of the way to black, for the bottom of the wash. */
function darken(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#000";
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.7));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

const FAN = [
  { x: 0, rotate: 0, scale: 1, dim: 0 },
  { x: -0.24, rotate: -9, scale: 0.88, dim: 0.22 },
  { x: 0.24, rotate: 9, scale: 0.88, dim: 0.32 },
];

/** Three covers fanned like records pulled from a shelf, the first in front. */
function Fan({
  covers,
  spiceName,
  spread,
  held,
}: {
  covers: string[];
  spiceName?: string;
  spread: SharedValue<number>;
  held: SharedValue<number>;
}) {
  const { width } = useWindowDimensions();
  const size = Math.round(Math.min(220, (width - 40) * 0.46));
  const shown = covers.slice(0, 3);
  return (
    <View style={{ width: size, height: size, alignSelf: "center", marginTop: 32, marginBottom: 8 }}>
      {shown.length ? (
        shown.map((src, i) => <FanCover key={`${src}-${i}`} at={i} size={size} src={src} spread={spread} held={held} />).reverse()
      ) : (
        <FanCover at={0} size={size} spiceName={spiceName} spread={spread} held={held} />
      )}
    </View>
  );
}

function FanCover({
  at,
  size,
  src,
  spiceName,
  spread,
  held,
}: {
  at: number;
  size: number;
  src?: string;
  spiceName?: string;
  spread: SharedValue<number>;
  held: SharedValue<number>;
}) {
  const f = FAN[at];
  const style = useAnimatedStyle(() => {
    // Held, the back covers lean out further and the front one lifts.
    const more = 1 + held.value * 0.42;
    return {
      transform: [
        { translateY: at === 0 ? -4 * held.value : 0 },
        { translateX: f.x * size * spread.value * more },
        { rotate: `${f.rotate * spread.value * (1 + held.value * 0.33)}deg` },
        { scale: interpolate(spread.value, [0, 1], [1, f.scale]) * (at === 0 ? 1 + held.value * 0.02 : 1) },
      ],
    };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.cover, style]}>
      {src ? (
        <Image
          source={{ uri: sized(src, size * 3) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
      ) : (
        <SpiceArt name={spiceName ?? ""} label={false} />
      )}
      {f.dim ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${f.dim})` }]} /> : null}
    </Animated.View>
  );
}

/** The glass pill beside the hero's play button. */
export function HeroPill({ label, icon, onPress }: { label: string; icon: "shuffle" | "search"; onPress: () => void }) {
  return (
    <Press onPress={onPress} scaleTo={0.96} accessibilityLabel={label} style={styles.pill}>
      <Icon name={icon} size={16} color="#fff" />
      <Text variant="footnote" weight={600} color="#fff">
        {label}
      </Text>
    </Press>
  );
}

export function HeroSkeletonShape() {
  return <View style={[styles.card, { height: 440, backgroundColor: colors.surface2 }]} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.surface2,
    elevation: 10,
    shadowColor: "#000",
  },
  body: { paddingTop: 18, paddingHorizontal: 22, paddingBottom: 22, gap: 6 },
  actions: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  cover: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface3,
    elevation: 14,
    shadowColor: "#000",
  },
  pill: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.glass,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
