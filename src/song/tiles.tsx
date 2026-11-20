import { memo } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";

import type { Song } from "@/api/types";
import { player } from "@/player/player";
import { useIsLiked } from "@/state/library";
import { Artwork } from "@/ui/Artwork";
import { Icon } from "@/ui/Icon";
import { IconButton, Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { colors, radius } from "@/ui/theme";
import { openSongMenu } from "./menu";
import { Equalizer, useCurrentState } from "./SongRow";

/**
 * Songs as compact rows in columns of `rows`, paging sideways: a lot of songs
 * in little height, for a home screen shelf (the web's SongTiles).
 */
export function SongTiles({ songs, rows = 4 }: { songs: Song[]; rows?: number }) {
  const { width } = useWindowDimensions();
  const column = width - 40 - 36; // the next column peeks in
  const columns: number[][] = [];
  songs.forEach((_, i) => {
    if (i % rows === 0) columns.push([]);
    columns[columns.length - 1].push(i);
  });
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={column + 12}
      snapToAlignment="start"
      style={{ marginHorizontal: -20 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
    >
      {columns.map((col, c) => (
        <View key={c} style={{ width: column }}>
          {col.map((i) => (
            <SongTile key={`${songs[i].id}-${i}`} song={songs[i]} list={songs} index={i} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const SongTile = memo(function SongTile({ song, list, index }: { song: Song; list: Song[]; index: number }) {
  const current = useCurrentState(song.id);
  const liked = useIsLiked(song.id);
  return (
    <Press
      onPress={() => (current ? player.toggle() : player.play(list, index))}
      onLongPress={() => openSongMenu(song)}
      feedback="tap"
      scaleTo={0.98}
      highlight={colors.press}
      accessibilityLabel={`Play ${song.title}`}
      style={styles.tile}
    >
      <View style={styles.art}>
        <Artwork url={song.artworkUrl} size={48} radius={radius.sm} />
        {current ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay]}>
            <Equalizer playing={current === 2} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text variant="subhead" weight={600} numberOfLines={1} color={current ? colors.accent : colors.text}>
          {song.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {liked ? <Icon name="heart-solid" size={11} color={colors.text3} /> : null}
          <Text variant="footnote" color={colors.text2} numberOfLines={1} style={{ flexShrink: 1 }}>
            {song.artists.map((a) => a.name).join(", ")}
          </Text>
        </View>
      </View>
      <IconButton label="More" onPress={() => openSongMenu(song)} size={36} feedback="contextClick">
        <Icon name="ellipsis" size={18} color={colors.text3} />
      </IconButton>
    </Press>
  );
});

const styles = StyleSheet.create({
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 6,
    paddingLeft: 8,
    marginHorizontal: -8,
    borderRadius: radius.md,
  },
  art: { borderRadius: radius.sm, overflow: "hidden", elevation: 2, shadowColor: "#000" },
  overlay: { backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
});
