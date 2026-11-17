import type { BottomTabBarProps } from "expo-router/js-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  FadeInDown,
  FadeOutDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/lib/haptics";
import { mix, useArtworkColors, usePlayback, usePlayingOn, useProgress } from "@/player/hooks";
import { player } from "@/player/player";
import { Artwork } from "@/ui/Artwork";
import { Icon, type IconName } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Spinner } from "@/ui/Spinner";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";
import { MINI, TABS } from "./layout";
import { openNowPlaying, scrollTabToTop, searchFocus, useNowPlaying } from "./state";

const TAB_META: Record<string, { label: string; icon: IconName; active: IconName }> = {
  "(home)": { label: "Home", icon: "home", active: "home-solid" },
  "(search)": { label: "Search", icon: "search", active: "search" },
  "(library)": { label: "Library", icon: "library", active: "library-solid" },
};

export function Dock({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { song } = usePlayback();
  return (
    <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: insets.bottom }]}>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(18,18,18,0)", "rgba(18,18,18,0.72)", "rgba(18,18,18,0.94)"]}
        locations={[0, 0.32, 0.7]}
        style={[StyleSheet.absoluteFill, { top: -36 }]}
      />
      {song ? <MiniPlayer /> : null}
      <View style={styles.tabs}>
        {state.routes.map((route, i) => {
          const meta = TAB_META[route.name];
          if (!meta) return null;
          const focused = state.index === i;
          return (
            <Tab
              key={route.key}
              label={meta.label}
              icon={focused ? meta.active : meta.icon}
              focused={focused}
              onPress={() => {
                const nested = (route as { state?: { index?: number } }).state;
                const atRoot = !nested?.index;
                const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (focused) {
                  // Reselect: the tab's stack pops to its root on tabPress; at the root, scroll up (or focus search).
                  haptic.tick();
                  if (atRoot) {
                    if (route.name === "(search)") searchFocus.current?.();
                    else scrollTabToTop(route.name);
                  }
                } else if (!event.defaultPrevented) {
                  haptic.select();
                  navigateToTab(route.key);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

const Tab = memo(function Tab({ label, icon, focused, onPress }: { label: string; icon: IconName; focused: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const on = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(focused ? 1 : 0, { duration: 140 });
  }, [focused, on]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const color = focused ? colors.text : colors.text3;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPressIn={() => (scale.value = withTiming(0.92, { duration: 140 }))}
      onPressOut={() => (scale.value = withSpring(1, { damping: 14, stiffness: 300 }))}
      onPress={onPress}
      style={styles.tab}
    >
      <Animated.View style={[{ alignItems: "center", gap: 3 }, style]}>
        <Icon name={icon} size={24} color={color} />
        <Text size={11} weight={500} color={color} style={{ letterSpacing: 0.1 }}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

function MiniPlayer() {
  const pb = usePlayback();
  const song = pb.song!;
  const playingOn = usePlayingOn();
  const theme = useArtworkColors(song.artworkUrl);
  const tint = useSharedValue(0);
  const prevBg = useSharedValue<string>(colors.surface3);
  const nextBg = useSharedValue<string>(colors.surface3);
  const npOpen = useNowPlaying((s) => s.open);

  useEffect(() => {
    const target = theme ? mix(theme.color, [36, 34, 32], 0.26, 0.78) : "rgba(46,46,46,0.95)";
    prevBg.value = nextBg.value;
    nextBg.value = target;
    tint.value = 0;
    tint.value = withTiming(1, { duration: 600 });
  }, [theme, prevBg, nextBg, tint]);

  const bgStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(tint.value, [0, 1], [prevBg.value, nextBg.value]) }));

  const dx = useSharedValue(0);
  const pressed = useSharedValue(1);
  const pan = Gesture.Pan()
    .minDistance(8)
    .onUpdate((e) => {
      if (Math.abs(e.translationX) > Math.abs(e.translationY)) dx.value = e.translationX * 0.35;
    })
    .onEnd((e) => {
      const horizontal = Math.abs(e.translationX) > Math.abs(e.translationY);
      if (!horizontal && e.translationY < -48) runOnJS(openNowPlaying)("art");
      else if (horizontal && e.translationX < -72) runOnJS(skip)(1);
      else if (horizontal && e.translationX > 72) runOnJS(skip)(-1);
      dx.value = withTiming(0, { duration: 260, easing: Easing.bezier(0.2, 0.7, 0.2, 1) });
    });
  const tap = Gesture.Tap()
    .maxDuration(400)
    .onBegin(() => (pressed.value = withTiming(0.985, { duration: 140 })))
    .onFinalize(() => (pressed.value = withSpring(1)))
    .onEnd(() => runOnJS(openNowPlaying)("art"));
  const gesture = Gesture.Exclusive(pan, tap);

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressed.value }] }));

  const artists = song.artists.map((a) => a.name).join(", ");
  return (
    <Animated.View entering={FadeInDown.duration(420).withInitialValues({ transform: [{ translateY: 16 }] } as never)} exiting={FadeOutDown.duration(220)} style={{ opacity: npOpen ? 0 : 1 }}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.mini, bgStyle, cardStyle]}>
          <Animated.View style={[{ flex: 1, flexDirection: "row", alignItems: "center", gap: 11 }, contentStyle]}>
            <View style={styles.miniArt}>
              <Artwork url={song.artworkUrl} size={42} radius={8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text weight={500} numberOfLines={1}>
                {song.title}
              </Text>
              {playingOn ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Icon name="link" size={13} color={colors.accent} />
                  <Text size={13} weight={500} color={colors.accent} numberOfLines={1} style={{ flex: 1 }}>
                    Playing on {playingOn}
                  </Text>
                </View>
              ) : (
                <Text size={13} color="rgba(255,255,255,0.62)" numberOfLines={1}>
                  {artists}
                </Text>
              )}
            </View>
          </Animated.View>
          <Press
            onPress={() => player.toggle()}
            feedback={pb.playing ? "toggleOff" : "toggleOn"}
            accessibilityLabel={pb.buffering ? "Loading" : pb.playing ? "Pause" : "Play"}
            style={styles.miniBtn}
            scaleTo={0.88}
          >
            {pb.buffering && pb.playing ? <Spinner size={24} color={colors.text} /> : <Icon name={pb.playing ? "pause" : "play"} size={26} />}
          </Press>
          <Press onPress={() => player.next()} accessibilityLabel="Next" style={styles.miniBtn} scaleTo={0.88}>
            <Icon name="next" size={24} />
          </Press>
          <MiniProgress fallback={song.durationMs} />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

function skip(dir: 1 | -1) {
  haptic.gestureEnd();
  if (dir > 0) player.next();
  else player.prev();
}

function MiniProgress({ fallback }: { fallback?: number }) {
  const { positionMs, durationMs } = useProgress(500);
  const dur = durationMs ?? fallback ?? 0;
  const p = dur > 0 ? Math.min(1, positionMs / dur) : 0;
  return (
    <View pointerEvents="none" style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${p * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: "absolute", left: 0, right: 0, bottom: 0 },
  tabs: { height: TABS, marginTop: 6, flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
  mini: {
    height: MINI,
    marginHorizontal: 10,
    paddingLeft: 9,
    paddingRight: 6,
    borderRadius: 16,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.09)",
    elevation: 12,
    shadowColor: "#000",
  },
  miniArt: { borderRadius: 8, elevation: 4, shadowColor: "#000" },
  miniBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  progressTrack: { position: "absolute", left: 14, right: 14, bottom: 0, height: 2, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.14)", overflow: "hidden" },
  progressFill: { height: 2, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.85)" },
});

export { ActivityIndicator };
