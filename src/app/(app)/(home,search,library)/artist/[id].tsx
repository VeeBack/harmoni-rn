import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { Api } from "@/api/endpoints";
import type { AlbumCard, Artist } from "@/api/types";
import { plural, shortDate } from "@/lib/format";
import { useArtworkColors, usePlayback } from "@/player/hooks";
import { player } from "@/player/player";
import { CardLink, useGridWidth } from "@/song/cards";
import { SongList } from "@/song/SongList";
import { Artwork, sized } from "@/ui/Artwork";
import { EmptyState, PlayButton, Section, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { IconButton, Press } from "@/ui/Press";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors, radius } from "@/ui/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TOPBAR } from "@/shell/layout";

const KIND = { album: "Album", ep: "EP", single: "Single", compilation: "Compilation" } as const;

function compact(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["artist", id], queryFn: () => Api.artist(id) });
  const a = q.data;
  return (
    <Screen back title={a?.name} titleAt={260} bleedTop padded={false} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {a ? (
        <Animated.View entering={FadeIn.duration(250)}>
          <Hero a={a} />
          <View style={{ paddingHorizontal: 16 }}>
            <Body a={a} />
          </View>
        </Animated.View>
      ) : q.isError ? (
        <View style={{ padding: 16, paddingTop: 120 }}>
          <EmptyState title="Artist not found" body="Try searching for them; Harmoni learns about artists as you search." />
        </View>
      ) : (
        <View>
          <Skeleton height={360} radius={0} />
          <View style={{ padding: 16, gap: 8 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={52} radius={12} />
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}

function Hero({ a }: { a: Artist }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const theme = useArtworkColors(a.imageUrl);
  const pb = usePlayback();
  const releases = a.albums.length + a.singles.length + a.compilations.length;
  const meta = [a.fans ? `${compact(a.fans)} fans` : null, releases ? plural(releases, "release") : null].filter(Boolean).join(" · ");
  const current = !!pb.song && a.popular.some((s) => s.id === pb.song!.id);
  return (
    <View style={{ minHeight: Math.max(300, Math.min(height * 0.46, 460)), justifyContent: "flex-end", paddingHorizontal: 16, paddingBottom: 24, paddingTop: insets.top + TOPBAR, overflow: "hidden" }}>
      {a.bannerUrl ? (
        <>
          <Image source={{ uri: a.bannerUrl }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{ top: "30%" }} transition={300} />
          <LinearGradient colors={["rgba(18,18,18,0)", "rgba(18,18,18,0.6)", "#121212"]} locations={[0.3, 0.62, 1]} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={["rgba(18,18,18,0.55)", "rgba(18,18,18,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0.55, y: 0 }} style={StyleSheet.absoluteFill} />
        </>
      ) : (
        <LinearGradient colors={[theme?.deep ?? colors.surface2, colors.bg]} style={StyleSheet.absoluteFill} />
      )}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 20 }}>
        {!a.bannerUrl && a.imageUrl ? (
          <View style={{ elevation: 16, shadowColor: "#000", borderRadius: 60 }}>
            <Artwork url={a.imageUrl} size={120} round />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 10 }}>
          <Text size={13} weight={500} color="rgba(255,255,255,0.8)">
            Artist
          </Text>
          <Text size={48} weight={800} style={{ letterSpacing: -1.9, lineHeight: 48, textShadowColor: "rgba(0,0,0,0.25)", textShadowRadius: 30 }}>
            {a.name}
          </Text>
          {meta ? <Text color="rgba(255,255,255,0.78)">{meta}</Text> : null}
          {a.popular.length ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 }}>
              <PlayButton label={`Play ${a.name}`} playing={current && pb.playing} onPress={() => (current ? player.toggle() : player.play(a.popular, 0))} />
              <IconButton label="Shuffle" onPress={() => player.play(a.popular, Math.floor(Math.random() * a.popular.length), { shuffle: true })}>
                <Icon name="shuffle" size={22} color="rgba(255,255,255,0.85)" />
              </IconButton>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} feedback="tap" scaleTo={0.96} style={{ alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, marginTop: 12 }}>
      <Text size={13} weight={600} color={colors.text2}>
        {label}
      </Text>
    </Press>
  );
}

function Grid({ title, items }: { title: string; items: AlbumCard[] }) {
  const w = useGridWidth();
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 12);
  return (
    <Section title={title}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 20 }}>
        {shown.map((al) => (
          <CardLink
            key={al.id}
            title={al.title}
            subtitle={[al.releaseDate?.slice(0, 4), al.kind ? KIND[al.kind] : null].filter(Boolean).join(" · ")}
            artwork={al.artworkUrl}
            width={w}
            onPress={() => router.push(`/album/${al.id}`)}
          />
        ))}
      </View>
      {items.length > 12 ? <Pill label={all ? "Show less" : `Show all ${items.length}`} onPress={() => setAll(!all)} /> : null}
    </Section>
  );
}

