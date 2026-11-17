import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { TextInput, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Song } from "@/api/types";
import { download, removeDownloads, useListDownloadState } from "@/downloads/downloads";
import { matches, plural, sameList, total } from "@/lib/format";
import { kv } from "@/lib/storage";
import { useArtworkColors, usePlayback } from "@/player/hooks";
import { player } from "@/player/player";
import { useContentBottom } from "@/shell/layout";
import { Artwork } from "@/ui/Artwork";
import { EmptyState, PlayButton, Skeleton } from "@/ui/bits";
import { Icon, type IconName } from "@/ui/Icon";
import { confirm, openMenu, toast, type MenuItem } from "@/ui/overlays";
import { IconButton, Press } from "@/ui/Press";
import { Spinner } from "@/ui/Spinner";
import { TopBar } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors, fonts, radius } from "@/ui/theme";
import { TOPBAR } from "@/shell/layout";
import { openSongMenu, type Extra } from "./menu";
import { SongRow } from "./SongRow";
import { usePlaySong } from "./SongList";

type SortField = "order" | "title" | "artist";
interface Sort {
  field: SortField;
  descending: boolean;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function sortSongs(songs: Song[], s: Sort): Song[] {
  if (s.field === "order") return s.descending ? songs.slice().reverse() : songs;
  const a1 = (x: Song) => x.artists[0]?.name ?? "";
  const out = songs
    .map((song, i) => ({ song, i }))
    .sort((a, b) => {
      let c = s.field === "title" ? collator.compare(a.song.title, b.song.title) || collator.compare(a1(a.song), a1(b.song)) : collator.compare(a1(a.song), a1(b.song)) || collator.compare(a.song.title, b.song.title);
      if (s.descending) c = -c;
      return c || a.i - b.i;
    });
  return out.map((x) => x.song);
}

export interface CollectionProps {
  kind: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  art?: ReactNode;
  artUrl?: string;
  round?: boolean;
  songs: Song[] | undefined;
  loading?: boolean;
  error?: { title: string; body: string } | null;
  numbered?: boolean;
  sortKey?: string;
  orderLabel?: string;
  orderIcon?: IconName;
  defaultSort?: Sort;
  findLabel?: string;
  menu?: () => MenuItem[];
  menuLabel?: string;
  rowExtras?: (song: Song, i: number) => Extra[];
  empty?: { title: string; body: string; action?: string; onAction?: () => void };
  noMatch?: (q: string) => string;
  footer?: ReactNode;
  below?: ReactNode;
  loadingNote?: string;
  /** Map from a displayed row back to its index in the original list (for playlists' itemIds). */
  onRefresh?: () => void;
  refreshing?: boolean;
  hideDownload?: boolean;
}

export function Collection(p: CollectionProps) {
  const insets = useSafeAreaInsets();
  const bottom = useContentBottom();
  const { width } = useWindowDimensions();
  const scrollY = useSharedValue(0);
  const [sort, setSortState] = useState<Sort>(() => (p.sortKey ? kv.get<Record<string, Sort>>("sort", {})[p.sortKey] : undefined) ?? p.defaultSort ?? { field: "order", descending: false });
  const [query, setQuery] = useState("");
  const [finding, setFinding] = useState(false);
  const findRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const setSort = (s: Sort) => {
    setSortState(s);
    if (p.sortKey) kv.set("sort", { ...kv.get<Record<string, Sort>>("sort", {}), [p.sortKey]: s });
  };

  const songs = p.songs;
  const sorted = useMemo(() => (songs ? (p.sortKey ? sortSongs(songs, sort) : songs) : []), [songs, sort, p.sortKey]);
  const shown = useMemo(() => (query.trim() ? sorted.filter((s) => matches(s, query)) : sorted), [sorted, query]);
  const firstArt = p.artUrl ?? songs?.find((s) => s.artworkUrl)?.artworkUrl;
  const theme = useArtworkColors(firstArt);
  const onPress = usePlaySong(shown);
  const extrasRef = useRef(p.rowExtras);
  extrasRef.current = p.rowExtras;
  const onMore = useCallback((song: Song, i: number) => openSongMenu(song, extrasRef.current?.(song, i) ?? []), []);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = e.nativeEvent.contentOffset.y;
  };

