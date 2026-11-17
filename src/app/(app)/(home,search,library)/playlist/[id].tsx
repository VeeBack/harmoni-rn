import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { Api } from "@/api/endpoints";
import type { Song } from "@/api/types";
import { Collection } from "@/song/Collection";
import { libraryChanged } from "@/state/collections";
import { queryClient } from "@/state/query";
import { Artwork } from "@/ui/Artwork";
import { confirm, prompt, toast } from "@/ui/overlays";

function Collage({ urls }: { urls: string[] }) {
  return (
    <View style={[StyleSheet.absoluteFill, { flexDirection: "row", flexWrap: "wrap" }]}>
      {urls.slice(0, 4).map((u, i) => (
        <View key={i} style={{ width: "50%", height: "50%" }}>
          <Artwork url={u} radius={0} px={400} />
        </View>
      ))}
    </View>
  );
}

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["playlist", id], queryFn: () => Api.playlist(id) });
  const p = q.data;
  const songs = useMemo(() => p?.items.map((i) => i.song), [p]);
  const itemFor = useMemo(() => {
    // Map song object identity back to its item, so duplicates keep their own itemId.
    const m = new Map<Song, string>();
    p?.items.forEach((i) => m.set(i.song, i.itemId));
    return m;
  }, [p]);
  const covers = useMemo(() => [...new Set((songs ?? []).map((s) => s.artworkUrl).filter(Boolean) as string[])], [songs]);

  const reload = () => {
    libraryChanged();
    q.refetch();
  };

  return (
    <Collection
      kind="Playlist"
      title={p?.name ?? ""}
      description={p?.description}
      songs={songs}
      art={covers.length >= 4 ? <Collage urls={covers} /> : undefined}
      artUrl={covers[0]}
      numbered
      sortKey={`playlist:${id}`}
      findLabel="Find in playlist"
      error={q.isError ? { title: "Playlist not found", body: "It may have been deleted, or it belongs to someone else." } : null}
      noMatch={(x) => `Nothing in this playlist matches “${x}”.`}
      empty={{ title: "An empty playlist, full of potential", body: "Find a song, open its ••• menu and choose Add to playlist." }}
      menuLabel="Playlist options"
      menu={() => [
        {
          label: "Rename",
          icon: "edit",
          onPress: async () => {
            const name = await prompt({ title: "Rename playlist", label: "Name", defaultValue: p?.name, confirm: "Save" });
            if (!name || !p) return;
            try {
              await Api.updatePlaylist(p.id, { name });
              reload();
            } catch {
              toast("Couldn't rename it.", "error");
            }
          },
        },
        {
          label: "Delete playlist",
          icon: "trash",
          danger: true,
          onPress: async () => {
            if (!p) return;
            if (!(await confirm({ title: `Delete “${p.name}”?`, note: "This can't be undone.", confirm: "Delete", danger: true }))) return;
            try {
              await Api.deletePlaylist(p.id);
              toast(`Deleted ${p.name}`);
              queryClient.removeQueries({ queryKey: ["playlist", id] });
              libraryChanged();
              router.back();
            } catch {
              toast("Couldn't delete it.", "error");
            }
          },
        },
      ]}
      rowExtras={(song) => [
        {
          label: "Remove from this playlist",
          icon: "trash",
          onPress: async () => {
            const itemId = itemFor.get(song);
            if (!itemId || !p) return;
            try {
              await Api.removeFromPlaylist(p.id, itemId);
              reload();
            } catch {
              toast("Couldn't remove that song.", "error");
            }
          },
        },
      ]}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
    />
  );
}
