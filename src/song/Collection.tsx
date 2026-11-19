import { FlashList } from "@shopify/flash-list";
import { BlurTargetView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { StyleSheet, TextInput, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, interpolate, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Song } from "@/api/types";
import { download, removeDownloads, useListDownloadState } from "@/downloads/downloads";
import { matches, plural, sameList, total } from "@/lib/format";
import { kv } from "@/lib/storage";
import { useArtworkColors, usePlayback } from "@/player/hooks";
import { player } from "@/player/player";
import { TOPBAR, useContentBottom } from "@/shell/layout";
import { Artwork } from "@/ui/Artwork";
import { EmptyState, Skeleton } from "@/ui/bits";
import { Icon, type IconName } from "@/ui/Icon";
import { confirm, openMenu, toast, type MenuItem } from "@/ui/overlays";
import { IconButton, Press } from "@/ui/Press";
import { BlurTargetContext, TopBar } from "@/ui/Screen";
import { Spinner } from "@/ui/Spinner";
import { Text } from "@/ui/Text";
import { colors, fonts, radius } from "@/ui/theme";
import { openSongMenu, type Extra } from "./menu";
import { usePlaySong } from "./SongList";
import { SongRow } from "./SongRow";

type SortField = "order" | "title" | "artist";
interface Sort {
  field: SortField;
  descending: boolean;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function sortSongs(songs: Song[], s: Sort): Song[] {
  if (s.field === "order") return s.descending ? songs.slice().reverse() : songs;
  const a1 = (x: Song) => x.artists[0]?.name ?? "";
  return songs
    .map((song, i) => ({ song, i }))
    .sort((a, b) => {
      let c =
        s.field === "title"
          ? collator.compare(a.song.title, b.song.title) || collator.compare(a1(a.song), a1(b.song))
          : collator.compare(a1(a.song), a1(b.song)) || collator.compare(a.song.title, b.song.title);
      if (s.descending) c = -c;
      return c || a.i - b.i;
    })
    .map((x) => x.song);
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
  loadingNote?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  hideDownload?: boolean;
  /** Album tracklists: numbers instead of repeating the same cover on every row. */
  compact?: boolean;
  /** Shown after the kind in the small line (e.g. the year). */
  kindNote?: string;
  /** More buttons in the nav bar, before download and the menu (Share). */
  actions?: ReactNode;
}

/** An album, playlist, Spice or library list, laid out like Apple Music's. */
export function Collection(p: CollectionProps) {
  const insets = useSafeAreaInsets();
  const bottom = useContentBottom();
  const { width } = useWindowDimensions();
  const scrollY = useSharedValue(0);
  const target = useRef<ComponentRef<typeof View>>(null);
  const [sort, setSortState] = useState<Sort>(
    () =>
      (p.sortKey ? kv.get<Record<string, Sort>>("sort", {})[p.sortKey] : undefined) ??
      p.defaultSort ?? { field: "order", descending: false },
  );
  const [query, setQuery] = useState("");
  const [finding, setFinding] = useState(false);
  const findRef = useRef<ComponentRef<typeof TextInput>>(null);

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

  const artSize = Math.round(Math.min(width * 0.66, 280));
  const sortable = !!p.sortKey && !!songs && songs.length > 1;
  const findable = !!p.findLabel && !!songs && songs.length > 1;
  const startFind = () => {
    setFinding(true);
    setTimeout(() => findRef.current?.focus(), 60);
  };

  // The artwork drifts up a little slower than the page, and shrinks as it goes (parallax).
  // Pulled down, the artwork grows; scrolled up, it shrinks toward the top and fades (never into the title).
  const artStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-200, 0], [-100, 0], "clamp") },
      { scale: interpolate(scrollY.value, [-200, 0, artSize], [1.14, 1, 0.9], "clamp") },
    ],
    opacity: interpolate(scrollY.value, [artSize * 0.2, artSize * 0.95], [1, 0], "clamp"),
  }));

  const header = (
    <View>
      <LinearGradient
        colors={[theme ? `${theme.color}66` : "rgba(60,56,50,0.35)", "rgba(12,11,10,0)"]}
        locations={[0, 1]}
        style={[StyleSheet.absoluteFill, { bottom: undefined, height: insets.top + TOPBAR + artSize + 120 }]}
      />
      <View style={{ paddingTop: insets.top + TOPBAR + 12, paddingHorizontal: 20, alignItems: "center" }}>
        <Animated.View
          entering={FadeIn.duration(450)}
          style={[
            styles.art,
            { width: artSize, height: artSize, borderRadius: p.round ? artSize / 2 : radius.md, transformOrigin: "50% 0%" },
            artStyle,
          ]}
        >
          {p.art ?? <Artwork url={firstArt} size={artSize} radius={p.round ? artSize / 2 : radius.md} round={p.round} px={900} />}
        </Animated.View>
        <View style={{ alignSelf: "stretch", alignItems: "center", marginTop: 22, gap: 2 }}>
          <Text variant="title2" align="center" numberOfLines={2}>
            {p.title}
          </Text>
          <Text variant="title3" weight={400} color={colors.tint} align="center" numberOfLines={1}>
            {p.meta ?? p.kind}
          </Text>
          {songs ? (
            <Text variant="footnote" color={colors.text3} align="center" style={{ marginTop: 4 }}>
              {p.meta ? `${p.kind}${p.kindNote ? ` · ${p.kindNote}` : ""} · ` : ""}
              {plural(songs.length, "song")}
              {total(songs) ? ` · ${total(songs)}` : ""}
            </Text>
          ) : null}
          {p.description ? (
            <Text variant="subhead" color={colors.text2} align="center" numberOfLines={3} style={{ marginTop: 8 }}>
              {p.description}
            </Text>
          ) : null}
        </View>
      </View>
      {songs && songs.length ? <PlayShuffle songs={sorted} title={p.title} /> : <View style={{ height: 20 }} />}
      {finding ? (
        <Animated.View entering={FadeInDown.springify().damping(20)} exiting={FadeOut.duration(140)} style={styles.find}>
          <Icon name="search" size={17} color={colors.text3} />
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
            <Text variant="footnote" color={colors.text3}>
              {plural(shown.length, "song")}
            </Text>
          ) : null}
          <Press
            onPress={() => (query ? setQuery("") : setFinding(false))}
            accessibilityLabel={query ? "Clear" : "Close"}
            scaleTo={0.85}
            style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="close" size={16} color={colors.text2} />
          </Press>
        </Animated.View>
      ) : null}
      <View style={{ paddingHorizontal: 20 }}>
        {p.error && !songs?.length ? (
          <EmptyState title={p.error.title} body={p.error.body} icon="cloud-off" />
        ) : !songs ? (
          <View style={{ gap: 16, paddingVertical: 8 }}>
            {p.loadingNote}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Skeleton width={48} height={48} radius={6} delay={i * 80} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton width={`${40 + ((i * 13) % 30)}%`} height={14} delay={i * 80} />
                  <Skeleton width="28%" height={12} delay={i * 80} />
                </View>
              </View>
            ))}
          </View>
        ) : !songs.length && p.empty ? (
          <EmptyState title={p.empty.title} body={p.empty.body} action={p.empty.action} onAction={p.empty.onAction} icon="music" />
        ) : query.trim() && !shown.length ? (
          <EmptyState title="No matches" body={p.noMatch?.(query.trim()) ?? `Nothing here matches “${query.trim()}”.`} icon="search" />
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <BlurTargetContext.Provider value={target}>
        <BlurTargetView ref={target} style={{ flex: 1, backgroundColor: colors.bg }}>
          <FlashList
            data={shown}
            keyExtractor={(s, i) => `${s.id}:${i}`}
            renderItem={({ item, index }) => (
              <View style={{ paddingHorizontal: 20 }}>
                <SongRow
                  song={item}
                  index={index}
                  numbered={p.numbered}
                  compact={p.compact}
                  onPress={onPress}
                  onMore={onMore}
                  last={index === shown.length - 1}
                />
              </View>
            )}
            ListHeaderComponent={header}
            ListFooterComponent={
              <View style={{ paddingHorizontal: 20 }}>
                {p.footer}
                {p.below}
              </View>
            }
            contentContainerStyle={{ paddingBottom: bottom }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshing={p.refreshing}
            onRefresh={p.onRefresh}
            progressViewOffset={insets.top + TOPBAR}
          />
        </BlurTargetView>
        <TopBar
          back
          avatar={false}
          title={p.title}
          scrollY={scrollY}
          titleAt={artSize + 40}
          target={target}
          right={
            songs && (songs.length || p.menu) ? (
              <Toolbar
                songs={sorted}
                title={p.title}
                hideDownload={p.hideDownload}
                sortable={sortable}
                sort={sort}
                onSort={setSort}
                orderLabel={p.orderLabel ?? "Date added"}
                orderIcon={p.orderIcon ?? "history"}
                findLabel={findable ? p.findLabel : undefined}
                onFind={startFind}
                menu={p.menu}
                menuLabel={p.menuLabel}
                artwork={firstArt}
                subtitle={typeof p.meta === "string" ? p.meta : p.kind}
                actions={p.actions}
              />
            ) : null
          }
        />
      </BlurTargetContext.Provider>
    </View>
  );
}

