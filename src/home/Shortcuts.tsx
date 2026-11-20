import { router } from "expo-router";
import { memo, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import { collectionHref, openCollectionMenu, type CollectionRef } from "@/song/collections";
import { LikedArt, RecentArt } from "@/song/art";
import { SpiceArt } from "@/spice/SpiceArt";
import { useDailySpice } from "@/spice/daily";
import { useCollections, useSharedPlaylists } from "@/state/collections";
import { Artwork } from "@/ui/Artwork";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { colors, radius } from "@/ui/theme";

interface Item {
  collection: CollectionRef & { name: string };
  art: ReactNode;
  artwork?: string;
}

const TILE = 56;
/** Between tiles, both ways. */
export const SHORTCUT_GAP = 12;
/** Under the hero: more than between tiles, since the hero's shadow takes some of it. */
export const BELOW_HERO = 24;

/** Two tiles to a row, whatever the screen. */
export function useShortcutWidth() {
  const { width } = useWindowDimensions();
  return Math.floor((width - 40 - SHORTCUT_GAP) / 2);
}

/**
 * The places you go most, a tap away (the web's shortcuts): Liked Songs, your
 * Daily Spice, your newest playlists and Spices, and Recently Played. Two
 * columns of up to four; hold one for its menu.
 */
export function Shortcuts() {
  const daily = useDailySpice();
  const collections = useCollections();
  const shared = useSharedPlaylists().data ?? [];
  const tileWidth = useShortcutWidth();
  const items = (
    [
      { collection: { kind: "liked", name: "Liked Songs" }, art: <LikedArt size={22} /> } as Item,
      ...(daily
        ? [{ collection: { kind: "spice" as const, id: "daily", name: daily.label }, art: <SpiceArt name={daily.label} label={false} /> }]
        : []),
      ...collections.map((c): Item =>
        c.type === "playlist"
          ? {
              collection: { kind: "playlist", id: c.id, name: c.name },
              art: <Artwork url={c.artworks[0]} size={TILE} radius={0} fallback="playlist" />,
              artwork: c.artworks[0],
            }
          : { collection: { kind: "spice", id: c.id, name: c.name }, art: <SpiceArt name={c.name} covers={c.covers} label={false} /> },
      ),
      ...shared.map((p): Item => ({
        collection: { kind: "playlist", id: p.id, name: p.name, shareable: true },
        art: <Artwork url={p.artworks[0]} size={TILE} radius={0} fallback="playlist" />,
        artwork: p.artworks[0],
      })),
      { collection: { kind: "recent", name: "Recently Played" }, art: <RecentArt size={22} /> } as Item,
    ] as Item[]
  ).slice(0, 8);
  if (items.length < 4) return null;
  // An odd one out would sit alone: keep the grid even.
  const shown = items.length % 2 ? items.slice(0, -1) : items;
  return (
    <View style={styles.grid}>
      {shown.map((item) => (
        <Shortcut key={collectionHref(item.collection)} {...item} width={tileWidth} />
      ))}
    </View>
  );
}

const Shortcut = memo(function Shortcut({ collection, art, artwork, width }: Item & { width: number }) {
  return (
    <Press
      onPress={() => router.push(collectionHref(collection) as never)}
      onLongPress={() => openCollectionMenu(collection, { artwork })}
      feedback="tap"
      scaleTo={0.97}
      highlight={colors.hover}
      accessibilityLabel={collection.name}
      style={[styles.tile, { width }]}
    >
      <View style={styles.art}>{art}</View>
      <Text variant="footnote" weight={600} numberOfLines={2} style={{ flex: 1, lineHeight: 16 }}>
        {collection.name}
      </Text>
    </Press>
  );
});

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SHORTCUT_GAP, marginTop: BELOW_HERO },
  tile: {
    height: TILE,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingRight: 12,
    overflow: "hidden",
  },
  art: { width: TILE, height: TILE, overflow: "hidden", backgroundColor: colors.surface2, elevation: 4, shadowColor: "#000" },
});
