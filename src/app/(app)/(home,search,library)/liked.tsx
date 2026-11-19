import { useQuery } from "@tanstack/react-query";

import { Api } from "@/api/endpoints";
import { LikedArt } from "@/song/art";
import { Collection } from "@/song/Collection";

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
      empty={{
        title: "Nothing here yet",
        body: "Tap the heart on any song and it'll land here, so the good stuff is always one tap away.",
      }}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
    />
  );
}