  const artSize = Math.min(width * 0.64, 260);
  const header = (
    <View>
      <View style={{ paddingTop: insets.top + TOPBAR + 20, paddingHorizontal: 16, paddingBottom: 8, alignItems: "center", gap: 18 }}>
        <LinearGradient colors={[theme ? `${theme.color}73` : "rgba(46,46,46,0.45)", "rgba(18,18,18,0)"]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: -40 }} />
        <Animated.View entering={FadeIn.duration(400)} style={{ width: artSize, height: artSize, borderRadius: p.round ? artSize / 2 : radius.lg, overflow: "hidden", elevation: 20, shadowColor: "#000", backgroundColor: colors.surface2 }}>
          {p.art ?? <Artwork url={firstArt} size={artSize} radius={p.round ? artSize / 2 : radius.lg} round={p.round} px={800} />}
        </Animated.View>
        <View style={{ alignItems: "center", gap: 6 }}>
          <Text size={13} weight={500} color={colors.text2}>
            {p.kind}
          </Text>
          <Text size={24} weight={700} align="center" style={{ letterSpacing: -0.48, lineHeight: 27 }}>
            {p.title}
          </Text>
          {p.description ? (
            <Text color={colors.text2} align="center" style={{ lineHeight: 21 }}>
              {p.description}
            </Text>
          ) : null}
          {songs ? (
            <Text size={13} color={colors.text2} align="center">
              {p.meta ? <>{p.meta} · </> : null}
              {plural(songs.length, "song")}
              {total(songs) ? `, ${total(songs)}` : ""}
            </Text>
          ) : null}
        </View>
      </View>
      {songs && songs.length ? (
        <Actions
          songs={sorted}
          title={p.title}
          menu={p.menu}
          menuLabel={p.menuLabel}
          sortable={!!p.sortKey && songs.length > 1}
          findable={!!p.findLabel && songs.length > 1}
          sort={sort}
          onSort={setSort}
          orderLabel={p.orderLabel ?? "Date added"}
          orderIcon={p.orderIcon ?? "history"}
          onFind={() => {
            setFinding(true);
            setTimeout(() => findRef.current?.focus(), 50);
          }}
          hideDownload={p.hideDownload}
        />
      ) : null}
      {finding ? (
        <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(140)} style={{ marginHorizontal: 16, marginBottom: 12, height: 40, borderRadius: 999, backgroundColor: colors.surface2, flexDirection: "row", alignItems: "center", paddingLeft: 14, paddingRight: 6, gap: 8 }}>
          <Icon name="search" size={17} color={colors.text2} />
          <TextInput
            ref={findRef}
            value={query}
            onChangeText={setQuery}
            placeholder={p.findLabel}
            placeholderTextColor={colors.text3}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            returnKeyType="done"
            onBlur={() => !query && setFinding(false)}
            style={{ flex: 1, color: colors.text, fontFamily: fonts[400], fontSize: 16, paddingVertical: 0 }}
          />
          {query ? (
            <Text size={13} color={colors.text3}>
              {plural(shown.length, "song")}
            </Text>
          ) : null}
          <Press
            onPress={() => {
              if (query) setQuery("");
              else setFinding(false);
            }}
            accessibilityLabel={query ? "Clear" : "Close"}
            scaleTo={0.85}
            style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="close" size={16} color={colors.text2} />
          </Press>
        </Animated.View>
      ) : null}
      <View style={{ paddingHorizontal: 16 }}>
        {p.error ? (
          <EmptyState title={p.error.title} body={p.error.body} />
        ) : !songs ? (
          <View style={{ gap: 14, paddingVertical: 16 }}>
            {p.loadingNote ? (
              <Text size={13} color={colors.text2}>
                {p.loadingNote}
              </Text>
            ) : null}
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={52} radius={12} />
            ))}
          </View>
        ) : !songs.length && p.empty ? (
          <EmptyState title={p.empty.title} body={p.empty.body} action={p.empty.action} onAction={p.empty.onAction} />
        ) : query.trim() && !shown.length ? (
          <EmptyState title="No matches" body={p.noMatch?.(query.trim()) ?? `Nothing here matches “${query.trim()}”.`} />
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlashList
        data={shown}
        keyExtractor={(s, i) => `${s.id}:${i}`}
        renderItem={({ item, index }) => (
          <View style={{ paddingHorizontal: 16 }}>
            <SongRow song={item} index={index} numbered={p.numbered} onPress={onPress} onMore={onMore} />
          </View>
        )}
        ListHeaderComponent={header}
        ListFooterComponent={
          <View style={{ paddingHorizontal: 16 }}>
            {p.footer}
            {p.below}
          </View>
        }
        contentContainerStyle={{ paddingBottom: bottom }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        keyboardShouldPersistTaps="handled"
        refreshing={p.refreshing}
        onRefresh={p.onRefresh}
        progressViewOffset={insets.top + TOPBAR}
      />
      <TopBar back title={p.title} scrollY={scrollY} titleAt={artSize + 60} />
    </View>
  );
}

