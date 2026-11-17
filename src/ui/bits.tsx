import { LinearGradient } from "expo-linear-gradient";
import { useEffect, type ReactNode } from "react";
import { View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { haptic } from "@/lib/haptics";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Press } from "./Press";
import { Spinner } from "./Spinner";
import { Text } from "./Text";
import { colors, radius } from "./theme";

export function Section({ title, link, onLink, action, children, style }: { title: string; link?: string; onLink?: () => void; action?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: 32 }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <Text size={18} weight={600} style={{ letterSpacing: -0.18, flexShrink: 1 }} numberOfLines={1}>
          {title}
        </Text>
        {link && onLink ? (
          <Press onPress={onLink} feedback="tap" scaleTo={0.95} hitSlop={10}>
            <Text size={13} weight={500} color={colors.text2}>
              {link}
            </Text>
          </Press>
        ) : null}
        {action}
      </View>
      {children}
    </View>
  );
}

export function EmptyState({ title, body, action, onAction, icon }: { title: string; body?: string; action?: string; onAction?: () => void; icon?: IconName }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.borderStrong,
        borderRadius: radius.lg,
        paddingVertical: 28,
        paddingHorizontal: 22,
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      {icon ? <Icon name={icon} size={28} color={colors.text3} /> : null}
      <Text size={18} weight={600}>
        {title}
      </Text>
      {body ? (
        <Text color={colors.text2} style={{ lineHeight: 21 }}>
          {body}
        </Text>
      ) : null}
      {action && onAction ? <Button label={action} onPress={onAction} size="md" style={{ marginTop: 4 }} /> : null}
    </View>
  );
}

/** Shimmering placeholder, like the web's skeletons. */
export function Skeleton({ width = "100%", height = 14, radius: r = 8, style, round }: { width?: DimensionValue; height?: DimensionValue; radius?: number; style?: StyleProp<ViewStyle>; round?: boolean }) {
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
  }, [x]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: `${-100 + x.value * 200}%` as unknown as number }] }));
  return (
    <View style={[{ width, height, borderRadius: round ? 9999 : r, backgroundColor: colors.surface2, overflow: "hidden" }, style]}>
      <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }, anim]}>
        <LinearGradient colors={[colors.surface2, colors.surface3, colors.surface2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}

export function SongRowsSkeleton({ n = 5 }: { n?: number }) {
  const widths = ["46%", "62%", "38%", "54%", "44%", "58%", "40%"] as const;
  return (
    <View style={{ gap: 14 }}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Skeleton width={44} height={44} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={widths[i % widths.length]} height={13} />
            <Skeleton width="30%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** The 48px cream play button. */
export function PlayButton({ playing, loading, onPress, size = 48, bg = colors.accent, fg = colors.accentInk, label }: { playing?: boolean; loading?: boolean; onPress: () => void; size?: number; bg?: string; fg?: string; label?: string }) {
  return (
    <Press
      onPress={onPress}
      feedback={playing ? "toggleOff" : "toggleOn"}
      scaleTo={0.94}
      accessibilityLabel={loading ? "Loading" : playing ? "Pause" : (label ?? "Play")}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000" }}
    >
      {loading ? <Spinner size={size * 0.46} color={fg} /> : <Icon name={playing ? "pause" : "play"} size={size * 0.46} color={fg} />}
    </Press>
  );
}

export function ExplicitBadge() {
  return (
    <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" }}>
      <Text size={10} weight={700} color={colors.text2} style={{ lineHeight: 12 }}>
        E
      </Text>
    </View>
  );
}

export function SmallButton({ label, icon, onPress, accessibilityLabel }: { label: string; icon?: IconName; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      scaleTo={0.95}
      style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface3, flexDirection: "row", alignItems: "center", gap: 6 }}
    >
      {icon ? <Icon name={icon} size={16} color={colors.text} /> : null}
      <Text size={13} weight={500}>
        {label}
      </Text>
    </Press>
  );
}

export function Switch({ value, onChange, light }: { value: boolean; onChange: (v: boolean) => void; light?: boolean }) {
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.value = withTiming(value ? 1 : 0, { duration: 140 });
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 20 }] }));
  const trackOn = light ? "rgba(255,255,255,0.92)" : colors.accent;
  const trackOff = light ? "rgba(255,255,255,0.18)" : colors.surface3;
  const knobOn = light ? "rgba(0,0,0,0.75)" : colors.accentInk;
  const knobOff = light ? "rgba(255,255,255,0.9)" : colors.text2;
  return (
    <Press
      onPress={() => {
        if (value) haptic.toggleOff();
        else haptic.toggleOn();
        onChange(!value);
      }}
      feedback={false}
      scaleTo={0.94}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={{ width: 46, height: 26, borderRadius: 13, backgroundColor: value ? trackOn : trackOff, justifyContent: "center" }}
    >
      <Animated.View style={[{ width: 20, height: 20, borderRadius: 10, marginLeft: 3, backgroundColor: value ? knobOn : knobOff }, knob]} />
    </Press>
  );
}

export function CenterSpinner() {
  return (
    <View style={{ paddingVertical: 48, alignItems: "center" }}>
      <Spinner size={28} color={colors.text2} />
    </View>
  );
}