/** The two big capsules under the title: Play and Shuffle. */
function PlayShuffle({ songs, title }: { songs: Song[]; title: string }) {
  const pb = usePlayback();
  const isCurrent = pb.queue.length === songs.length && sameList(pb.queue, songs);
  const playing = isCurrent && pb.playing;
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 20, marginTop: 22, marginBottom: 18 }}>
      <Press
        onPress={() => (isCurrent ? player.toggle() : player.play(songs, 0))}
        feedback={playing ? "toggleOff" : "toggleOn"}
        scaleTo={0.96}
        accessibilityLabel={playing ? "Pause" : `Play ${title}`}
        style={styles.capsule}
      >
        <Icon name={playing ? "pause" : "play"} size={20} color={colors.tint} />
        <Text variant="headline" color={colors.tint}>
          {playing ? "Pause" : "Play"}
        </Text>
      </Press>
      <Press
        onPress={() => player.play(songs, Math.floor(Math.random() * songs.length), { shuffle: true })}
        scaleTo={0.96}
        accessibilityLabel="Shuffle"
        style={styles.capsule}
      >
        <Icon name="shuffle" size={20} color={colors.tint} />
        <Text variant="headline" color={colors.tint}>
          Shuffle
        </Text>
      </Press>
    </View>
  );
}

