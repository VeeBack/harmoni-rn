import { router } from "expo-router";

import { errorMessage } from "@/api/client";
import { Api } from "@/api/endpoints";
import type { Song } from "@/api/types";
import { download, removeDownload, useDownloads } from "@/downloads/downloads";
import { player } from "@/player/player";
import { closeNowPlaying } from "@/shell/state";
import { collectionsNow, libraryChanged } from "@/state/collections";
import { useLibrary } from "@/state/library";
import { queryClient } from "@/state/query";
import { openMenu, prompt, toast, type MenuItem } from "@/ui/overlays";
import { artistLine, firstArtist } from "@/lib/format";
import { copyLink, shareLink, songPath } from "@/lib/share";
import { PINNED_MAX } from "@/profile/style";
import { startSpiceWith } from "@/spice/draft";
import { useSession } from "@/state/session";

export type Extra = Exclude<MenuItem, "divider">;

/** Resolves ids for songs fresh from search (artist and album ids arrive once saved). */
async function full(song: Song): Promise<Song> {
  if (song.album?.id && song.artists.every((a) => a.id)) return song;
  try {
    return await Api.song(song.id);
  } catch {
    return song;
  }
}

function addToPlaylistItems(song: Song): MenuItem[] {
  const cols = collectionsNow();
  const items: MenuItem[] = [
    {
      label: "New playlist…",
      icon: "plus",
      onPress: async () => {
        const name = await prompt({ title: "New playlist", label: "Name it", defaultValue: `${song.title} vibes`, confirm: "Create" });
        if (!name) return;
        try {
          const p = await Api.createPlaylist(name);
          try {
            await Api.addToPlaylist(p.id, song.id);
            toast(`Added to ${p.name}`);
          } catch {
            toast("Couldn't add that song.", "error");
          }
          libraryChanged();
        } catch {
          toast("Couldn't create the playlist.", "error");
        }
      },
    },
    { label: "New Spice…", icon: "spice", onPress: () => startSpiceWith([song]) },
  ];
  if (cols.length) items.push("divider");
  for (const c of cols) {
    items.push({
      label: c.name,
      icon: c.type === "playlist" ? "playlist" : "spice",
      onPress: async () => {
        try {
          if (c.type === "playlist") await Api.addToPlaylist(c.id, song.id);
          else await Api.addSeed(c.id, song.id);
          toast(`Added to ${c.name}`);
          libraryChanged();
        } catch {
          toast("Couldn't add that song.", "error");
        }
      },
    });
  }
  return items;
}

/** Puts a song on display on your profile, or takes it off. */
export async function togglePin(song: Song) {
  const session = useSession.getState();
  const pinned = session.me?.pinned ?? [];
  const on = !pinned.includes(song.id);
  if (on && pinned.length >= PINNED_MAX) return toast(`Your profile shows ${PINNED_MAX} songs. Take one off first.`, "error");
  try {
    const r = await Api.pin(song.id, on);
    if (session.me) session.setMe({ ...session.me, pinned: r.pinned });
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    toast(on ? "On display on your profile" : "Taken off your profile");
  } catch {
    toast("Couldn't change your profile.", "error");
  }
}

export function songMenuItems(song: Song, extras: Extra[] = [], opts: { fromNowPlaying?: boolean } = {}): MenuItem[] {
  const liked = useLibrary.getState().isLiked(song.id);
  const dl = useDownloads.getState().items[song.id]?.state;
  const go = (href: string) => {
    if (opts.fromNowPlaying) closeNowPlaying();
    router.push(href as never);
  };
  const items: MenuItem[] = [
    {
      label: "Play next",
      icon: "next",
      onPress: () => {
        player.playNext(song);
        toast(`${song.title} plays next`);
      },
    },
    {
      label: "Add to queue",
      icon: "queue",
      onPress: () => {
        player.addToQueue(song);
        toast("Added to your queue");
      },
    },
    { label: "Add to playlist", icon: "playlist", submenu: () => addToPlaylistItems(song) },
    "divider",
    {
      label: liked ? "Remove from Liked" : "Add to Liked",
      icon: liked ? "heart-solid" : "heart",
      onPress: () =>
        useLibrary
          .getState()
          .toggleLike(song)
          .catch(() => toast("Couldn't save that. Try again?", "error")),
    },
    dl === "done" || dl === "queued" || dl === "downloading"
      ? {
          label: dl === "done" ? "Remove download" : "Cancel download",
          icon: "cloud-off",
          onPress: () => removeDownload(song.id),
        }
      : {
          label: "Download",
          icon: "download",
          onPress: () => {
            download([song]);
            toast("Saving for offline");
          },
        },
  ];
  const me = useSession.getState().me;
  if (me?.pinned) {
    const pinned = me.pinned.includes(song.id);
    items.push({
      label: pinned ? "Take off your profile" : "Show on your profile",
      icon: pinned ? "pin-solid" : "pin",
      onPress: () => togglePin(song),
    });
  }
  items.push(
    "divider",
    { label: "Share…", icon: "share", onPress: () => shareLink(songPath(song.id), song.title) },
    {
      label: "Copy link",
      icon: "copy",
      onPress: () => copyLink(songPath(song.id)).then((ok) => (ok ? toast("Link copied") : toast("Couldn't copy the link.", "error"))),
    },
    "divider",
  );
  const albumId = song.album?.id;
  const artist = song.artists.find((a) => a.id) ?? firstArtist(song);
  if (albumId) items.push({ label: "Go to album", icon: "disc", onPress: () => go(`/album/${albumId}`) });
  else if (song.album) {
    items.push({
      label: "Go to album",
      icon: "disc",
      onPress: async () => {
        const f = await full(song);
        if (f.album?.id) go(`/album/${f.album.id}`);
        else toast("That album isn't ready yet.", "error");
      },
    });
  }
  if (artist?.id) items.push({ label: `Go to ${artist.name}`, icon: "user", onPress: () => go(`/artist/${artist.id}`) });
  else if (artist) {
    items.push({
      label: `Go to ${artist.name}`,
      icon: "user",
      onPress: async () => {
        const f = await full(song);
        const a = f.artists.find((x) => x.id);
        if (a?.id) go(`/artist/${a.id}`);
        else toast("That artist isn't ready yet.", "error");
      },
    });
  }
  if (extras.length) items.push("divider", ...extras);
  return items;
}

export function openSongMenu(song: Song, extras: Extra[] = [], opts: { fromNowPlaying?: boolean } = {}) {
  // make sure the playlist list is there for "Add to playlist"
  queryClient.prefetchQuery({ queryKey: ["playlists"], queryFn: Api.playlists });
  queryClient.prefetchQuery({ queryKey: ["spices"], queryFn: Api.spices });
  openMenu({
    preview: { title: song.title, subtitle: artistLine(song), artwork: song.artworkUrl },
    items: () => songMenuItems(song, extras, opts),
    label: `More options for ${song.title}`,
  });
}

export { errorMessage };
