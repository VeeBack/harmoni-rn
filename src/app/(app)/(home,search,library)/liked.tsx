import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

import { Api } from "@/api/endpoints";
import { Collection } from "@/song/Collection";
import { Icon } from "@/ui/Icon";

export function LikedArt({ size = 72 }: { size?: number }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={["#f2d5c4", "#c9a7d8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <Icon name="heart-solid" size={size} color="#2b1d2e" />
      </LinearGradient>
    </View>
  );
}

export default function Liked() {
  const q = useQuery({ queryKey: ["likes"], queryFn: Api.likes });
  // The server sends newest first; the "order" sort is oldest first, shown descending by default.
  const songs = q.data ? q.data.slice().reverse() : undefined;
  return (
    <Collection
      kind="Your library"
      title="Liked Songs"
      art={<LikedArt />}
      artUrl={q.data?.find((s) => s.artworkUrl)?.artworkUrl}
      songs={songs}
      numbered
      sortKey="liked"
      defaultSort={{ field: "order", descending: true }}
      findLabel="Find in Liked Songs"
      noMatch={(x) => `None of your liked songs match “${x}”.`}
      empty={{ title: "Nothing here yet", body: "Tap the heart on any song and it'll land here, so the good stuff is always one tap away." }}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
    />
  );
}
