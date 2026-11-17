import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { Api } from "@/api/endpoints";
import type { Home as HomeData, Shelf, Song } from "@/api/types";
import { greeting, joinNames, plural, sameList } from "@/lib/format";
import { inkFor, useArtworkColors, usePlayback } from "@/player/hooks";
import { player } from "@/player/player";
import { sized } from "@/ui/Artwork";
import { ArtistRow, CardLink, Shelf as CardShelf, SongCard, useShelfWidth } from "@/song/cards";
import { SongList } from "@/song/SongList";
import { useSession } from "@/state/session";
import { Button } from "@/ui/Button";
import { EmptyState, PlayButton, Section, Skeleton } from "@/ui/bits";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors, radius } from "@/ui/theme";

export default function Home() {
  const me = useSession((s) => s.me);
  const q = useQuery({ queryKey: ["home"], queryFn: Api.home });
  const data = q.data;
  return (
    <Screen tab="(home)" refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {!data ? (
        q.isError ? (
          <View style={{ marginTop: 24 }}>
            <EmptyState title="Couldn't load your home" body="Something went wrong talking to the server. Pull down to try again." icon="cloud-off" />
          </View>
        ) : (
          <HomeSkeleton />
        )
      ) : (
        <Animated.View entering={FadeIn.duration(260)}>
          <HomeBody data={data} name={me?.name} />
        </Animated.View>
      )}
    </Screen>
  );
}

function HomeSkeleton() {
  const w = useShelfWidth();
  return (
    <View style={{ marginTop: 8 }}>
      <Skeleton height={320} radius={24} />
      <View style={{ marginTop: 32, gap: 16 }}>
        <Skeleton width={200} height={28} />
        <View style={{ flexDirection: "row", gap: 14 }}>
          <Skeleton width={w} height={w} radius={16} />
          <Skeleton width={w} height={w} radius={16} />
          <Skeleton width={w} height={w} radius={16} />
        </View>
      </View>
    </View>
  );
}

function HomeBody({ data, name }: { data: HomeData; name?: string }) {
  const w = useShelfWidth();
  const fresh = !data.recent.length && !data.liked.length;
  const mix = data.shelves?.find((s) => s.kind === "mix") as { kind: "mix"; songs: Song[] } | undefined;
  return (
    <View>
      <Hero data={data} name={name} mix={mix} fresh={fresh} />

      {data.recent.length ? (
        <Section title="Jump back in" link="See all" onLink={() => router.push("/recent")}>
          <CardShelf itemWidth={w}>
            {data.recent.slice(0, 6).map((s, i) => (
              <SongCard key={s.id} song={s} list={data.recent} index={i} width={w} />
            ))}
          </CardShelf>
        </Section>
      ) : null}

      {data.shelves?.map((shelf, i) => <ShelfView key={`${shelf.kind}${i}`} shelf={shelf} width={w} />)}

      {data.shelves && !data.shelves.length && !fresh ? (
        <Section title="Made for you">
          <EmptyState title="Your mixes are on the way" body="Harmoni is learning what you like. Keep listening and your home screen will fill with picks for you." />
        </Section>
      ) : null}

      {data.liked.length ? (
        <Section title="Songs you love" link="See all" onLink={() => router.push("/liked")}>
          <SongList songs={data.liked.slice(0, 6)} />
        </Section>
      ) : null}

      {data.playlists.length ? (
        <Section title="Your playlists">
          <CardShelf itemWidth={w}>
            {data.playlists.map((p) => (
              <CardLink key={p.id} title={p.name} subtitle={plural(p.count, "song")} artwork={p.artworks[0]} width={w} onPress={() => router.push(`/playlist/${p.id}`)} />
            ))}
          </CardShelf>
        </Section>
      ) : null}

      {data.shelves === undefined && !fresh ? (
        <Section title="Made for you">
          <EmptyState
            title="Get mixes made for you"
            body="Turn on Super Processing and Harmoni learns what you like from how you listen, then fills this page with new finds, old favourites and a mix of its own."
            action="Turn it on in Settings"
            onAction={() => router.push("/settings")}
          />
        </Section>
      ) : null}

      {fresh ? (
        <Section title="How Harmoni works">
          <EmptyState
            title="One search, every source"
            body="Search once and Harmoni asks YouTube Music, Deezer, iTunes and TIDAL together, then merges the results so each song shows up once. If one source goes down, your music keeps playing from another."
          />
        </Section>
      ) : null}
    </View>
  );
}

