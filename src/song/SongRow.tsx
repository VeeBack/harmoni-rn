import { memo } from "react";
import { StyleSheet, View } from "react-native";

import type { Song } from "@/api/types";
import { useDownloadState } from "@/downloads/downloads";
import { artistLine } from "@/lib/format";
import { useLink, deviceId } from "@/link/link";
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

export const SongRow = memo(function SongRow({
  song,
  index,
  numbered,
  onPress,
  onMore,
}: {
  song: Song;
  index: number;
  numbered?: boolean;
  onPress: (song: Song, index: number) => void;
  onMore: (song: Song, index: number) => void;
}) {
  const current = useCurrentState(song.id);
  const liked = useIsLiked(song.id);
  const dl = useDownloadState(song.id);
  return (
    <Press
      onPress={() => onPress(song, index)}
      onLongPress={() => onMore(song, index)}
      feedback={false}
      scaleTo={0.985}
      ripple
      style={styles.row}
      accessibilityLabel={`${song.title}, ${artistLine(song)}`}
    >
      {numbered ? (
        <View style={{ width: 18, alignItems: "flex-end" }}>
          {current === 2 ? (
            <Icon name="music" size={15} color={colors.accent} />
          ) : (
            <Text size={13} color={current ? colors.accent : colors.text3} tabular>
              {index + 1}
            </Text>
          )}
        </View>
      ) : null}
      <View>
        <Artwork url={song.artworkUrl} size={44} radius={8} />
        {current ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay]}>
            <Icon name={current === 2 ? "pause" : "play"} size={18} color="#fff" />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text weight={500} numberOfLines={1} color={current ? colors.accent : colors.text} style={{ flexShrink: 1 }}>
            {song.title}
          </Text>
          {song.explicit ? <ExplicitBadge /> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {dl === "done" ? (
            <View style={{ marginRight: 5 }}>
              <Icon name="download-solid" size={12} color={colors.accent} />
            </View>
          ) : null}
          {liked ? (
            <View style={{ marginRight: 5 }}>
              <Icon name="heart-solid" size={12} color={colors.accent} />
            </View>
          ) : null}
          <Text size={13} color={colors.text2} numberOfLines={1} style={{ flexShrink: 1 }}>
            {artistLine(song)}
          </Text>
        </View>
      </View>
      <IconButton label={`More options for ${song.title}`} onPress={() => onMore(song, index)} size={36} feedback="contextClick">
        <Icon name="more" size={20} color={colors.text2} />
      </IconButton>
    </Press>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 7, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 12, overflow: "hidden" },
  overlay: { backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