/** The nav bar's buttons: download state, and a menu with sort, find and the list's own actions. */
function Toolbar({
  songs,
  title,
  hideDownload,
  sortable,
  sort,
  onSort,
  orderLabel,
  orderIcon,
  findLabel,
  onFind,
  menu,
  menuLabel,
  artwork,
  subtitle,
  actions,
}: {
  actions?: ReactNode;
  songs: Song[];
  title: string;
  hideDownload?: boolean;
  sortable: boolean;
  sort: Sort;
  onSort: (s: Sort) => void;
  orderLabel: string;
  orderIcon: IconName;
  findLabel?: string;
  onFind: () => void;
  menu?: () => MenuItem[];
  menuLabel?: string;
  artwork?: string | null;
  subtitle?: string;
}) {
  const dl = useListDownloadState(songs);
  const askRemove = async () => {
    const yes = await confirm({
      title: "Remove downloads?",
      note: `The ${plural(dl.saved + dl.saving, "song")} from ${title} saved on this phone will be removed. You can download them again any time.`,
      confirm: "Remove",
      danger: true,
    });
    if (yes) removeDownloads(songs.map((s) => s.id));
  };
  // Tap downloads whatever isn't saved yet; only a fully saved list offers to remove.
  const onDownload = () => {
    if (dl.state === "all") return askRemove();
    const n = download(songs);
    if (n === 0) toast(dl.saving ? "Already saving these" : "Already on this phone");
    else toast(n === 1 ? "Saving 1 song for offline" : `Saving ${n.toLocaleString()} songs for offline`);
  };
  const onDownloadLong = () => {
    if (dl.saved + dl.saving === 0) return;
    openMenu({
      label: "Downloads",
      preview: { title, subtitle: `${plural(dl.saved, "song")} on this phone`, artwork },
      items: [
        ...(dl.state !== "all" ? [{ label: "Download the rest", icon: "download" as const, onPress: onDownload }] : []),
        { label: `Remove ${plural(dl.saved + dl.saving, "download")}`, icon: "trash" as const, danger: true, onPress: askRemove },
      ],
    });
  };
  const sortLabel = sort.field === "order" ? orderLabel : sort.field === "title" ? "Title" : "Artist";
  const openMore = () =>
    openMenu({
      label: menuLabel ?? title,
      preview: { title, subtitle, artwork },
      items: () => {
        const items: MenuItem[] = [];
        if (findLabel) items.push({ label: findLabel, icon: "search", onPress: onFind });
        if (sortable)
          items.push({
            label: "Sort by",
            icon: "sort",
            detail: `${sortLabel}, ${sort.descending ? "descending" : "ascending"}`,
            submenu: () => [
              {
                label: orderLabel,
                icon: orderIcon,
                checked: sort.field === "order",
                keepOpen: true,
                onPress: () => onSort({ ...sort, field: "order" }),
              },
              {
                label: "Title",
                icon: "music",
                checked: sort.field === "title",
                keepOpen: true,
                onPress: () => onSort({ ...sort, field: "title" }),
              },
              {
                label: "Artist",
                icon: "user",
                checked: sort.field === "artist",
                keepOpen: true,
                onPress: () => onSort({ ...sort, field: "artist" }),
              },
              "divider",
              {
                label: "Ascending",
                icon: "arrow-up",
                checked: !sort.descending,
                keepOpen: true,
                onPress: () => onSort({ ...sort, descending: false }),
              },
              {
                label: "Descending",
                icon: "arrow-down",
                checked: sort.descending,
                keepOpen: true,
                onPress: () => onSort({ ...sort, descending: true }),
              },
            ],
          });
        const own = menu?.() ?? [];
        if (own.length && items.length) items.push("divider");
        return [...items, ...own];
      },
    });
  const hasMore = !!findLabel || sortable || !!menu;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {actions}
      {!hideDownload && songs.length ? (
        <IconButton
          label={dl.state === "all" ? "Downloaded" : dl.saving ? "Downloading" : "Download"}
          onPress={onDownload}
          onLongPress={onDownloadLong}
          size={40}
        >
          {dl.saving > 0 ? (
            <Spinner size={20} color={colors.tint} />
          ) : (
            <Icon
              name={dl.state === "all" ? "download-solid" : "download"}
              size={22}
              color={dl.state === "all" ? colors.accent : colors.tint}
            />
          )}
        </IconButton>
      ) : null}
      {hasMore ? (
        <IconButton label={menuLabel ?? "More"} onPress={openMore} size={40} feedback="contextClick">
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: "rgba(242,221,191,0.14)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="ellipsis" size={18} color={colors.tint} />
          </View>
        </IconButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  art: {
    overflow: "hidden",
    backgroundColor: colors.surface2,
    elevation: 24,
    shadowColor: "#000",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.06)",
  },
  capsule: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  find: {
    marginHorizontal: 20,
    marginBottom: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 6,
    gap: 8,
  },
});
