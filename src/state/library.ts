import Native from "harmoni-player";
import { create } from "zustand";

import { Api } from "@/api/endpoints";
import type { Song } from "@/api/types";
import { download } from "@/downloads/downloads";
import { kv } from "@/lib/storage";
import { usePrefs } from "@/settings/prefs";
import { queryClient } from "./query";

interface LibraryStore {
  liked: Set<string>;
  loaded: boolean;
  load: () => Promise<void>;
  isLiked: (id: string) => boolean;
  toggleLike: (song: Song) => Promise<boolean>;
  setLiked: (id: string, liked: boolean) => void;
}

function persist(liked: Set<string>) {
  kv.set("likes.ids", [...liked]);
  Native.setLikedIds(JSON.stringify([...liked]));
}

export const useLibrary = create<LibraryStore>((set, get) => ({
  liked: new Set(kv.get<string[]>("likes.ids", [])),
  loaded: false,
  load: async () => {
    try {
      const ids = await Api.likedIds();
      const liked = new Set(ids);
      set({ liked, loaded: true });
      persist(liked);
    } catch {}
  },
  isLiked: (id) => get().liked.has(id),
  setLiked: (id, on) => {
    const liked = new Set(get().liked);
    if (on) liked.add(id);
    else liked.delete(id);
    set({ liked });
    persist(liked);
  },
  toggleLike: async (song) => {
    const was = get().liked.has(song.id);
    get().setLiked(song.id, !was);
    try {
      if (was) await Api.unlike(song.id);
      else {
        const r = await Api.like(song.id);
        if (r.songId !== song.id) {
          get().setLiked(song.id, false);
          get().setLiked(r.songId, true);
        }
        // Settings › Downloads & data › Download new likes.
        if (usePrefs.getState().autoDownloadLikes) download([r.songId === song.id ? song : { ...song, id: r.songId }]);
      }
      queryClient.invalidateQueries({ queryKey: ["likes"] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
      return !was;
    } catch (e) {
      get().setLiked(song.id, was);
      throw e;
    }
  },
}));

Native.addListener("onRemoteLike", ({ songId, liked }) => {
  const s = new Set(useLibrary.getState().liked);
  if (liked) s.add(songId);
  else s.delete(songId);
  useLibrary.setState({ liked: s });
  kv.set("likes.ids", [...s]);
  queryClient.invalidateQueries({ queryKey: ["likes"] });
});

export const useIsLiked = (id: string | undefined) => useLibrary((s) => (id ? s.liked.has(id) : false));
