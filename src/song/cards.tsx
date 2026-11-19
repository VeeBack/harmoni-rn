import { router } from "expo-router";
import { memo, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";

import { errorMessage } from "@/api/client";
import { Api } from "@/api/endpoints";
import { useArtistImage } from "@/api/token";
import type { ArtistCard, Song, SpiceCard } from "@/api/types";
import { deviceTimeZone } from "@/lib/day-part";
import { plural } from "@/lib/format";
import { usePlayback } from "@/player/hooks";
import { player } from "@/player/player";
import { SpiceArt } from "@/spice/SpiceArt";
import { Artwork } from "@/ui/Artwork";
import { PlayButton } from "@/ui/bits";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { toast } from "@/ui/overlays";
import { colors, radius } from "@/ui/theme";
import { openSongMenu } from "./menu";
import { Equalizer, useCurrentState } from "./SongRow";

/** A horizontal, snapping shelf of cards that bleeds to the screen edges. */
export function Shelf({ children, itemWidth }: { children: ReactNode; itemWidth: number }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={itemWidth + 12}
      snapToAlignment="start"
      style={{ marginHorizontal: -20 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 4 }}
    >
      {children}
    </ScrollView>
  );
}

export function useShelfWidth() {
  const { width } = useWindowDimensions();
  return Math.round((width - 40 - 12) / 2.2);
}

export function useGridWidth() {
  const { width } = useWindowDimensions();
  return Math.floor((width - 40 - 14) / 2);
}

export const CardLink = memo(function CardLink({
  title,
  subtitle,
  artwork,
  onPress,
  width,
  children,
}: {
  title: string;
  subtitle?: string;
  artwork?: string;
  onPress: () => void;
  width: number;
  children?: ReactNode;
}) {
  return (
    <Press onPress={onPress} feedback="tap" scaleTo={0.96} style={{ width, gap: 8 }} accessibilityLabel={title}>
      <View style={[cardArt, { width, height: width }]}>
        {children ?? <Artwork url={artwork} size={width} radius={radius.md} fallback="playlist" />}
      </View>
      <View>
        <Text variant="subhead" weight={500} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="subhead" color={colors.text2} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Press>
  );
});

const cardArt = {
  borderRadius: radius.md,
  overflow: "hidden" as const,
  backgroundColor: colors.surface2,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "rgba(255,255,255,0.06)",
};

/** A song as a card (Apple Music shelves): tap plays the shelf from here, long press for the menu. */
export const SongCard = memo(function SongCard({ song, list, index, width }: { song: Song; list: Song[]; index: number; width: number }) {
  const current = useCurrentState(song.id);
  return (
    <Press
      onPress={() => (current ? player.toggle() : player.play(list, index))}
      onLongPress={() => openSongMenu(song)}
      feedback="tap"
      scaleTo={0.96}
      style={{ width, gap: 8 }}
      accessibilityLabel={song.title}
    >
      <View style={[cardArt, { width, height: width }]}>
        <Artwork url={song.artworkUrl} size={width} radius={radius.md} />
        {current ? (
          <View
            style={{
              position: "absolute",
              left: 8,
              bottom: 8,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: "rgba(0,0,0,0.55)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Equalizer playing={current === 2} color="#fff" />
          </View>
        ) : null}
      </View>
      <View>
        <Text variant="subhead" weight={500} numberOfLines={1} color={current ? colors.accent : colors.text}>
          {song.title}
        </Text>
        <Text variant="subhead" color={colors.text2} numberOfLines={1}>
          {song.artists[0]?.name}
        </Text>
      </View>
    </Press>
  );
});

/** Opens a Spice (freshening it) and plays it from the top. */
export async function playSpice(spice: Pick<SpiceCard, "id" | "kind">) {
  try {
    const s = await Api.spice(spice.id, deviceTimeZone());
    if (!s.songs.length) {
      toast(spice.kind === "custom" ? "Add a seed song first." : "Nothing in this Spice yet.");
      return;
    }
    player.play(s.songs, 0);
  } catch (e) {
    toast("Couldn't open that Spice.", "error");
    void errorMessage(e);
  }
}

export const SpiceCardLink = memo(function SpiceCardLink({ spice, width }: { spice: SpiceCard; width: number }) {
  const [loading, setLoading] = useState(false);
  const pb = usePlayback();
  void pb;
  return (
    <Press
      onPress={() => router.push(`/spice/${spice.id}`)}
      feedback="tap"
      scaleTo={0.96}
      style={{ width, gap: 8 }}
      accessibilityLabel={spice.name}
    >
      <View style={[cardArt, { width, height: width }]}>
        <SpiceArt name={spice.name} covers={spice.covers} clearRight />
        <View style={{ position: "absolute", right: 8, bottom: 8 }}>
          <PlayButton
            size={36}
            loading={loading}
            onPress={async () => {
              setLoading(true);
              await playSpice(spice);
              setLoading(false);
            }}
          />
        </View>
      </View>
      <View>
        <Text weight={500} numberOfLines={1}>
          {spice.name}
        </Text>
        <Text size={13} color={colors.text2} numberOfLines={1} style={{ marginTop: 2 }}>
          {spice.kind === "custom" ? `Spice · ${plural(spice.seedCount ?? 0, "seed")}` : "Spice · fresh daily"}
        </Text>
      </View>
    </Press>
  );
});

export function artistImage(a: ArtistCard): string | undefined {
  return a.imageUrl;
}

export const ArtistChip = memo(function ArtistChip({ artist, fallback }: { artist: ArtistCard; fallback?: string }) {
  const proxied = useArtistImage(artist.imageUrl ? undefined : artist.id);
  return (
    <Press
      onPress={() => router.push(`/artist/${artist.id}`)}
      feedback="tap"
      scaleTo={0.95}
      style={{ width: 112, gap: 8, alignItems: "center" }}
      accessibilityLabel={artist.name}
    >
      <Artwork url={artist.imageUrl ?? fallback} source={proxied} size={112} round fallback="user" />
      <Text variant="subhead" weight={500} numberOfLines={1} align="center" style={{ width: 112 }}>
        {artist.name}
      </Text>
    </Press>
  );
});

export function ArtistRow({ artists, fallbacks }: { artists: ArtistCard[]; fallbacks?: Record<string, string | undefined> }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -20 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingBottom: 8 }}
    >
      {artists.map((a) => (
        <ArtistChip key={a.id} artist={a} fallback={fallbacks?.[a.id]} />
      ))}
    </ScrollView>
  );
}