function Actions({
  songs,
  title,
  menu,
  menuLabel,
  sortable,
  findable,
  sort,
  onSort,
  orderLabel,
  orderIcon,
  onFind,
  hideDownload,
}: {
  songs: Song[];
  title: string;
  menu?: () => MenuItem[];
  menuLabel?: string;
  sortable: boolean;
  findable: boolean;
  sort: Sort;
  onSort: (s: Sort) => void;
  orderLabel: string;
  orderIcon: IconName;
  onFind: () => void;
  hideDownload?: boolean;
}) {
  const pb = usePlayback();
  const isCurrent = pb.queue.length === songs.length && sameList(pb.queue, songs);
  const dl = useListDownloadState(songs);
  const sortLabel = sort.field === "order" ? orderLabel : sort.field === "title" ? "Title" : "Artist";
  const openSort = () =>
    openMenu({
      label: "Sort",
      items: () => [
        { label: orderLabel, icon: orderIcon, checked: sort.field === "order", keepOpen: true, onPress: () => onSort({ ...sort, field: "order" }) },
        { label: "Title", icon: "music", checked: sort.field === "title", keepOpen: true, onPress: () => onSort({ ...sort, field: "title" }) },
        { label: "Artist", icon: "user", checked: sort.field === "artist", keepOpen: true, onPress: () => onSort({ ...sort, field: "artist" }) },
        "divider",
        { label: "Ascending", icon: "arrow-up", checked: !sort.descending, keepOpen: true, onPress: () => onSort({ ...sort, descending: false }) },
        { label: "Descending", icon: "arrow-down", checked: sort.descending, keepOpen: true, onPress: () => onSort({ ...sort, descending: true }) },
      ],
    });
  const onDownload = async () => {
    if (dl.state === "none") {
      const n = download(songs);
      toast(n === 1 ? "Saving 1 song for offline" : `Saving ${n} songs for offline`);
      return;
    }
    const yes = await confirm({ title: "Remove downloads?", note: `The ${plural(dl.saved + dl.saving, "song")} from ${title} saved on this phone will be removed. You can download them again any time.`, confirm: "Remove", danger: true });
    if (yes) removeDownloads(songs.map((s) => s.id));
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, marginTop: 12, marginBottom: 20 }}>
      <PlayButton playing={isCurrent && pb.playing} label={`Play ${title}`} onPress={() => (isCurrent ? player.toggle() : player.play(songs, 0))} />
      <IconButton label="Shuffle play" onPress={() => player.play(songs, Math.floor(Math.random() * songs.length), { shuffle: true })}>
        <Icon name="shuffle" size={22} color={colors.text2} />
      </IconButton>
      {!hideDownload ? (
        <IconButton label={dl.state === "all" ? "Downloaded" : dl.state === "some" ? "Downloading" : "Download"} onPress={onDownload}>
          {dl.saving > 0 ? <Spinner size={20} color={colors.accent} /> : <Icon name={dl.state === "all" ? "download-solid" : "download"} size={22} color={dl.state === "all" ? colors.accent : colors.text2} />}
        </IconButton>
      ) : null}
      {menu ? (
        <IconButton label={menuLabel ?? "More"} onPress={() => openMenu({ items: menu, label: menuLabel })} feedback="contextClick">
          <Icon name="more" size={22} color={colors.text2} />
        </IconButton>
      ) : null}
      <View style={{ flex: 1 }} />
      {findable ? (
        <IconButton label="Find" onPress={onFind}>
          <Icon name="search" size={20} color={colors.text2} />
        </IconButton>
      ) : null}
      {sortable ? (
        <Press onPress={openSort} feedback="tap" scaleTo={0.95} accessibilityLabel={`Sort by ${sortLabel}`} style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface3, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name={sort.descending ? "arrow-down" : "arrow-up"} size={15} />
          <Text size={13} weight={500}>
            {sortLabel}
          </Text>
        </Press>
      ) : null}
    </View>
  );
}
