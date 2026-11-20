import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { Api } from "@/api/endpoints";
import { useDownloads } from "@/downloads/downloads";
import { plural } from "@/lib/format";
import { kv } from "@/lib/storage";
import { profilePath } from "@/lib/share";
import { Avatar } from "@/profile/Avatar";
import { DownloadsArt, LikedArt, RecentArt } from "@/song/art";
import { CardLink, SpiceCardLink, useGridWidth } from "@/song/cards";
import { openCollectionMenu } from "@/song/collections";
import { SpiceArt } from "@/spice/SpiceArt";
import { DAILY_SPICE_HREF, useDailySpice } from "@/spice/daily";
import { useSpiceDraft } from "@/spice/draft";
import { libraryChanged, sortCollections, usePlaylists, useSharedPlaylists, useSpices } from "@/state/collections";
import { useSession } from "@/state/session";
import { Chip, EmptyState, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { NavRow, PinnedRow } from "@/ui/NavRow";
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
      { label: "New Playlist", icon: "playlist", detail: "Songs you pick, in your order", onPress: newPlaylist },
      {
        label: "New Spice",
        icon: "spice",
        detail: "A mix that grows from a few songs",
        onPress: () => {
          useSpiceDraft.setState({ seeds: [] });
          router.push("/spice/new");
        },
      },
    ],
  });
}

type Filter = "all" | "playlists" | "spices" | "shared";
type Order = "recent" | "name";
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

