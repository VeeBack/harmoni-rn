import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { Api } from "@/api/endpoints";
import type { ArtistCard, Home as HomeData, Shelf, Song } from "@/api/types";
import { Hero, HeroPill, HeroSkeletonShape } from "@/home/Hero";
import { BELOW_HERO, SHORTCUT_GAP, Shortcuts, useShortcutWidth } from "@/home/Shortcuts";
import { whenPhrase } from "@/lib/day-part";
import { greeting, plural, sameList } from "@/lib/format";
import { usePlayback } from "@/player/hooks";
import { player } from "@/player/player";
import { ArtistRow, CardLink, Shelf as CardShelf, SongCard, SpiceCardLink, useShelfWidth } from "@/song/cards";
import { openCollectionMenu, runCollection, useIsLoading, type CollectionRef } from "@/song/collections";
import { SongTiles } from "@/song/tiles";
import { DAILY_SPICE_HREF, useDailySpice } from "@/spice/daily";
import { useCollections } from "@/state/collections";
import { useSession } from "@/state/session";
import { searchFocus } from "@/shell/state";
import { EmptyState, PlayButton, Section, Skeleton } from "@/ui/bits";
import { Screen } from "@/ui/Screen";
import { Kicker, Text } from "@/ui/Text";

const today = () => new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

/** The date and greeting, kept fresh across midnight and the day's parts. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// Home, top to bottom (the web's): who it's for and when; the one thing to
// play now, then the places you go most; then shelves, most personal first.
export default function Home() {
  const me = useSession((s) => s.me);
  const q = useQuery({ queryKey: ["home"], queryFn: Api.home });
  const data = q.data;
  useNow();
  return (
    <Screen tab="(home)" title="Home" titleAt={64} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View style={{ marginTop: 8, marginBottom: 20 }}>
        <Kicker color="rgba(244,243,241,0.53)">{today()}</Kicker>
        <Text variant="display" style={{ marginTop: 6 }}>
          {greeting(me?.name)}
        </Text>
      </View>
      {!data ? (
        q.isError ? (
          <EmptyState
            title="Couldn't load your home"
            body="Something went wrong talking to the server. Pull down to try again."
            icon="cloud-off"
          />
        ) : (
          <HomeSkeleton />
        )
      ) : (
        <Animated.View entering={FadeIn.duration(280)}>
          <HomeBody data={data} />
        </Animated.View>
      )}
    </Screen>
  );
}

function HomeSkeleton() {
  const w = useShelfWidth();
  const tile = useShortcutWidth();
  return (
    <View>
      <HeroSkeletonShape />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SHORTCUT_GAP, marginTop: BELOW_HERO }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width={tile} height={56} radius={12} />
        ))}
      </View>
      <View style={{ marginTop: 40, gap: 14 }}>
        <Skeleton width={180} height={24} />
        <View style={{ flexDirection: "row", gap: 14 }}>
          <Skeleton width={w} height={w} radius={16} />
          <Skeleton width={w} height={w} radius={16} />
          <Skeleton width={w} height={w} radius={16} />
        </View>
      </View>
    </View>
  );
}

function HomeBody({ data }: { data: HomeData }) {
  const w = useShelfWidth();
  const collections = useCollections();
  const fresh = !data.recent.length && !data.liked.length;
  const shelves = data.shelves ?? [];
  return (
    <View>
      {data.shelves && !fresh ? <SpiceHero recent={data.recent} /> : fresh ? <WelcomeHero /> : <ResumeHero recent={data.recent} />}
      <Shortcuts />

      {data.recent.length ? (
        <Section title="Jump back in" subtitle="What you've been playing lately" onLink={() => router.push("/recent")}>
          <CardShelf itemWidth={w}>
            {data.recent.slice(0, 16).map((s, i) => (
              <SongCard key={`${s.id}-${i}`} song={s} list={data.recent} index={i} width={w} />
            ))}
          </CardShelf>
        </Section>
      ) : null}

      {shelves.map((shelf, i) => (
        <PersonalShelf key={`${shelf.kind}${i}`} shelf={shelf} width={w} />
      ))}

      {data.shelves && !shelves.length && !fresh ? (
        <Section title="Made for you">
          <EmptyState
            icon="sparkle"
            title="Your mixes are on the way"
            body="Harmoni is learning what you like. Keep listening and your home screen will fill with picks for you."
          />
        </Section>
      ) : null}

      {data.liked.length ? (
        <Section title="Songs you love" subtitle="Your latest likes" onLink={() => router.push("/liked")}>
          <SongTiles songs={data.liked.slice(0, 16)} />
        </Section>
      ) : null}

      {collections.length ? (
        <Section title="Your playlists and Spices" onLink={() => router.navigate("/library" as never)}>
          <CardShelf itemWidth={w}>
            {collections.map((c) =>
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
          </CardShelf>
        </Section>
      ) : null}

      {data.shelves === undefined && !fresh ? (
        <Section title="Made for you">
          <EmptyState
            icon="sparkle"
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
            icon="globe"
            title="One search, every source"
            body="Search once and Harmoni asks YouTube Music, Deezer, iTunes and TIDAL together, then merges the results so each song shows up once. If one source goes down, your music keeps playing from another."
          />
        </Section>
      ) : null}
    </View>
  );
}

function PersonalShelf({ shelf, width }: { shelf: Shelf; width: number }) {
  switch (shelf.kind) {
    case "mix":
      return <SongShelf title="From your mix" subtitle="New music picked from how you listen" songs={shelf.songs} width={width} />;
    case "because":
      return (
        <SongShelf
          title={`More like ${shelf.seed.title}`}
          subtitle={`Because you play ${shelf.seed.artists[0]?.name ?? "it"}`}
          songs={shelf.songs}
          width={width}
        />
      );
    case "repeat":
      return <SongShelf title="On repeat" subtitle="The songs you can't stop playing" songs={shelf.songs} width={width} />;
    case "rediscover":
      return shelf.songs.length ? (
        <Section title="Rediscover" subtitle="Old favourites you haven't heard in a while">
          <SongTiles songs={shelf.songs} />
        </Section>
      ) : null;
    case "artists":
      return <ArtistShelf title="Artists you might like" artists={shelf.artists} />;
    case "top-artists":
      return <ArtistShelf title="Your top artists" artists={shelf.artists} />;
  }
}

// Playing one card queues the whole shelf after it.
function SongShelf({ title, subtitle, songs, width }: { title: string; subtitle?: string; songs: Song[]; width: number }) {
  if (!songs.length) return null;
  return (
    <Section title={title} subtitle={subtitle}>
      <CardShelf itemWidth={width}>
        {songs.map((s, i) => (
          <SongCard key={`${s.id}-${i}`} song={s} list={songs} index={i} width={width} />
        ))}
      </CardShelf>
    </Section>
  );
}

function ArtistShelf({ title, artists }: { title: string; artists: ArtistCard[] }) {
  if (!artists.length) return null;
  return (
    <Section title={title}>
      <ArtistRow artists={artists} />
    </Section>
  );
}

// --- Heroes ---

/** Your Spice for this part of the day, front and centre; without one, the recent-songs hero. */
function SpiceHero({ recent }: { recent: Song[] }) {
  const spices = useQuery({ queryKey: ["spices", "daily"], queryFn: Api.spicesWithDaily });
  const label = useDailySpice()?.label;
  const daily = spices.data?.find((s) => s.daily);
  const ref: CollectionRef = { kind: "spice", id: "daily", name: label ?? daily?.name ?? "Your Spice" };
  const loading = useIsLoading(ref);
  if (spices.isError || (spices.data && !daily)) return <ResumeHero recent={recent} />;
  if (!daily) return <HeroSkeletonShape />;
  const name = label ?? daily.name;
  return (
    <Hero
      kicker={`Your Spice · ${daily.daily!.part}`}
      title={name}
      text={`What you play ${whenPhrase(daily.daily!.part)}, made fresh for right now. Open it to see what's inside.`}
      covers={daily.covers}
      spiceName={name}
      onPress={() => router.push(DAILY_SPICE_HREF as never)}
      onLongPress={() => openCollectionMenu(ref, { subtitle: `Spice · ${daily.daily!.part}`, artwork: daily.covers[0] })}
      actions={
        <>
          <PlayButton size={56} bg="#fff" fg="#141414" loading={loading} onPress={() => void runCollection(ref)} label={`Play ${name}`} />
          <HeroPill label="Shuffle" icon="shuffle" onPress={() => void runCollection(ref, "shuffle")} />
        </>
      }
    />
  );
}

