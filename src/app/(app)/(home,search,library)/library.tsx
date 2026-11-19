import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

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
import { Screen } from "@/ui/Screen";
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
      title="Library"
      large
      refreshing={playlists.isRefetching}
      onRefresh={() => {
        playlists.refetch();
        spices.refetch();
      }}
    >
      <View style={{ marginTop: 4 }}>
        <Row icon="heart" label="Liked Songs" onPress={() => router.push("/liked")} />
        <Row icon="history" label="Recently Played" onPress={() => router.push("/recent")} />
        <Row icon="download" label="Downloads" detail={downloads ? plural(downloads, "song") : undefined} onPress={() => router.push("/downloads")} />
        <Row icon="settings" label="Settings" onPress={() => router.push("/settings")} last />
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

function Row({ icon, label, detail, onPress, last }: { icon: IconName; label: string; detail?: string; onPress: () => void; last?: boolean }) {
  return (
    <Press onPress={onPress} feedback={false} scaleTo={1} highlight="rgba(255,255,255,0.06)" style={styles.row}>
      <Icon name={icon} size={22} color={colors.tint} />
      <View style={styles.rowBody}>
        <Text variant="title3" weight={400} style={{ flex: 1 }}>
          {label}
        </Text>
        {detail ? (
          <Text variant="subhead" color={colors.text3}>
            {detail}
          </Text>
        ) : null}
        <Icon name="chevron-right" size={17} color={colors.text3} />
        {last ? null : <View style={styles.line} />}
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 16, marginHorizontal: -20, paddingLeft: 20 },
  rowBody: { flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 20 },
  line: { position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