// Everything that's yours (the web's Library page): the lists that are always
// there, then your playlists and Spices, then what people share with you.
export default function Library() {
  const playlists = usePlaylists();
  const spices = useSpices();
  const shared = useSharedPlaylists();
  const daily = useDailySpice();
  const me = useSession((s) => s.me);
  const w = useGridWidth();
  const downloads = useDownloads((s) => Object.values(s.items).filter((d) => d.state === "done").length);
  const [filter, setFilter] = useState<Filter>("all");
  const [order, setOrderState] = useState<Order>(() => kv.get<Order>("library.order", "recent"));
  const setOrder = (o: Order) => {
    setOrderState(o);
    kv.set("library.order", o);
  };

  const cols = sortCollections(playlists.data, spices.data);
  const nPlaylists = cols.filter((c) => c.type === "playlist").length;
  const nSpices = cols.length - nPlaylists;
  const nShared = shared.data?.length ?? 0;
  const summary =
    [nPlaylists ? plural(nPlaylists, "playlist") : "", nSpices ? plural(nSpices, "Spice") : "", nShared ? `${nShared} shared with you` : ""]
      .filter(Boolean)
      .join(" · ") || (playlists.data ? "Nothing here yet" : " ");
  const own = cols
    .filter((c) => filter === "all" || (filter === "playlists" ? c.type === "playlist" : filter === "spices" ? c.type === "spice" : false))
    .sort((a, b) => (order === "name" ? collator.compare(a.name, b.name) : 0));
  const sharedShown =
    filter === "all" || filter === "shared"
      ? [...(shared.data ?? [])].sort((a, b) => (order === "name" ? collator.compare(a.name, b.name) : 0))
      : [];
  const loading = !playlists.data && playlists.isLoading;
  const filters: [Filter, string][] = [
    ["all", "All"],
    ["playlists", "Playlists"],
    ["spices", "Spices"],
    ...(nShared ? [["shared", "Shared with you"] as [Filter, string]] : []),
  ];

  return (
    <Screen
      tab="(library)"
      title="Your Library"
      titleAt={56}
      refreshing={playlists.isRefetching}
      onRefresh={() => {
        playlists.refetch();
        spices.refetch();
        shared.refetch();
      }}
    >
      <View
        style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginTop: 8, marginBottom: 12 }}
      >
        <View style={{ flexShrink: 1, gap: 4 }}>
          <Text variant="display" numberOfLines={1}>
            Your Library
          </Text>
          <Text variant="subhead" color={colors.text2} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Press
          onPress={openNewMenu}
          scaleTo={0.95}
          accessibilityLabel="New playlist or Spice"
          style={{
            height: 40,
            paddingLeft: 14,
            paddingRight: 18,
            borderRadius: 20,
            backgroundColor: colors.accent,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 2,
          }}
        >
          <Icon name="plus" size={17} color={colors.accentInk} />
          <Text variant="subhead" weight={600} color={colors.accentInk}>
            New
          </Text>
        </Press>
      </View>

      <View>
        <PinnedRow
          art={<LikedArt size={20} />}
          label="Liked Songs"
          detail="Every song you've hearted"
          onPress={() => router.push("/liked")}
          onLongPress={() => openCollectionMenu({ kind: "liked", name: "Liked Songs" })}
        />
        <PinnedRow
          art={<RecentArt size={20} />}
          label="Recently Played"
          detail="What you've played lately"
          onPress={() => router.push("/recent")}
          onLongPress={() => openCollectionMenu({ kind: "recent", name: "Recently Played" })}
        />
        {daily ? (
          <PinnedRow
            art={<SpiceArt name={daily.label} label={false} />}
            label={daily.label}
            detail={`Spice · ${daily.part}, from how you listen`}
            onPress={() => router.push(DAILY_SPICE_HREF as never)}
            onLongPress={() => openCollectionMenu({ kind: "spice", id: "daily", name: daily.label }, { subtitle: `Spice · ${daily.part}` })}
          />
        ) : null}
        <PinnedRow
          art={<DownloadsArt size={20} />}
          label="Downloads"
          detail={downloads ? `${plural(downloads, "song")} on this phone` : "Songs saved for offline"}
          onPress={() => router.push("/downloads")}
        />
        {me?.username ? (
          <NavRow
            leading={<Avatar name={me.name} url={me.avatarUrl} accent={me.accent} size={26} />}
            label="Your profile"
            onPress={() => router.push(profilePath(me.username) as never)}
          />
        ) : null}
        <NavRow icon="settings" label="Settings" onPress={() => router.push("/settings")} last />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 28, marginBottom: 18 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1, marginLeft: -20 }}
          contentContainerStyle={{ gap: 8, paddingLeft: 20, paddingRight: 8 }}
        >
          {filters.map(([value, label]) => (
            <Chip key={value} label={label} selected={filter === value} onPress={() => setFilter(value)} />
          ))}
        </ScrollView>
        <Chip
          label={order === "recent" ? "Recent" : "A to Z"}
          icon="sort"
          accessibilityLabel="Sort"
          onPress={() =>
            openMenu({
              label: "Sort",
              items: [
                { label: "Recently changed", icon: "history", checked: order === "recent", onPress: () => setOrder("recent") },
                { label: "Name", icon: "sort", checked: order === "name", onPress: () => setOrder("name") },
              ],
            })
          }
        />
      </View>

      {loading ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width={w} height={w} radius={16} />
          ))}
        </View>
      ) : !own.length && !sharedShown.length ? (
        <EmptyState
          icon="playlist"
          title={filter === "spices" ? "No Spices yet" : "No playlists yet"}
          body="Make a playlist or a Spice with New, or add a song to one from its menu."
        />
      ) : (
        <Animated.View
          key={`${filter}-${order}`}
          entering={FadeIn.duration(220)}
          style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 22 }}
        >
          {own.map((c) =>
            c.type === "playlist" ? (
              <CardLink
                key={`p${c.id}`}
                title={c.name}
                subtitle={`Playlist · ${plural(c.count, "song")}`}
                artwork={c.artworks[0]}
                width={w}
                collection={{ kind: "playlist", id: c.id, name: c.name }}
              />
            ) : (
              <SpiceCardLink key={`s${c.id}`} spice={c} width={w} />
            ),
          )}
          {sharedShown.map((p) => (
            <CardLink
              key={`sh${p.id}`}
              title={p.name}
              subtitle={`${p.owner.name} · ${plural(p.count, "song")}`}
              artwork={p.artworks[0]}
              width={w}
              collection={{ kind: "playlist", id: p.id, name: p.name, shareable: true }}
            />
          ))}
        </Animated.View>
      )}
    </Screen>
  );
}
