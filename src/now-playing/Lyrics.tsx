import MaskedViewBase from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions, type TextLayoutEvent, type ViewProps } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withRepeat,
  withDecay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import type { Lyrics as LyricsData } from "@/api/types";
import { haptic } from "@/lib/haptics";
import { readPosition } from "@/player/hooks";
import { player } from "@/player/player";
import { Text } from "@/ui/Text";
import { buildTimeline, type TimelineEntry } from "./timeline";

// Apple-Music-style synced lyrics, matching the web app's immersive view:
// the current line sits 42% down, lines glide up in a staggered wave (900 ms,
// slight overshoot), past and upcoming lines are dimmed and blurred, and the
// current line fills word by word with a feathered sweep.
//
// Performance: nothing runs per line per frame. Lines animate only when the
// current line changes; the only per-frame work is the playhead and the sweep
// on the current line.

const MaskedView = MaskedViewBase as unknown as (p: ViewProps & { maskElement: ReactNode; children: ReactNode }) => ReactNode;

const SOFT = Easing.bezier(0.2, 0.7, 0.2, 1);
const ANCHOR = 0.42;
const DIM = "rgba(255,255,255,0.42)";

/** The playhead on the UI thread, extrapolated every frame between reads. */
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

/** The current timeline entry, reported to JS only when it changes. */
function useActiveIndex(t: SharedValue<number>, starts: number[]) {
  const [active, setActive] = useState(-1);
  const startsSV = useSharedValue(starts);
  const last = useSharedValue(-2);
  useEffect(() => {
    startsSV.value = starts;
    last.value = -2;
  }, [starts, startsSV, last]);
  useFrameCallback(() => {
    const s = startsSV.value;
    let lo = 0;
    let hi = s.length - 1;
    let found = -1;
    const now = t.value;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid] <= now) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found !== last.value) {
      last.value = found;
      runOnJS(setActive)(found);
    }
  });
  return active;
}

