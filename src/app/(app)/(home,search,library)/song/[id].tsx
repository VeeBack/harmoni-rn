import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { Api } from "@/api/endpoints";
import { copyLink, shareLink, songPath } from "@/lib/share";
import { Collection } from "@/song/Collection";
import { songMenuItems } from "@/song/menu";
import { useIsLiked, useLibrary } from "@/state/library";
import { Section, SmallButton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { toast } from "@/ui/overlays";
import { IconButton } from "@/ui/Press";
import { colors } from "@/ui/theme";

/** Where a shared song link lands: the song, ready to play. */
export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["song", id], queryFn: () => Api.song(id) });
  const song = q.data;
  const liked = useIsLiked(id);
  const artists = song?.artists.filter((a) => a.role !== "featured") ?? [];
  return (
    <Collection
      kind="Song"
      title={song?.title ?? ""}
      meta={artists.map((a) => a.name).join(", ") || undefined}
      description={song?.album?.title ? `From ${song.album.title}` : undefined}
      artUrl={song?.artworkUrl}
      songs={song ? [song] : undefined}
      loading={!song && !q.isError}
      error={q.isError ? { title: "Song not found", body: "The link may be broken, or the song was merged into another one." } : null}
      hideDownload
      menuLabel="Song options"
      menu={song ? () => songMenuItems(song) : undefined}
      actions={
        song ? (
          <View style={{ flexDirection: "row" }}>
            <IconButton
              label={liked ? "Remove from Liked" : "Add to Liked"}
              onPress={() =>
                useLibrary
                  .getState()
                  .toggleLike(song)
                  .catch(() => toast("Couldn't save that. Try again?", "error"))
              }
              size={42}
              feedback={liked ? "toggleOff" : "confirm"}
            >
              <Icon name={liked ? "heart-solid" : "heart"} size={22} color={liked ? colors.accent : colors.text2} />
            </IconButton>
            <IconButton
              label="Share"
              onPress={() => shareLink(songPath(song.id), song.title)}
              onLongPress={() => copyLink(songPath(song.id)).then((ok) => ok && toast("Link copied"))}
              size={42}
            >
              <Icon name="share" size={22} color={colors.text2} />
            </IconButton>
          </View>
        ) : undefined
      }
      below={
        song && (song.album?.id || artists.some((a) => a.id)) ? (
          <Section title="More">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {song.album?.id ? (
                <SmallButton icon="disc" label={`From ${song.album.title}`} onPress={() => router.push(`/album/${song.album!.id}`)} />
              ) : null}
              {artists.map((a) =>
                a.id ? (
                  <SmallButton key={a.id} icon="user" label={`More by ${a.name}`} onPress={() => router.push(`/artist/${a.id}`)} />
                ) : null,
              )}
            </View>
          </Section>
        ) : (
          <View />
        )
      }
    />
  );
}
