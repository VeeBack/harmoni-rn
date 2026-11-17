import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import type { Lyrics as LyricsData } from "@/api/types";
import { readPosition } from "@/player/hooks";
import { player } from "@/player/player";
import { haptic } from "@/lib/haptics";
import { Text } from "@/ui/Text";
import { fonts } from "@/ui/theme";
import { buildTimeline, type TimelineEntry } from "./timeline";

const GLIDE = Easing.bezier(0.2, 0.9, 0.25, 1.04);
const EASE = Easing.bezier(0.2, 0.7, 0.2, 1);

/** A clock on the UI thread: the playhead, extrapolated every frame between updates. */
function usePlayhead() {
  const base = useSharedValue(0);
  const at = useSharedValue(Date.now());
  const playing = useSharedValue(false);
  const t = useSharedValue(0);
  useEffect(() => {
    const read = () => {
      const p = readPosition();
      base.value = p.positionMs;
      at.value = Date.now();
      playing.value = p.playing;
    };
    read();
    const id = setInterval(read, 250);
    return () => clearInterval(id);
  }, [base, at, playing]);
  useFrameCallback(() => {
    t.value = base.value + (playing.value ? Date.now() - at.value : 0);
  });
  return t;
}

export function SyncedLyrics({ lyrics, durationMs }: { lyrics: LyricsData; durationMs?: number | null }) {
  const timeline = useMemo(() => buildTimeline(lyrics.lines ?? [], durationMs ?? undefined), [lyrics, durationMs]);
  const starts = useMemo(() => timeline.map((e) => e.start), [timeline]);
  const { width } = useWindowDimensions();
  const size = Math.round(Math.max(25.6, Math.min(width * 0.074, 36)));
  const t = usePlayhead();
  const startsSV = useSharedValue(starts);
  useEffect(() => {
    startsSV.value = starts;
  }, [starts, startsSV]);

  const active = useDerivedValue(() => {
    const s = startsSV.value;
    let lo = 0;
    let hi = s.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid] <= t.value) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  });
  const [activeJs, setActiveJs] = useState(-1);
  useAnimatedReaction(
    () => active.value,
    (v, prev) => {
      if (v !== prev) runOnJS(setActiveJs)(v);
    },
  );

  const viewport = useSharedValue(0);
  const offsets = useSharedValue<number[]>([]);
  const manual = useSharedValue(0);
  const scrolling = useSharedValue(false);
  const lastManual = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shift = useDerivedValue(() => {
    const o = offsets.value;
    const i = Math.max(0, active.value);
    return (o[i] ?? 0) - viewport.value * 0.42 + manual.value;
  });

  const releaseManual = () => {
    if (lastManual.current) clearTimeout(lastManual.current);
    lastManual.current = setTimeout(() => {
      scrolling.value = false;
      manual.value = withTiming(0, { duration: 900, easing: GLIDE });
    }, 3000);
  };
  useEffect(() => () => {
    if (lastManual.current) clearTimeout(lastManual.current);
  }, []);

  const startManual = useSharedValue(0);
  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onBegin(() => {
      startManual.value = manual.value;
    })
    .onStart(() => {
      scrolling.value = true;
    })
    .onUpdate((e) => {
      const o = offsets.value;
      const last = o[o.length - 1] ?? 0;
      manual.value = Math.max(-viewport.value, Math.min(last + viewport.value, startManual.value - e.translationY));
    })
    .onEnd(() => {
      runOnJS(releaseManual)();
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1, overflow: "hidden" }} onLayout={(e) => (viewport.value = e.nativeEvent.layout.height)}>
        <View style={{ paddingBottom: 600 }}>
          {timeline.map((entry, i) => (
            <Line
              key={i}
              entry={entry}
              index={i}
              size={size}
              isActive={activeJs === i}
              active={active}
              shift={shift}
              scrolling={scrolling}
              t={t}
              offsets={offsets}
            />
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}

const Line = memo(function Line({
  entry,
  index,
  size,
  isActive,
  active,
  shift,
  scrolling,
  t,
  offsets,
}: {
  entry: TimelineEntry;
  index: number;
  size: number;
  isActive: boolean;
  active: SharedValue<number>;
  shift: SharedValue<number>;
  scrolling: SharedValue<boolean>;
  t: SharedValue<number>;
  offsets: SharedValue<number[]>;
}) {
  const ty = useSharedValue(0);
  useAnimatedReaction(
    () => [shift.value, scrolling.value] as const,
    ([s, manual], prev) => {
      if (prev && prev[0] === s && prev[1] === manual) return;
      if (manual) {
        ty.value = -s;
        return;
      }
      const d = index - active.value;
      const delay = d > 0 ? Math.min(d, 8) * 45 : 0;
      ty.value = withDelay(delay, withTiming(-s, { duration: 900, easing: GLIDE }));
    },
  );
  const style = useAnimatedStyle(() => {
    const d = Math.min(6, index - active.value);
    const on = d === 0;
    let opacity = on ? 1 : d > 0 ? Math.max(0.12, Math.min(0.42, 0.42 - d * 0.07)) : 0.16;
    if (scrolling.value && !on) opacity = 0.6;
    if (entry.kind === "gap" && !on) opacity = 0;
    return {
      transform: [{ translateY: ty.value }, { scale: withTiming(on ? 1 : 0.97, { duration: 600, easing: EASE }) }],
      opacity: withTiming(opacity, { duration: scrolling.value ? 300 : 600, easing: EASE }),
    };
  });

  return (
    <Animated.View
      style={[{ transformOrigin: "left center" }, style]}
      onLayout={(e) => {
        const y = e.nativeEvent.layout.y;
        const next = offsets.value.slice();
        next[index] = y;
        offsets.value = next;
      }}
    >
      {entry.kind === "gap" ? (
        <Gap entry={entry} size={size} active={isActive} t={t} />
      ) : (
        <View style={{ paddingVertical: size * 0.42 }}>
          <Pressable
            onPress={() => {
              haptic.tick();
              player.seek(entry.start);
            }}
          >
            {isActive ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {entry.words.map((w, i) => (
                  <Word key={i} text={w.text} start={w.start} end={w.end} t={t} size={size} />
                ))}
              </View>
            ) : (
              <Text size={size} weight={700} color="#fff" style={{ lineHeight: size * 1.2, letterSpacing: -size * 0.02 }}>
                {entry.text}
              </Text>
            )}
          </Pressable>
          {entry.romanized ? (
            <Text size={size * 0.42} weight={600} color="rgba(255,255,255,0.72)" style={{ marginTop: size * 0.25, lineHeight: size * 0.56 }}>
              {entry.romanized}
            </Text>
          ) : null}
        </View>
      )}
    </Animated.View>
  );
});


function Word({ text, start, end, t, size }: { text: string; start: number; end: number; t: SharedValue<number>; size: number }) {
  const style = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (t.value - start) / Math.max(1, end - start)));
    return { color: interpolateColor(p, [0, 1], ["rgba(255,255,255,0.42)", "rgba(255,255,255,1)"]) };
  });
  return <Animated.Text style={[{ fontFamily: fonts[700], fontSize: size, lineHeight: size * 1.2, letterSpacing: -size * 0.02, includeFontPadding: false }, style]}>{text}</Animated.Text>;
}