export function SyncedLyrics({ lyrics, durationMs }: { lyrics: LyricsData; durationMs?: number | null }) {
  const timeline = useMemo(() => buildTimeline(lyrics.lines ?? [], durationMs ?? undefined), [lyrics, durationMs]);
  const starts = useMemo(() => timeline.map((e) => e.start), [timeline]);
  const { width } = useWindowDimensions();
  const size = Math.round(Math.max(25.6, Math.min(width * 0.074, 36)));
  const t = usePlayhead();
  const active = useActiveIndex(t, starts);

  // Line positions, measured once; published together so the glide target is stable.
  const offsets = useRef<number[]>([]);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const pending = useRef(0);
  const measure = useCallback((i: number, y: number) => {
    if (offsets.current[i] === y) return;
    offsets.current[i] = y;
    if (pending.current) return;
    pending.current = requestAnimationFrame(() => {
      pending.current = 0;
      setLayoutVersion((v) => v + 1);
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(pending.current), []);

  const [viewport, setViewport] = useState(0);
  // Scrolling by hand moves the whole column (one transform), lifts the dimming and holds
  // the lines still; a flick carries on and rubber-bands at the ends. A few seconds after the
  // last touch it glides back to the line being sung.
  // Where the column is held while scrolling by hand (null: following the song).
  const [held, setHeld] = useState<number | null>(null);
  const scrolling = held !== null;
  const liveShift = (offsets.current[Math.max(0, active)] ?? 0) - viewport * ANCHOR;
  const shift = held ?? liveShift;
  void layoutVersion;

  const manual = useSharedValue(0);
  const startManual = useSharedValue(0);
  const lastOffset = offsets.current[offsets.current.length - 1] ?? 0;
  // How far the column can go from where it's held: the first line, or the last, at the anchor.
  const lo = useSharedValue(0);
  const hi = useSharedValue(0);
  useEffect(() => {
    lo.value = -viewport * ANCHOR - shift;
    hi.value = lastOffset - viewport * ANCHOR - shift;
  }, [viewport, shift, lastOffset, lo, hi]);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settle = useCallback(() => {
    if (release.current) clearTimeout(release.current);
    release.current = setTimeout(() => {
      setHeld(null);
      manual.value = withSpring(0, { duration: 900, dampingRatio: 0.9 });
    }, 2800);
  }, [manual]);
  const hold = () => {
    if (release.current) clearTimeout(release.current);
    if (held === null) setHeld(liveShift);
  };
  useEffect(
    () => () => {
      if (release.current) clearTimeout(release.current);
    },
    [],
  );
  // Seeking from a line while scrolled: go straight back to it.
  const backNow = useCallback(() => {
    if (release.current) clearTimeout(release.current);
    setHeld(null);
    manual.value = withSpring(0, { duration: 800, dampingRatio: 0.9 });
  }, [manual]);

  const dragged = useSharedValue(false);
  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onBegin(() => {
      // A touch catches a flick that's still going.
      cancelAnimation(manual);
      startManual.value = manual.value;
      dragged.value = false;
    })
    .onStart(() => {
      dragged.value = true;
      runOnJS(hold)();
    })
    .onUpdate((e) => {
      const v = startManual.value - e.translationY;
      // Past the ends it follows at a third of the speed.
      manual.value = v < lo.value ? lo.value - (lo.value - v) / 3 : v > hi.value ? hi.value + (v - hi.value) / 3 : v;
    })
    .onEnd((e) => {
      manual.value = withDecay({
        velocity: -e.velocityY,
        deceleration: 0.997,
        clamp: [lo.value, Math.max(lo.value, hi.value)],
        rubberBandEffect: true,
        rubberBandFactor: 0.7,
      });
    })
    .onFinalize(() => {
      if (dragged.value || manual.value !== 0) runOnJS(settle)();
    });
  const columnStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -manual.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1, overflow: "hidden" }} onLayout={(e) => setViewport(e.nativeEvent.layout.height)}>
        <Animated.View style={[styles.column, columnStyle]}>
          {timeline.map((entry, i) => (
            <Line
              key={i}
              entry={entry}
              index={i}
              active={active}
              shift={shift}
              size={size}
              scrolling={scrolling}
              t={t}
              measure={measure}
              onSeek={scrolling ? backNow : undefined}
            />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const Line = memo(function Line({
  entry,
  index,
  active,
  shift,
  size,
  scrolling,
  t,
  measure,
  onSeek,
}: {
  entry: TimelineEntry;
  index: number;
  active: number;
  shift: number;
  size: number;
  scrolling: boolean;
  t: SharedValue<number>;
  measure: (i: number, y: number) => void;
  onSeek?: () => void;
}) {
  const d = Math.min(6, index - active);
  const isActive = d === 0;
  const ty = useSharedValue(-shift);
  const op = useSharedValue(0);
  const sc = useSharedValue(1);

  // The glide: lines below the current one leave a little later the further down
  // they are, so the block flows like a wave. Past lines go at once.
  // Only a step forward ripples; a seek back or a long jump moves the lines together, so they never overlap.
  const lastShift = useRef(shift);
  useEffect(() => {
    const step = shift - lastShift.current;
    lastShift.current = shift;
    const ripple = step > 0 && step < size * 6;
    const delay = ripple && d > 0 ? Math.min(d, 8) * 40 : 0;
    ty.value = withDelay(delay, withSpring(-shift, { duration: ripple ? 820 : 700, dampingRatio: ripple ? 0.8 : 0.92 }));
  }, [shift, d, ty, size]);

  useEffect(() => {
    let o = isActive ? 1 : d > 0 ? Math.max(0.12, Math.min(0.42, 0.42 - d * 0.07)) : 0.16;
    if (scrolling && !isActive) o = 0.62;
    if (entry.kind === "gap" && !isActive) o = 0;
    op.value = withTiming(o, { duration: scrolling ? 300 : 600, easing: SOFT });
    sc.value = withTiming(isActive ? 1 : 0.97, { duration: 600, easing: SOFT });
  }, [isActive, d, scrolling, entry.kind, op, sc]);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateY: ty.value }, { scale: sc.value }],
  }));

  // A tap seeks to the line; any movement makes it a scroll instead (the column's pan).
  const pressed = useSharedValue(0);
  const seek = () => {
    haptic.tick();
    player.seek(entry.start);
    onSeek?.();
  };
  const tap = Gesture.Tap()
    .maxDistance(10)
    .maxDuration(600)
    .onBegin(() => {
      pressed.value = withTiming(1, { duration: 90 });
    })
    .onEnd((_e, ok) => {
      if (ok) runOnJS(seek)();
    })
    .onFinalize(() => {
      pressed.value = withTiming(0, { duration: 200 });
    });
  const pressStyle = useAnimatedStyle(() => ({ opacity: 1 - 0.25 * pressed.value }));

  // Blur like the web: upcoming lines a little more the further away, past lines a fixed amount.
  // Only lines near the current one blur (the rest are faded out anyway).
  const blur = scrolling || isActive || index - active > 4 || active - index > 2 ? 0 : d > 0 ? Math.min(d, 3) * 0.9 : 2;

  return (
    <View collapsable={false} onLayout={(e) => measure(index, e.nativeEvent.layout.y)}>
      <Animated.View style={[{ transformOrigin: "left center" }, blur ? ({ filter: [{ blur }] } as object) : null, style]}>
        {entry.kind === "gap" ? (
          <Gap entry={entry} size={size} active={isActive} t={t} />
        ) : (
          <GestureDetector gesture={tap}>
            <Animated.View style={[{ paddingVertical: size * 0.42 }, pressStyle]}>
              {isActive ? (
                <SweepText entry={entry} size={size} t={t} />
              ) : (
                <Text size={size} weight={700} color="#fff" style={{ lineHeight: size * 1.2, letterSpacing: -size * 0.02 }}>
                  {entry.text}
                </Text>
              )}
              {entry.romanized ? (
                <Text
                  size={size * 0.42}
                  weight={600}
                  color="rgba(255,255,255,0.72)"
                  style={{ marginTop: size * 0.25, lineHeight: size * 0.56 }}
                >
                  {entry.romanized}
                </Text>
              ) : null}
            </Animated.View>
          </GestureDetector>
        )}
      </Animated.View>
    </View>
  );
});