function Body({ a }: { a: Artist }) {
  const [more, setMore] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const long = (a.bio?.length ?? 0) > 420;
  return (
    <View>
      <Section title="Popular" style={{ marginTop: 8 }}>
        {a.popular.length ? (
          <>
            <SongList songs={more ? a.popular : a.popular.slice(0, 5)} numbered />
            {a.popular.length > 5 ? <Pill label={more ? "Show less" : "Show more"} onPress={() => setMore(!more)} /> : null}
          </>
        ) : (
          <Text size={13} color={colors.text3}>
            No popular songs found yet.
          </Text>
        )}
      </Section>

      {a.latest ? (
        <Section title="Latest release" style={{ marginTop: 40 }}>
          <Press onPress={() => router.push(`/album/${a.latest!.id}`)} feedback="tap" scaleTo={0.98} style={{ maxWidth: 360, padding: 20, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
            <View style={{ elevation: 12, shadowColor: "#000", borderRadius: 16, marginBottom: 8 }}>
              <Artwork url={a.latest.artworkUrl} radius={16} px={700} />
            </View>
            <Text size={13} color={colors.text2}>
              {a.latest.kind ? KIND[a.latest.kind] : "Release"}
              {a.latest.releaseDate ? ` · ${shortDate(a.latest.releaseDate)}` : ""}
            </Text>
            <Text size={18} weight={600} style={{ lineHeight: 22 }}>
              {a.latest.title}
            </Text>
            {a.latest.trackCount ? (
              <Text size={13} color={colors.text3}>
                {plural(a.latest.trackCount, "song")}
              </Text>
            ) : null}
          </Press>
        </Section>
      ) : null}

      {a.yours.length ? (
        <Section title="Your favourites">
          <SongList songs={a.yours} />
        </Section>
      ) : null}

      <Grid title="Albums" items={a.albums} />
      <Grid title="Singles & EPs" items={a.singles} />
      <Grid title="Compilations" items={a.compilations} />

      {a.bio ? (
        <Section title="About">
          <View style={{ padding: 28, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 16 }}>
            {a.imageUrl ? <Artwork url={a.imageUrl} size={140} radius={24} /> : null}
            {a.fans ? (
              <Text size={18} weight={600}>
                {a.fans.toLocaleString()} fans
              </Text>
            ) : null}
            <Text color={colors.text2} style={{ lineHeight: 24 }} numberOfLines={long && !bioOpen ? 5 : undefined}>
              {a.bio}
            </Text>
            {long ? <Pill label={bioOpen ? "Show less" : "Read more"} onPress={() => setBioOpen(!bioOpen)} /> : null}
          </View>
        </Section>
      ) : null}

      {a.related.length ? (
        <Section title="Fans also like">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 24 }}>
            {a.related.map((r) => (
              <Press key={r.id} onPress={() => router.push(`/artist/${r.id}`)} feedback="tap" scaleTo={0.96} style={{ width: 148, gap: 10, alignItems: "center" }}>
                <Artwork url={sized(r.imageUrl, 450)} size={148} round fallback="user" />
                <Text size={13} weight={500} numberOfLines={1} align="center" style={{ width: 148 }}>
                  {r.name}
                </Text>
              </Press>
            ))}
          </ScrollView>
        </Section>
      ) : null}
    </View>
  );
}
