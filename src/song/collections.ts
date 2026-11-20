import { router } from "expo-router";
import { create } from "zustand";

import { Api } from "@/api/endpoints";
import type { Song } from "@/api/types";
import { download } from "@/downloads/downloads";
import { deviceTimeZone } from "@/lib/day-part";
import { albumPath, artistPath, copyLink, playlistPath, shareLink } from "@/lib/share";
import { player } from "@/player/player";
import { DAILY_SPICE_HREF } from "@/spice/daily";
import { openMenu, toast, type MenuItem, type MenuPreview } from "@/ui/overlays";

/** Something with songs in it, played from its card or menu without opening it (the web's CollectionRef). */
export type CollectionRef =
  | { kind: "playlist"; id: string; name: string; shareable?: boolean }
  | { kind: "spice"; id: string; name: string }
  | { kind: "album"; id: string; name: string; artist?: { id: string; name: string } }
  | { kind: "artist"; id: string; name: string }
  | { kind: "liked"; name?: string }
  | { kind: "recent"; name?: string };

export const collectionKey = (c: CollectionRef) => ("id" in c ? `${c.kind}:${c.id}` : c.kind);

export function collectionHref(c: CollectionRef): string {
  if (c.kind === "liked") return "/liked";
  if (c.kind === "recent") return "/recent";
  if (c.kind === "spice" && c.id === "daily") return DAILY_SPICE_HREF;
  return `/${c.kind}/${c.id}`;
}

const label = (c: CollectionRef) => c.name ?? (c.kind === "liked" ? "Liked Songs" : c.kind === "recent" ? "Recently Played" : "it");

async function songsOf(c: CollectionRef): Promise<Song[]> {
  switch (c.kind) {
    case "playlist":
      return (await Api.playlist(c.id)).items.map((i) => i.song);
    case "spice":
      return (await Api.spice(c.id, deviceTimeZone())).songs;
    case "album":
      return (await Api.album(c.id)).songs;
    case "artist":
      return (await Api.artist(c.id)).popular;
    case "liked":
      return Api.likes();
    case "recent":
      return Api.recent(100);
  }
}

/** Which collection is fetching its songs right now, so its play button can spin. */
export const useCollectionLoading = create<{ key: string | null }>(() => ({ key: null }));

/** Plays, shuffles or queues a collection's songs, fetching them first. */
export async function runCollection(c: CollectionRef, how: "play" | "shuffle" | "next" | "queue" | "download" = "play") {
  useCollectionLoading.setState({ key: collectionKey(c) });
  try {
    const songs = await songsOf(c);
    if (!songs.length) return toast(c.kind === "spice" ? "Nothing in this Spice yet." : "Nothing to play in here yet.");
    if (how === "play") player.play(songs, 0);
    else if (how === "shuffle") player.play(songs, Math.floor(Math.random() * songs.length), { shuffle: true });
    else if (how === "next") {
      for (const song of [...songs].reverse()) player.playNext(song);
      toast(`${label(c)} plays next`);
    } else if (how === "queue") {
      for (const song of songs) player.addToQueue(song);
      toast(`Added ${songs.length === 1 ? "1 song" : `${songs.length.toLocaleString()} songs`} to your queue`);
    } else {
      const n = download(songs);
      toast(n === 0 ? "Already on this phone" : n === 1 ? "Saving 1 song for offline" : `Saving ${n.toLocaleString()} songs for offline`);
    }
  } catch {
    toast("Couldn't load those songs.", "error");
  } finally {
    useCollectionLoading.setState({ key: null });
  }
}

/** True while this collection's songs are being fetched to play. */
export const useIsLoading = (c: CollectionRef) => useCollectionLoading((s) => s.key === collectionKey(c));

function sharePath(c: CollectionRef): string | null {
  if (c.kind === "album") return albumPath(c.id);
  if (c.kind === "artist") return artistPath(c.id);
  if (c.kind === "playlist" && c.shareable) return playlistPath(c.id);
  return null;
}

/** The menu for a playlist, Spice, album or artist card: play it any of the usual ways, open it, save it, share it. */
export function collectionMenuItems(c: CollectionRef, extra: MenuItem[] = []): MenuItem[] {
  const path = sharePath(c);
  const what = c.kind === "liked" ? "Liked Songs" : c.kind === "recent" ? "Recently Played" : c.kind;
  return [
    { label: "Play", icon: "play", onPress: () => void runCollection(c) },
    { label: "Shuffle", icon: "shuffle", onPress: () => void runCollection(c, "shuffle") },
    { label: "Play next", icon: "next", onPress: () => void runCollection(c, "next") },
    { label: "Add to queue", icon: "queue", onPress: () => void runCollection(c, "queue") },
    "divider",
    { label: `Open ${what}`, icon: "arrow-right", onPress: () => router.push(collectionHref(c) as never) },
    ...(c.kind === "album" && c.artist
      ? [{ label: `Go to ${c.artist.name}`, icon: "user" as const, onPress: () => router.push(`/artist/${c.artist!.id}`) }]
      : []),
    ...(c.kind !== "artist" && c.kind !== "recent"
      ? [{ label: "Download", icon: "download" as const, onPress: () => void runCollection(c, "download") }]
      : []),
    ...(path
      ? [
          "divider" as const,
          { label: "Share…", icon: "share" as const, onPress: () => void shareLink(path, label(c)) },
          {
            label: "Copy link",
            icon: "copy" as const,
            onPress: () => void copyLink(path).then((ok) => toast(ok ? "Link copied" : "Couldn't copy the link.", ok ? "info" : "error")),
          },
        ]
      : []),
    ...(extra.length ? ["divider" as const, ...extra] : []),
  ];
}

export function openCollectionMenu(c: CollectionRef, preview?: Omit<MenuPreview, "title">, extra: MenuItem[] = []) {
  openMenu({ label: label(c), preview: { title: label(c), ...preview }, items: () => collectionMenuItems(c, extra) });
}
