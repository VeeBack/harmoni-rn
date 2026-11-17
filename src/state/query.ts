import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState } from "react-native";

import { ApiError } from "@/api/client";
import { kv } from "@/lib/storage";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
      refetchOnWindowFocus: true,
      networkMode: "offlineFirst",
    },
    mutations: { networkMode: "offlineFirst" },
  },
});

AppState.addEventListener("change", (s) => focusManager.setFocused(s === "active"));

onlineManager.setEventListener((setOnline) => {
  const sub = Network.addNetworkStateListener((s) => setOnline(!!s.isConnected));
  return () => sub.remove();
});

// A light persistence: a few screens are cached on disk so the app opens instantly,
// and so previously seen pages still show when offline.
const PERSIST = ["home", "playlists", "spices", "likes", "playlist", "album", "artist", "recent", "me"];
const KEY = "query.cache.v1";

export function restoreQueryCache() {
  const saved = kv.get<{ key: unknown[]; data: unknown; at: number }[]>(KEY, []);
  for (const q of saved) queryClient.setQueryData(q.key, q.data, { updatedAt: q.at });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
queryClient.getQueryCache().subscribe((e) => {
  if (e.type !== "updated" || e.action.type !== "success") return;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const out = queryClient
      .getQueryCache()
      .getAll()
      .filter((q) => q.state.status === "success" && PERSIST.includes(String(q.queryKey[0])))
      .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
      .slice(0, 60)
      .map((q) => ({ key: q.queryKey as unknown[], data: q.state.data, at: q.state.dataUpdatedAt }));
    kv.set(KEY, out);
  }, 2000);
});

export function clearQueryCache() {
  queryClient.clear();
  kv.remove(KEY);
}
