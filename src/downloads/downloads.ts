import Native, { type DownloadEvent } from "harmoni-player";
import { PermissionsAndroid, Platform } from "react-native";
import { create } from "zustand";

import type { Song } from "@/api/types";

export type DownloadState = "queued" | "downloading" | "done" | "failed" | "removing" | "stopped";

export interface DownloadItem {
  id: string;
  state: DownloadState;
  percent: number;
  bytes: number;
  updatedAt: number;
  song: Song | null;
}

interface DownloadsStore {
  items: Record<string, DownloadItem>;
  loaded: boolean;
  load: () => Promise<void>;
}

export const useDownloads = create<DownloadsStore>((set) => ({
  items: {},
  loaded: false,
  load: async () => {
    try {
      const list = JSON.parse(await Native.getDownloads()) as (Omit<DownloadItem, "song"> & { song: Song | null })[];
      const items: Record<string, DownloadItem> = {};
      for (const d of list) items[d.id] = d;
      set({ items, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));

// Per-song events arrive in bursts (a big playlist sends thousands): apply them in one go every 200 ms.
let buffered: DownloadEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushTimer = null;
  const events = buffered;
  buffered = [];
  if (!events.length) return;
  useDownloads.setState((s) => {
    const items = { ...s.items };
    for (const e of events) {
      if (e.state === "removed") {
        delete items[e.id];
        continue;
      }
      const prev = items[e.id];
      let song = prev?.song ?? null;
      if (e.song) {
        try {
          song = JSON.parse(e.song);
        } catch {}
      }
      items[e.id] = {
        id: e.id,
        state: e.state,
        percent: e.percent ?? prev?.percent ?? 0,
        bytes: e.bytes ?? prev?.bytes ?? 0,
        updatedAt: e.updatedAt ?? Date.now(),
        song,
      };
    }
    return { items };
  });
}

Native.addListener("onDownload", (e: DownloadEvent) => {
  buffered.push(e);
  if (!flushTimer) flushTimer = setTimeout(flush, 200);
});

Native.addListener("onTick", (t) => {
  if (!t.downloads?.length) return;
  useDownloads.setState((s) => {
    const items = { ...s.items };
    for (const d of t.downloads!) {
      const prev = items[d.id];
      if (prev) items[d.id] = { ...prev, percent: d.percent, state: d.state as DownloadState };
    }
    return { items };
  });
});

const pendingSongs = new Map<string, Song>();

let asked = false;
/** Download progress shows as a notification; Android 13+ asks for it once. */
function askForNotifications() {
  if (asked || Platform.OS !== "android" || (Platform.Version as number) < 33) return;
  asked = true;
  PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => {});
}

/**
 * Saves songs, in this order (what's on screen, top to bottom), ahead of anything else
 * waiting: new ones and ones already in line both go to the front. Returns how many are new.
 */
export function download(songs: Song[]) {
  askForNotifications();
  const items = useDownloads.getState().items;
  const fresh = songs.filter((s) => {
    const cur = items[s.id];
    return !cur || cur.state === "failed" || cur.state === "stopped";
  });
  // Already waiting: no new download, but they move up with the rest.
  const send = songs.filter((s) => {
    const st = items[s.id]?.state;
    return !st || st === "failed" || st === "stopped" || st === "queued";
  });
  if (fresh.length) {
    useDownloads.setState((st) => {
      const next = { ...st.items };
      for (const s of fresh) {
        pendingSongs.set(s.id, s);
        next[s.id] = { id: s.id, state: "queued", percent: 0, bytes: 0, updatedAt: Date.now(), song: s };
      }
      return { items: next };
    });
  }
  if (send.length) {
    // In chunks so a huge playlist never builds one enormous string. Each chunk goes to the
    // front of the line, so the last goes first and the first ends up first.
    (async () => {
      for (let i = Math.floor((send.length - 1) / 1000) * 1000; i >= 0; i -= 1000)
        await Native.download(JSON.stringify(send.slice(i, i + 1000)));
    })().catch(() => {});
  }
  return fresh.length;
}

/** Whatever of these is waiting to download goes next, in this order (the screen in front of them). */
export function prioritizeDownloads(songs: Pick<Song, "id">[]) {
  const items = useDownloads.getState().items;
  const ids = songs.map((s) => s.id).filter((id) => items[id]?.state === "queued");
  if (!ids.length) return;
  (async () => {
    for (let i = Math.floor((ids.length - 1) / 2000) * 2000; i >= 0; i -= 2000)
      await Native.prioritizeDownloads(JSON.stringify(ids.slice(i, i + 2000)));
  })().catch(() => {});
}

export function removeDownload(id: string) {
  Native.removeDownload(id);
}

export function removeDownloads(ids: string[]) {
  const items = useDownloads.getState().items;
  const mine = ids.filter((id) => items[id]);
  for (let i = 0; i < mine.length; i += 2000) Native.removeDownloads(JSON.stringify(mine.slice(i, i + 2000))).catch(() => {});
  return mine.length;
}

export function removeAllDownloads() {
  Native.removeAllDownloads();
}

export const useDownloadState = (id: string | undefined) => useDownloads((s) => (id ? s.items[id]?.state : undefined));

/** 0..100, whole numbers (so a row only redraws when it moves a percent). */
export const useDownloadPercent = (id: string) => useDownloads((s) => Math.round(Math.max(0, Math.min(100, s.items[id]?.percent ?? 0))));

/** "all" when every song is saved, "some" while some are saving or saved, else "none". */
export function useListDownloadState(songs: Song[] | undefined): { state: "none" | "some" | "all"; saving: number; saved: number } {
  return useDownloads((s) => {
    if (!songs?.length) return NONE;
    let saved = 0;
    let saving = 0;
    for (const song of songs) {
      const st = s.items[song.id]?.state;
      if (st === "done") saved++;
      else if (st === "queued" || st === "downloading") saving++;
    }
    const state = saved === songs.length ? "all" : saved + saving > 0 ? "some" : "none";
    const key = `${state}:${saving}:${saved}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const v = { state, saving, saved } as const;
    cache.set(key, v);
    return v;
  });
}
const NONE = { state: "none", saving: 0, saved: 0 } as const;
const cache = new Map<string, { state: "none" | "some" | "all"; saving: number; saved: number }>();

export function downloadedSongs(): Song[] {
  return Object.values(useDownloads.getState().items)
    .filter((d) => d.state === "done" && d.song)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((d) => d.song!);
}