type Row = { x: number; y: number; width: number; height: number; from: number; to: number };
type WordSpan = { from: number; len: number; start: number; end: number };

/**
 * The current line: the same text as every other line (so the layout never jumps),
 * dim underneath, and a white copy on top revealed by a feathered edge that moves
 * through the words as they're sung, row by row.
 */
function SweepText({ entry, size, t }: { entry: Extract<TimelineEntry, { kind: "line" }>; size: number; t: SharedValue<number> }) {
  const [rows, setRows] = useState<Row[]>([]);
  // Character offsets of each word, for mapping time to a position in the text.
  const words = useMemo(() => {
    let at = 0;
    return entry.words.map((w): WordSpan => {
      const from = at;
      at += w.text.length;
      return { from, len: w.text.length, start: w.start, end: w.end };
    });
  }, [entry]);
  const wordsSV = useSharedValue(words);
  useEffect(() => {
    wordsSV.value = words;
  }, [words, wordsSV]);

  const onTextLayout = useCallback((e: TextLayoutEvent) => {
    let at = 0;
    const next = e.nativeEvent.lines.map((l) => {
      const r = { x: l.x, y: l.y, width: l.width, height: l.height, from: at, to: at + l.text.length };
      at += l.text.length;
      return r;
    });
    setRows((prev) =>
      prev.length === next.length && prev.every((p, i) => p.width === next[i].width && p.from === next[i].from) ? prev : next,
    );
  }, []);

  const textStyle = { lineHeight: size * 1.2, letterSpacing: -size * 0.02 };
  const feather = size * 0.35;
  return (
    <View>
      <Text size={size} weight={700} color={DIM} style={textStyle} onTextLayout={onTextLayout}>
        {entry.text}
      </Text>
      {rows.length ? (
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={
            <View style={StyleSheet.absoluteFill}>
              {rows.map((r, i) => (
                <RowMask key={i} row={r} words={wordsSV} t={t} feather={feather} />
              ))}
            </View>
          }
        >
          <Text size={size} weight={700} color="#fff" style={textStyle}>
            {entry.text}
          </Text>
        </MaskedView>
      ) : null}
    </View>
  );
}

