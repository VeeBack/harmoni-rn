import { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";

import type { Song } from "@/api/types";
import { useDownloadState } from "@/downloads/downloads";
import { artistLine } from "@/lib/format";
import { deviceId, useLink } from "@/link/link";
import { usePlayer } from "@/player/player";
import { useIsLiked } from "@/state/library";
import { Artwork } from "@/ui/Artwork";
import { ExplicitBadge } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { IconButton, Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";

/** 0 not current, 1 current and paused, 2 current and playing. */
export function useCurrentState(songId: string): 0 | 1 | 2 {
  const remote = useLink((l) => {
    if (!l.enabled || !l.connected || !l.active || l.active === deviceId || !l.state) return -1;
    const cur = l.state.queue?.[l.state.index];
    return cur?.id === songId ? (l.state.playing ? 2 : 1) : 0;
  });
  const local = usePlayer((s) => (s.queue[s.index]?.id === songId ? (s.playing ? 2 : 1) : 0));
  return (remote >= 0 ? remote : local) as 0 | 1 | 2;
}

/** A song in a list, HIG-style: artwork, two lines, an ellipsis; inset hairline between rows; highlight when held. */
export const SongRow = memo(function SongRow({
  song,
  index,
  numbered,
  onPress,
  onMore,
  last,
  compact,
}: {
  song: Song;
  index: number;
  numbered?: boolean;
  onPress: (song: Song, index: number) => void;
  onMore: (song: Song, index: number) => void;
  last?: boolean;
  /** No artwork (album tracklists). */
  compact?: boolean;
}) {
  const current = useCurrentState(song.id);
  const liked = useIsLiked(song.id);
  const dl = useDownloadState(song.id);
  return (
    <Press
      onPress={() => onPress(song, index)}
      onLongPress={() => onMore(song, index)}
      feedback={false}
      scaleTo={1}
      highlight="rgba(255,255,255,0.06)"
      style={styles.row}
      accessibilityLabel={`${song.title}, ${artistLine(song)}`}
    >
      {numbered ? (
        <View style={{ width: 22, alignItems: "center" }}>
          {current ? (
            <Equalizer playing={current === 2} />
          ) : (
            <Text variant="subhead" color={colors.text3} tabular>
              {index + 1}
            </Text>
          )}
        </View>
      ) : null}
      {compact ? null : (
        <View>
          <Artwork url={song.artworkUrl} size={48} radius={6} />
          {current && !numbered ? (
            <View style={[StyleSheet.absoluteFill, styles.overlay]}>
              <Equalizer playing={current === 2} color="#fff" />
            </View>
          ) : null}
        </View>
      )}
      <View style={[styles.texts, compact ? { minHeight: 54 } : null]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text variant="callout" weight={500} numberOfLines={1} color={current ? colors.accent : colors.text} style={{ flexShrink: 1 }}>
            {song.title}
          </Text>
          {song.explicit ? <ExplicitBadge /> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {dl === "done" ? <Icon name="download-solid" size={12} color={colors.text3} /> : null}
          {liked ? <Icon name="heart-solid" size={11} color={colors.text3} /> : null}
          <Text variant="subhead" color={colors.text2} numberOfLines={1} style={{ flexShrink: 1 }}>
            {artistLine(song)}
          </Text>
        </View>
        {last ? null : <View style={styles.separator} />}
      </View>
      <IconButton label={`More options for ${song.title}`} onPress={() => onMore(song, index)} size={40} feedback="contextClick">
        <Icon name="ellipsis" size={20} color={colors.text2} />
      </IconButton>
    </Press>
  );
});

/** The "now playing" bars: three bars bouncing while playing, resting when paused. */
export function Equalizer({ playing, color = colors.accent }: { playing: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 14 }}>
      {[0, 1, 2].map((i) => (
        <Bar key={i} i={i} playing={playing} color={color} />
      ))}
    </View>
  );
}

function Bar({ i, playing, color }: { i: number; playing: boolean; color: string }) {
  const h = useSharedValue(0.35);
  useEffect(() => {
    if (!playing) {
      h.value = withTiming(0.3 + i * 0.15, { duration: 300 });
      return;
    }
    const d = [520, 380, 460][i];
    h.value = withDelay(
      i * 90,
      withRepeat(withSequence(withTiming(1, { duration: d, easing: Easing.inOut(Easing.sin) }), withTiming(0.25, { duration: d, easing: Easing.inOut(Easing.sin) })), -1, false),
    );
  }, [playing, h, i]);
  const style = useAnimatedStyle(() => ({ height: 14 * h.value }));
  return <Animated.View style={[{ width: 3, borderRadius: 1.5, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingLeft: 20, paddingRight: 8, marginHorizontal: -20, minHeight: 64 },
  texts: { flex: 1, alignSelf: "stretch", justifyContent: "center", gap: 2 },
  separator: { position: "absolute", left: 0, right: -8, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  overlay: { backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 6, alignItems: "center", justifyContent: "center" },
});