function ShelfView({ shelf, width }: { shelf: Shelf; width: number }) {
  switch (shelf.kind) {
    case "mix":
      return shelf.songs.length ? (
        <Section title="From your mix">
          <SongList songs={shelf.songs.slice(0, 6)} />
        </Section>
      ) : null;
    case "rediscover":
      return shelf.songs.length ? (
        <Section title="Rediscover">
          <SongList songs={shelf.songs.slice(0, 6)} />
        </Section>
      ) : null;
    case "because":
    case "repeat":
      return shelf.songs.length ? (
        <Section title={shelf.kind === "because" ? `More like ${shelf.seed.title}` : "On repeat"}>
          <CardShelf itemWidth={width}>
            {shelf.songs.slice(0, 6).map((s, i) => (
              <SongCard key={s.id} song={s} list={shelf.songs} index={i} width={width} />
            ))}
          </CardShelf>
        </Section>
      ) : null;
    case "artists":
    case "top-artists":
      return shelf.artists.length ? (
        <Section title={shelf.kind === "artists" ? "Artists you might like" : "Your top artists"}>
          <ArtistRow artists={shelf.artists} />
        </Section>
      ) : null;
  }
}

function distinctArtists(songs: Song[], max: number): string[] {
  const out: string[] = [];
  for (const s of songs) {
    const n = s.artists[0]?.name;
    if (n && !out.includes(n)) out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

function Hero({ data, name, mix, fresh }: { data: HomeData; name?: string; mix?: { kind: "mix"; songs: Song[] }; fresh: boolean }) {
  const pb = usePlayback();
  const eyebrow = greeting(name);
  let title: string;
  let text: string;
  let songs: Song[] = [];
  let label = "";
  if (mix && mix.songs.length) {
    songs = mix.songs;
    const names = distinctArtists(songs, 3);
    title = "Your mix, made for you";
    text = names.length ? `New music picked from how you listen, with ${joinNames(names)}.` : "New music picked from how you listen.";
    label = "Play your mix";
  } else if (fresh) {
    title = "Let's find your sound";
    text = "Search for a song or an artist you love.";
  } else {
    songs = data.recent;
    const first = data.recent[0];
    const others = distinctArtists(data.recent.slice(1), 3).filter((n) => n !== first?.artists[0]?.name).slice(0, 2);
    title = "Pick up where you left off";
    text = first
      ? `You were listening to ${first.title} by ${first.artists[0]?.name ?? "someone"}${others.length ? `, with a bit of ${joinNames(others)} before that.` : "."}`
      : "";
    label = "Play your recent songs";
  }
  const art = songs.find((s) => s.artworkUrl)?.artworkUrl;
  const theme = useArtworkColors(art);
  const { ink, inkMuted } = theme ? inkFor(theme) : { ink: colors.text, inkMuted: colors.text2 };
  const isCurrentList = songs.length > 0 && pb.queue.length === songs.length && sameList(pb.queue, songs);
  const playingThis = isCurrentList && pb.playing;
  return (
    <View style={{ marginTop: 8, borderRadius: radius.xl, overflow: "hidden", backgroundColor: theme?.color ?? colors.surface2 }}>
      {art ? (
        <View style={StyleSheet.absoluteFill}>
          <Image source={{ uri: sized(art, 900) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          <LinearGradient colors={["rgba(0,0,0,0)", theme?.color ?? colors.surface2]} locations={[0.1, 0.92]} style={StyleSheet.absoluteFill} />
        </View>
      ) : null}
      <View style={{ paddingTop: art ? 160 : 40, paddingHorizontal: 22, paddingBottom: 22, gap: 8 }}>
        <Text weight={500} color={inkMuted}>
          {eyebrow}
        </Text>
        <Text size={32} weight={700} color={ink} style={{ letterSpacing: -0.96, lineHeight: 34 }}>
          {title}
        </Text>
        {text ? (
          <Text color={inkMuted} style={{ lineHeight: 21 }}>
            {text}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 8 }}>
          {fresh ? (
            <Button label="Start searching" icon="search" onPress={() => router.navigate("/search")} />
          ) : (
            <>
              <PlayButton
                playing={playingThis}
                label={label}
                bg={theme ? ink : colors.accent}
                fg={theme ? theme.color : colors.accentInk}
                onPress={() => (isCurrentList ? player.toggle() : player.play(songs, 0))}
              />
              <Text color={inkMuted}>{plural(songs.length, "song")}</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