function RowMask({ row, words, t, feather }: { row: Row; words: SharedValue<WordSpan[]>; t: SharedValue<number>; feather: number }) {
  const w = Math.max(1, row.width);
  const strip = w * 2 + feather * 2;
  const from = row.from;
  const to = row.to;
  const style = useAnimatedStyle(() => {
    // How many characters have been sung by now.
    const ws = words.value;
    const now = t.value;
    let chars = 0;
    for (let i = 0; i < ws.length; i++) {
      const word = ws[i];
      if (now >= word.end) chars = word.from + word.len;
      else {
        if (now > word.start) chars = word.from + (word.len * (now - word.start)) / Math.max(1, word.end - word.start);
        break;
      }
    }
    const f = Math.max(0, Math.min(1, (chars - from) / Math.max(1, to - from)));
    // The strip is white on its left half and clear on its right; its edge sits at f of the row.
    return { transform: [{ translateX: f * (w + feather) - (w + feather) }] };
  });
  return (
    <View style={{ position: "absolute", left: row.x, top: row.y, width: w, height: row.height, overflow: "hidden" }}>
      <Animated.View style={[{ width: strip, height: "100%" }, style]}>
        <LinearGradient
          colors={["#fff", "#fff", "rgba(255,255,255,0)", "rgba(255,255,255,0)"]}
          locations={[0, (w + feather * 0.2) / strip, (w + feather * 1.8) / strip, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

function Gap({
  entry,
  size,
  active,
  t,
}: {
  entry: Extract<TimelineEntry, { kind: "gap" }>;
  size: number;
  active: boolean;
  t: SharedValue<number>;
}) {
  return (
    <View style={{ flexDirection: "row", gap: size * 0.45, paddingVertical: size * 0.6, paddingLeft: size * 0.08 }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} i={i} size={size * 0.34} start={entry.start} end={entry.end} t={t} active={active} />
      ))}
    </View>
  );
}

function Dot({
  i,
  size,
  start,
  end,
  t,
  active,
}: {
  i: number;
  size: number;
  start: number;
  end: number;
  t: SharedValue<number>;
  active: boolean;
}) {
  const breathe = useSharedValue(1);
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = active ? 1 : 0;
    if (!active) {
      breathe.value = 1;
      return;
    }
    breathe.value = withDelay(
      i * 120,
      withRepeat(
        withSequence(
          withTiming(1.18, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, [active, breathe, on, i]);
  const style = useAnimatedStyle(() => {
    if (!on.value) return { opacity: 0.25, transform: [{ scale: 1 }] };
    const g = (t.value - start) / Math.max(1, end - start);
    return { opacity: Math.max(0.25, Math.min(1, g * 3 - i + 0.15)), transform: [{ scale: breathe.value }] };
  });
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#fff" }, style]} />;
}

export function PlainLyrics({ lyrics }: { lyrics: LyricsData }) {
  const { width, height } = useWindowDimensions();
  const size = Math.round(Math.max(20, Math.min(width * 0.056, 25.6)));
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: height * 0.06, paddingBottom: height * 0.3 }}>
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

const styles = StyleSheet.create({
  column: { position: "absolute", top: 0, left: 0, right: 0, paddingBottom: 800 },
});
