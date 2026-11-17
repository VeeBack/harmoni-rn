import { router } from "expo-router";
import { memo, useState, type ReactNode } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";

import { errorMessage } from "@/api/client";
import { Api } from "@/api/endpoints";
import { useArtistImage } from "@/api/token";
import type { ArtistCard, Song, SpiceCard } from "@/api/types";
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
import { useCurrentState } from "./SongRow";

/** A horizontal, snapping shelf of cards that bleeds to the screen edges. */
export function Shelf({ children, itemWidth }: { children: ReactNode; itemWidth: number }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={itemWidth + 14}
      snapToAlignment="start"
      overScrollMode="never"
      style={{ marginHorizontal: -16 }}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 14, paddingBottom: 4 }}
    >
      {children}
    </ScrollView>
  );
}

export function useShelfWidth() {
  const { width } = useWindowDimensions();
  return Math.round((width - 32) * 0.42);
}

export function useGridWidth() {
  const { width } = useWindowDimensions();
  return Math.floor((width - 32 - 14) / 2);
}

export const CardLink = memo(function CardLink({ title, subtitle, artwork, onPress, width, children }: { title: string; subtitle?: string; artwork?: string; onPress: () => void; width: number; children?: ReactNode }) {
  return (
    <Press onPress={onPress} feedback="tap" scaleTo={0.97} style={{ width, gap: 10 }} accessibilityLabel={title}>
      <View style={{ width, height: width, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surface2 }}>
        {children ?? <Artwork url={artwork} size={width} radius={radius.lg} fallback="playlist" />}
      </View>
      <View>
        <Text weight={500} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text size={13} color={colors.text2} numberOfLines={1} style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Press>
  );
});

export const SongCard = memo(function SongCard({ song, list, index, width }: { song: Song; list: Song[]; index: number; width: number }) {
  const current = useCurrentState(song.id);
  return (
    <Press
      onPress={() => (current ? player.toggle() : player.play(list, index))}
      onLongPress={() => openSongMenu(song)}
      feedback="tap"
      scaleTo={0.97}
      style={{ width, gap: 10 }}
      accessibilityLabel={song.title}
    >
      <View>
        <Artwork url={song.artworkUrl} size={width} radius={radius.lg} />
        <View style={{ position: "absolute", right: 10, bottom: 10 }}>
          <PlayButton size={40} playing={current === 2} onPress={() => (current ? player.toggle() : player.play(list, index))} />
        </View>
      </View>
      <View>
        <Text weight={500} numberOfLines={1}>
          {song.title}
        </Text>
        <Text size={13} color={colors.text2} numberOfLines={1} style={{ marginTop: 2 }}>
          {song.artists[0]?.name}
        </Text>
      </View>
    </Press>
  );
});

/** Opens a Spice (freshening it) and plays it from the top. */
export async function playSpice(spice: Pick<SpiceCard, "id" | "kind">) {
  try {
    const s = await Api.spice(spice.id);
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
    <Press onPress={() => router.push(`/spice/${spice.id}`)} feedback="tap" scaleTo={0.97} style={{ width, gap: 10 }} accessibilityLabel={spice.name}>
      <View style={{ width, height: width, borderRadius: radius.lg, overflow: "hidden" }}>
        <SpiceArt name={spice.name} covers={spice.covers} clearRight />
        <View style={{ position: "absolute", right: 10, bottom: 10 }}>
          <PlayButton
            size={40}
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
    <Press onPress={() => router.push(`/artist/${artist.id}`)} feedback="tap" scaleTo={0.96} style={{ width: 104, gap: 10, alignItems: "center" }} accessibilityLabel={artist.name}>
      <Artwork url={artist.imageUrl ?? fallback} source={proxied} size={104} round fallback="user" />
      <Text size={13} weight={500} numberOfLines={1} align="center" style={{ width: 104 }}>
        {artist.name}
      </Text>
    </Press>
  );
});

export function ArtistRow({ artists, fallbacks }: { artists: ArtistCard[]; fallbacks?: Record<string, string | undefined> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} overScrollMode="never" style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 14, paddingBottom: 8 }}>
      {artists.map((a) => (
        <ArtistChip key={a.id} artist={a} fallback={fallbacks?.[a.id]} />
      ))}
    </ScrollView>
  );
}
