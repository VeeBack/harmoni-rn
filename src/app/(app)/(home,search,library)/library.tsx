import { router } from "expo-router";
import { View } from "react-native";

import { Api } from "@/api/endpoints";
import { useDownloads } from "@/downloads/downloads";
import { plural } from "@/lib/format";
import { CardLink, SpiceCardLink, useGridWidth } from "@/song/cards";
import { useSpiceDraft } from "@/spice/draft";
import { libraryChanged, sortCollections, usePlaylists, useSpices } from "@/state/collections";
import { EmptyState, Section, Skeleton, SmallButton } from "@/ui/bits";
import { Icon, type IconName } from "@/ui/Icon";
import { openMenu, prompt, toast } from "@/ui/overlays";
import { Press } from "@/ui/Press";
import { PageTitle, Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";

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
  const w = useGridWidth();
  const downloads = useDownloads((s) => Object.values(s.items).filter((d) => d.state === "done").length);
  const cols = sortCollections(playlists.data, spices.data);
  const loading = !playlists.data && playlists.isLoading;
  return (
    <Screen
      tab="(library)"
      refreshing={playlists.isRefetching}
      onRefresh={() => {
        playlists.refetch();
        spices.refetch();
      }}
    >
      <PageTitle>Library</PageTitle>
      <View style={{ marginTop: 12, borderTopWidth: 1, borderColor: colors.border }}>
        <Row icon="heart" label="Liked Songs" onPress={() => router.push("/liked")} />
        <Row icon="history" label="Recently Played" onPress={() => router.push("/recent")} />
        <Row icon="download" label="Downloads" detail={downloads ? plural(downloads, "song") : undefined} onPress={() => router.push("/downloads")} />
        <Row icon="settings" label="Settings" onPress={() => router.push("/settings")} />
      </View>
      <Section title="Playlists" action={<SmallButton label="New" icon="plus" accessibilityLabel="New playlist or Spice" onPress={openNewMenu} />}>
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
                <CardLink key={`p${c.id}`} title={c.name} subtitle={`Playlist · ${plural(c.count, "song")}`} artwork={c.artworks[0]} width={w} onPress={() => router.push(`/playlist/${c.id}`)} />
              ) : (
                <SpiceCardLink key={`s${c.id}`} spice={c} width={w} />
              ),
            )}
          </View>
        )}
      </Section>
    </Screen>
  );
}

function Row({ icon, label, detail, onPress }: { icon: IconName; label: string; detail?: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} feedback="tap" scaleTo={0.99} ripple style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 16, borderBottomWidth: 1, borderColor: colors.border }}>
      <Icon name={icon} size={24} color={colors.accent} />
      <Text size={18} style={{ flex: 1 }}>
        {label}
      </Text>
      {detail ? (
        <Text size={13} color={colors.text3}>
          {detail}
        </Text>
      ) : null}
      <Icon name="arrow-right" size={20} color={colors.text3} />
    </Press>
  );
}
