import { router } from "expo-router";
import { View } from "react-native";

import { Api } from "@/api/endpoints";
import { useDownloads } from "@/downloads/downloads";
import { plural } from "@/lib/format";
import { CardLink, SpiceCardLink, useGridWidth } from "@/song/cards";
import { DAILY_SPICE_HREF, useDailySpice } from "@/spice/daily";
import { useSpiceDraft } from "@/spice/draft";
import { libraryChanged, sortCollections, usePlaylists, useSharedPlaylists, useSpices } from "@/state/collections";
import { EmptyState, Section, Skeleton, SmallButton } from "@/ui/bits";
import { openMenu, prompt, toast } from "@/ui/overlays";
import { NavRow } from "@/ui/NavRow";
import { Screen } from "@/ui/Screen";

export async function newPlaylist() {
  const name = await prompt({ title: "New playlist", label: "Name it", confirm: "Create" });
  if (!name) return;
  try {
    const p = await Api.createPlaylist(name);
    libraryChanged();
    router.push(`/playlist/${p.id}`);
  } catch {
    toast("Couldn't create the playlist.", "error");
  }
}

export function openNewMenu() {
  openMenu({
    label: "New playlist or Spice",
    items: [
      {
        label: "New Spice",
        icon: "spice",
        onPress: () => {
          useSpiceDraft.setState({ seeds: [] });
          router.push("/spice/new");
        },
      },
      { label: "New Playlist", icon: "playlist", onPress: newPlaylist },
    ],
  });
}

export default function Library() {
  const playlists = usePlaylists();
  const spices = useSpices();
  const shared = useSharedPlaylists();
  const daily = useDailySpice();
  const w = useGridWidth();
  const downloads = useDownloads((s) => Object.values(s.items).filter((d) => d.state === "done").length);
  const cols = sortCollections(playlists.data, spices.data);
  const loading = !playlists.data && playlists.isLoading;
  return (
    <Screen
      tab="(library)"
      title="Library"
      large
      refreshing={playlists.isRefetching}
      onRefresh={() => {
        playlists.refetch();
        spices.refetch();
        shared.refetch();
      }}
    >
      <View style={{ marginTop: 4 }}>
        <NavRow icon="heart" label="Liked Songs" onPress={() => router.push("/liked")} />
        <NavRow icon="history" label="Recently Played" onPress={() => router.push("/recent")} />
        {daily ? (
          <NavRow icon="spice" label={daily.label} detail={daily.part} onPress={() => router.push(DAILY_SPICE_HREF as never)} />
        ) : null}
        <NavRow
          icon="download"
          label="Downloads"
          detail={downloads ? plural(downloads, "song") : undefined}
          onPress={() => router.push("/downloads")}
        />
        <NavRow icon="settings" label="Settings" onPress={() => router.push("/settings")} last />
      </View>
      <Section
        title="Playlists"
        action={<SmallButton label="New" icon="plus" accessibilityLabel="New playlist or Spice" onPress={openNewMenu} />}
      >
        {loading ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} width={w} height={w} radius={16} />
            ))}
          </View>
        ) : !cols.length ? (
          <EmptyState title="No playlists yet" body="Tap New to make a playlist or a Spice, or add a song to one from its menu." />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 20 }}>
            {cols.map((c) =>
              c.type === "playlist" ? (
                <CardLink
                  key={`p${c.id}`}
                  title={c.name}
                  subtitle={`Playlist · ${plural(c.count, "song")}`}
                  artwork={c.artworks[0]}
                  width={w}
                  onPress={() => router.push(`/playlist/${c.id}`)}
                />
              ) : (
                <SpiceCardLink key={`s${c.id}`} spice={c} width={w} />
              ),
            )}
          </View>
        )}
      </Section>
      {shared.data?.length ? (
        <Section title="Shared with you">
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 20 }}>
            {shared.data.map((p) => (
              <CardLink
                key={p.id}
                title={p.name}
                subtitle={`${p.owner.name} · ${plural(p.count, "song")}`}
                artwork={p.artworks[0]}
                width={w}
                onPress={() => router.push(`/playlist/${p.id}`)}
              />
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}
