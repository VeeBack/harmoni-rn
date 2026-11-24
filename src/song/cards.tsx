import { router } from "expo-router";
import { memo, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";

import { useArtistImage } from "@/api/token";
import type { ArtistCard, Song, SpiceCard } from "@/api/types";
import { plural } from "@/lib/format";
import { player } from "@/player/player";
import { SpiceArt } from "@/spice/SpiceArt";
import { Artwork } from "@/ui/Artwork";
import { PlayButton } from "@/ui/bits";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { colors, radius } from "@/ui/theme";
import { collectionHref, openCollectionMenu, runCollection, useIsLoading, type CollectionRef } from "./collections";
import { openSongMenu } from "./menu";
import { Equalizer, useCurrentState } from "./SongRow";

/** A horizontal, snapping shelf of cards that bleeds to the screen edges. */
export function Shelf({ children, itemWidth, gap = 14 }: { children: ReactNode; itemWidth: number; gap?: number }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={itemWidth + gap}
      snapToAlignment="start"
      style={{ marginHorizontal: -20 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap, paddingBottom: 4 }}
    >
      {children}
    </ScrollView>
  );
}

/** A shelf card: about 42% of the screen, so the next one peeks in. */
export function useShelfWidth() {
  const { width } = useWindowDimensions();
  return Math.round((width - 40 - 14) / 2.25);
}

export function useGridWidth() {
  const { width } = useWindowDimensions();
  return Math.floor((width - 40 - 14) / 2);
}

/** The card's cover: rounded, lifted off the page by a hairline. */
export const cardArt = {
  borderRadius: radius.lg,
  overflow: "hidden" as const,
  backgroundColor: colors.surface2,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: colors.border,
};

/** Two lines under a card: its name, then what it is. */
function CardText({ title, subtitle, current, align }: { title: string; subtitle?: string; current?: boolean; align?: "center" }) {
  return (
    <View style={{ gap: 1 }}>
      <Text variant="subhead" weight={600} numberOfLines={1} align={align} color={current ? colors.accent : colors.text}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="footnote" color={colors.text2} numberOfLines={1} align={align}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** The cream play button in a card's corner: plays the whole collection without opening it. */
function CollectionPlay({ collection, size = 40 }: { collection: CollectionRef; size?: number }) {
  const loading = useIsLoading(collection);
  return (
    <View style={{ position: "absolute", right: 10, bottom: 10 }}>
      <PlayButton size={size} loading={loading} onPress={() => void runCollection(collection)} label={`Play ${collection.name ?? ""}`} />
    </View>
  );
}

/**
 * A playlist, album or anything else with a cover: tap opens it, the corner
 * button plays it, a long press opens its menu.
 */
export const CardLink = memo(function CardLink({
  title,
  subtitle,
  artwork,
  onPress,
  width,
  children,
  collection,
}: {
  title: string;
  subtitle?: string;
  artwork?: string;
  onPress?: () => void;
  width: number;
  children?: ReactNode;
  /** What the corner button plays and the long press offers. */
  collection?: CollectionRef;
}) {
  return (
    <Press
      onPress={onPress ?? (collection ? () => router.push(collectionHref(collection) as never) : undefined)}
      onLongPress={collection ? () => openCollectionMenu(collection, { subtitle, artwork }) : undefined}
      feedback="tap"
      scaleTo={0.96}
      style={{ width, gap: 10 }}
      accessibilityLabel={title}
    >
      <View style={[cardArt, { width, height: width }]}>
        {children ?? <Artwork url={artwork} size={width} radius={radius.lg} fallback="playlist" />}
        {collection ? <CollectionPlay collection={collection} /> : null}
      </View>
      <CardText title={title} subtitle={subtitle} />
    </Press>
  );
});

/** A song as a card: tap or its play button plays the shelf from here, long press for the menu. */
export const SongCard = memo(function SongCard({ song, list, index, width }: { song: Song; list: Song[]; index: number; width: number }) {
  const current = useCurrentState(song.id);
  const play = () => (current ? player.toggle() : player.play(list, index));
  return (
    <Press
      onPress={play}
      onLongPress={() => openSongMenu(song)}
      feedback="tap"
      scaleTo={0.96}
      style={{ width, gap: 10 }}
      accessibilityLabel={song.title}
    >
      <View style={[cardArt, { width, height: width }]}>
        <Artwork url={song.artworkUrl} size={width} radius={radius.lg} />
        <View style={{ position: "absolute", right: 10, bottom: 10 }}>
          {current ? (
            <View style={styles.playing}>
              <Equalizer playing={current === 2} color={colors.accentInk} />
            </View>
          ) : (
            <PlayButton size={40} onPress={play} label={`Play ${song.title}`} />
          )}
        </View>
      </View>
      <CardText title={song.title} subtitle={song.artists.map((a) => a.name).join(", ")} current={!!current} />
    </Press>
  );
});

export const SpiceCardLink = memo(function SpiceCardLink({ spice, width }: { spice: SpiceCard; width: number }) {
  const collection: CollectionRef = { kind: "spice", id: spice.daily ? "daily" : spice.id, name: spice.name };
  const subtitle = spice.daily
    ? `Spice · ${spice.daily.part}`
    : spice.kind === "custom"
      ? `Spice · ${plural(spice.seedCount ?? 0, "seed")}`
      : "Spice · fresh daily";
  return (
    <CardLink title={spice.name} subtitle={subtitle} width={width} collection={collection}>
      <SpiceArt name={spice.name} covers={spice.covers} clearRight />
    </CardLink>
  );
});

export const ArtistChip = memo(function ArtistChip({
  artist,
  fallback,
  size = 120,
}: {
  artist: ArtistCard;
  fallback?: string;
  size?: number;
}) {
  const proxied = useArtistImage(artist.imageUrl ? undefined : artist.id);
  const collection: CollectionRef = { kind: "artist", id: artist.id, name: artist.name };
  const loading = useIsLoading(collection);
  return (
    <Press
      onPress={() => router.push(`/artist/${artist.id}`)}
      onLongPress={() => openCollectionMenu(collection, { subtitle: "Artist", artwork: artist.imageUrl ?? fallback, round: true })}
      feedback="tap"
      scaleTo={0.95}
      style={{ width: size, gap: 10 }}
      accessibilityLabel={artist.name}
    >
      <View>
        <Artwork url={artist.imageUrl ?? fallback} source={proxied} size={size} round fallback="user" />
        <View style={{ position: "absolute", right: 2, bottom: 2 }}>
          <PlayButton
            size={36}
            loading={loading}
            onPress={() => void runCollection(collection)}
            label={`Play ${artist.name}`}
          />
        </View>
      </View>
      <CardText title={artist.name} subtitle="Artist" align="center" />
    </Press>
  );
});

export function ArtistRow({ artists, fallbacks }: { artists: ArtistCard[]; fallbacks?: Record<string, string | undefined> }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -20 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 16, paddingBottom: 8 }}
    >
      {artists.map((a) => (
        <ArtistChip key={a.id} artist={a} fallback={fallbacks?.[a.id]} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  playing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
