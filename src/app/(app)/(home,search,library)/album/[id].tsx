import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { Api } from "@/api/endpoints";
import { Collection } from "@/song/Collection";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";

const KIND = { album: "Album", ep: "EP", single: "Single", compilation: "Compilation" } as const;

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["album", id], queryFn: () => Api.album(id) });
  const a = q.data;
  const year = a?.releaseDate?.slice(0, 4);
  const footer =
    a && (a.releaseDate || a.label || a.genres?.length) ? (
      <View style={{ marginTop: 24 }}>
        {a.releaseDate ? (
          <Text size={13} color={colors.text3} style={{ lineHeight: 22 }}>
            {new Date(`${a.releaseDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </Text>
        ) : null}
        {a.label ? (
          <Text size={13} color={colors.text3} style={{ lineHeight: 22 }}>
            ℗ {a.label}
          </Text>
        ) : null}
        {a.genres?.length ? (
          <Text size={13} color={colors.text3} style={{ lineHeight: 22 }}>
            {a.genres.join(", ")}
          </Text>
        ) : null}
      </View>
    ) : null;
  return (
    <Collection
      kind={KIND[a?.kind ?? "album"]}
      title={a?.title ?? ""}
      artUrl={a?.artworkUrl}
      songs={a?.songs}
      numbered
      meta={
        a ? (
          <>
            {a.artists.map((ar, i) => (
              <Text key={ar.id} size={13} weight={500} color={colors.text} onPress={() => router.push(`/artist/${ar.id}`)}>
                {i ? ", " : ""}
                {ar.name}
              </Text>
            ))}
            {year ? ` · ${year}` : ""}
          </>
        ) : undefined
      }
      loadingNote={q.isLoading ? "Fetching the tracklist… the first visit can take a few seconds." : undefined}
      error={q.isError ? { title: "Album not found", body: "Harmoni only knows albums for artists and songs it has seen." } : null}
      footer={footer}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
    />
  );
}
