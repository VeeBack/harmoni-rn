import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

import type { Playlist } from "@/api/types";
import { DownloadedList, useSavedSongs } from "@/downloads/DownloadedList";
import { listKey, useMembers } from "@/downloads/members";
import { Collage } from "@/song/art";
import { usePlaylists, useSharedPlaylists } from "@/state/collections";
import { queryClient } from "@/state/query";

/** A playlist as Downloads shows it: just its songs saved on this phone, in its order. */
export default function DownloadedPlaylist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const members = useMembers((s) => s.lists[listKey("playlist", id)]);
  const playlists = usePlaylists();
  const shared = useSharedPlaylists();
  const saved = useSavedSongs();
  const name =
    playlists.data?.find((p) => p.id === id)?.name ??
    shared.data?.find((p) => p.id === id)?.name ??
    queryClient.getQueryData<Playlist>(["playlist", id, null])?.name ??
    "Playlist";
  const covers = useMemo(
    () => [...new Set((members?.ids ?? []).map((i) => saved.get(i)?.artworkUrl).filter(Boolean) as string[])],
    [members, saved],
  );
  return (
    <DownloadedList
      kind="Playlist"
      title={name}
      art={covers.length >= 4 ? <Collage urls={covers} /> : undefined}
      ids={members?.ids ?? []}
      sortKey={`downloads:playlist:${id}`}
      open={{ label: "All of this playlist", href: `/playlist/${id}` }}
      emptyBody="None of this playlist's songs are saved on this phone. Open the playlist and tap download."
    />
  );
}
