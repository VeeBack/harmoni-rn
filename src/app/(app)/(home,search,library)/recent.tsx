import { useQuery } from "@tanstack/react-query";

import { Api } from "@/api/endpoints";
import { Collection } from "@/song/Collection";

export default function Recent() {
  const q = useQuery({ queryKey: ["recent"], queryFn: () => Api.recent(100) });
  return (
    <Collection
      kind="Your library"
      title="Recently Played"
      songs={q.data}
      numbered
      empty={{ title: "Your history starts here", body: "Songs show up once you've listened for at least 30 seconds." }}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
    />
  );
}