function Gap({ entry, size, active, t }: { entry: Extract<TimelineEntry, { kind: "gap" }>; size: number; active: boolean; t: SharedValue<number> }) {
  return (
    <View style={{ flexDirection: "row", gap: size * 0.45, paddingVertical: size * 0.6, paddingLeft: size * 0.08 }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} i={i} size={size * 0.34} start={entry.start} end={entry.end} t={t} active={active} />
      ))}
    </View>
  );
}

function Dot({ i, size, start, end, t, active }: { i: number; size: number; start: number; end: number; t: SharedValue<number>; active: boolean }) {
  const breathe = useSharedValue(1);
  useEffect(() => {
    if (!active) return;
    breathe.value = withDelay(i * 120, withRepeat(withSequence(withTiming(1.18, { duration: 1300, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) })), -1, false));
  }, [active, breathe, i]);
  const style = useAnimatedStyle(() => {
    const g = (t.value - start) / Math.max(1, end - start);
    return { opacity: Math.max(0.25, Math.min(1, g * 3 - i + 0.15)), transform: [{ scale: breathe.value }] };
  });
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#fff" }, style]} />;
}

export function PlainLyrics({ lyrics }: { lyrics: LyricsData }) {
  const { width, height } = useWindowDimensions();
  const size = Math.round(Math.max(20, Math.min(width * 0.056, 25.6)));
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: height * 0.04, paddingBottom: height * 0.3 }}>
      {(lyrics.lines ?? []).map((l, i) => (
        <View key={i} style={{ paddingVertical: size * 0.25 }}>
          <Text size={size} weight={600} color="rgba(255,255,255,0.88)" style={{ lineHeight: size * 1.3, letterSpacing: -size * 0.015 }}>
            {l.text || " "}
          </Text>
          {l.romanized ? (
            <Text size={size * 0.42} weight={600} color="rgba(255,255,255,0.72)" style={{ marginTop: size * 0.2 }}>
              {l.romanized}
            </Text>
          ) : null}
        </View>
      ))}
      <Text size={13} color="rgba(255,255,255,0.55)" style={{ marginTop: 24 }}>
        These lyrics aren't synced to the music.
      </Text>
    </ScrollView>
  );
}
