import { useCallback } from "react";
import { View } from "react-native";

import type { Song } from "@/api/types";
import { usePlayback } from "@/player/hooks";
import { player } from "@/player/player";
import { openSongMenu, type Extra } from "./menu";
import { SongRow } from "./SongRow";

/** Tapping the current song toggles; otherwise plays the list from there (or just that song in single mode). */
export function usePlaySong(songs: Song[], single?: boolean) {
  const pb = usePlayback();
  return useCallback(
    (song: Song, i: number) => {
      if (pb.song?.id === song.id) player.toggle();
      else if (single) player.play([song], 0);
      else player.play(songs, i);
    },
    [pb.song?.id, songs, single],
  );
}

/** A short list of rows (for long lists use a FlashList with SongRow). */
export function SongList({ songs, numbered, single, extras }: { songs: Song[]; numbered?: boolean; single?: boolean; extras?: (song: Song, i: number) => Extra[] }) {
  const onPress = usePlaySong(songs, single);
  const onMore = useCallback((song: Song, i: number) => openSongMenu(song, extras?.(song, i) ?? []), [extras]);
  return (
    <View>
      {songs.map((s, i) => (
        <SongRow key={`${s.id}:${i}`} song={s} index={i} numbered={numbered} onPress={onPress} onMore={onMore} last={i === songs.length - 1} />
      ))}
    </View>
  );
}