function ResumeHero({ recent }: { recent: Song[] }) {
  const pb = usePlayback();
  const last = recent[0];
  if (!last) return <WelcomeHero />;
  const others = [...new Set(recent.slice(1).flatMap((s) => s.artists.map((a) => a.name)))]
    .filter((n) => n !== last.artists[0]?.name)
    .slice(0, 2);
  const isCurrent = pb.queue.length === recent.length && sameList(pb.queue, recent);
  const playing = isCurrent && pb.playing;
  const covers = [...new Set(recent.map((s) => s.artworkUrl).filter(Boolean) as string[])];
  return (
    <Hero
      kicker="Pick up where you left off"
      title={last.title}
      text={`${last.artists[0]?.name ?? ""}${others.length ? `, with a bit of ${others.join(" and ")} before that.` : "."}`}
      covers={covers}
      onPress={() => router.push("/recent")}
      onLongPress={() => openCollectionMenu({ kind: "recent", name: "Recently Played" }, { artwork: covers[0] })}
      actions={
        <>
          <PlayButton
            size={56}
            bg="#fff"
            fg="#141414"
            playing={playing}
            onPress={() => (isCurrent ? player.toggle() : player.play(recent, 0))}
            label={playing ? "Pause" : "Play your recent songs"}
          />
          <Text variant="footnote" color="rgba(255,255,255,0.66)">
            {plural(recent.length, "song")} you played lately
          </Text>
        </>
      }
    />
  );
}

function WelcomeHero() {
  return (
    <Hero
      kicker="Welcome to Harmoni"
      title="Let's find your sound"
      text="Search for a song or an artist you love."
      covers={[]}
      actions={
        <HeroPill
          label="Start searching"
          icon="search"
          onPress={() => {
            router.navigate("/search");
            setTimeout(() => searchFocus.current?.(), 350);
          }}
        />
      }
    />
  );
}
