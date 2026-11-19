import { useQuery } from "@tanstack/react-query";

import { Api } from "@/api/endpoints";
import type { PlaylistSummary, SpiceCard } from "@/api/types";
import { queryClient } from "./query";

export type Collection = ({ type: "playlist" } & PlaylistSummary) | ({ type: "spice" } & SpiceCard);

export const usePlaylists = () => useQuery({ queryKey: ["playlists"], queryFn: Api.playlists });
export const useSpices = () => useQuery({ queryKey: ["spices"], queryFn: Api.spices });
/** Other people's playlists shared with you. Older servers don't have them. */
export const useSharedPlaylists = () =>
  useQuery({ queryKey: ["playlists", "shared"], queryFn: () => Api.sharedPlaylists().catch(() => []) });

export function sortCollections(playlists: PlaylistSummary[] = [], spices: SpiceCard[] = []): Collection[] {
  return [...playlists.map((p) => ({ type: "playlist" as const, ...p })), ...spices.map((s) => ({ type: "spice" as const, ...s }))].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

export function useCollections(): Collection[] {
  const p = usePlaylists();
  const s = useSpices();
  return sortCollections(p.data, s.data);
}

export function collectionsNow(): Collection[] {
  return sortCollections(queryClient.getQueryData(["playlists"]), queryClient.getQueryData(["spices"]));
}

/** After likes, playlists or Spices change: what the web calls bumping the library version. */
export function libraryChanged() {
  for (const k of ["home", "playlists", "spices", "likes", "playlist", "spice"]) queryClient.invalidateQueries({ queryKey: [k] });
}
