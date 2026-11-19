import { onlineManager } from "@tanstack/react-query";
import { create } from "zustand";

import { Api } from "@/api/endpoints";
import type { Playlist, PlaylistSummary, Spice } from "@/api/types";
import { kv } from "@/lib/storage";
import { queryClient } from "@/state/query";

/**
 * Which songs each playlist and Spice holds, in order, kept on the phone so Downloads can
 * show your library's lists (with just their saved songs) without a connection. Filled in
 * whenever a playlist or Spice loads anywhere in the app, and by Downloads itself for
 * playlists it hasn't seen (Spices only when opened: opening one can make a new mix).
 */
export interface Members {
  ids: string[];
  /** When the list was loaded (ms). */
  at: number;
}

type Lists = Record<string, Members>;
const KEY = "downloads.members.v1";

export const listKey = (kind: "playlist" | "spice", id: string) => `${kind}:${id}`;

export const useMembers = create<{ lists: Lists }>(() => ({ lists: kv.get<Lists>(KEY, {}) }));

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function record(key: string, ids: string[], at: number) {
  const cur = useMembers.getState().lists[key];
  if (cur && cur.at >= at && cur.ids.length === ids.length && cur.ids.every((x, i) => x === ids[i])) return;
  useMembers.setState((s) => ({ lists: { ...s.lists, [key]: { ids, at } } }));
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    kv.set(KEY, useMembers.getState().lists);
  }, 1000);
}

function fromQuery(queryKey: readonly unknown[], data: unknown, at: number) {
  const [kind, id] = queryKey as [string, string];
  if (!data || typeof id !== "string") return;
  if (kind === "playlist")
    record(
      listKey("playlist", id),
      (data as Playlist).items.map((i) => i.song.id),
      at,
    );
  else if (kind === "spice")
    record(
      listKey("spice", id),
      (data as Spice).songs.map((s) => s.id),
      at,
    );
}

// Anything loaded from now on, and whatever the cache already holds.
queryClient.getQueryCache().subscribe((e) => {
  if (e.type === "updated" && e.action.type === "success") fromQuery(e.query.queryKey, e.query.state.data, e.query.state.dataUpdatedAt);
});
for (const q of queryClient.getQueryCache().getAll()) {
  if (q.state.status === "success") fromQuery(q.queryKey, q.state.data, q.state.dataUpdatedAt);
}

let refreshing = false;
/** Loads the playlists Downloads doesn't know the songs of, or that changed since, a few at a time. */
export async function refreshMembers(playlists: PlaylistSummary[]) {
  if (refreshing || !onlineManager.isOnline()) return;
  const lists = useMembers.getState().lists;
  const stale = playlists.filter((p) => {
    const m = lists[listKey("playlist", p.id)];
    return !m || m.at < Date.parse(p.updatedAt);
  });
  if (!stale.length) return;
  refreshing = true;
  try {
    let next = 0;
    const worker = async () => {
      while (next < stale.length) {
        const p = stale[next++];
        await queryClient
          .fetchQuery({ queryKey: ["playlist", p.id, null], queryFn: () => Api.playlist(p.id), staleTime: 0 })
          .catch(() => {});
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  } finally {
    refreshing = false;
  }
}
