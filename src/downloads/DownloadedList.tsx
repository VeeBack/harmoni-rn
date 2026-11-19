import { router } from "expo-router";
import { useMemo, type ReactNode } from "react";

import type { Song } from "@/api/types";
import { plural } from "@/lib/format";
import { Collection } from "@/song/Collection";
import { confirm, type MenuItem } from "@/ui/overlays";
import { removeDownload, removeDownloads, useDownloads } from "./downloads";

/** The saved songs, by id. Same object until something finishes or goes. */
export function useSavedSongs(): Map<string, Song> {
  const items = useDownloads((s) => s.items);
  return useMemo(() => {
    const m = new Map<string, Song>();
    for (const d of Object.values(items)) if (d.state === "done" && d.song) m.set(d.id, d.song);
    return m;
  }, [items]);
}

/** How many of `ids` are saved. */
export function countSaved(ids: string[] | undefined, saved: Map<string, Song>) {
  if (!ids) return 0;
  let n = 0;
  for (const id of new Set(ids)) if (saved.has(id)) n++;
  return n;
}

/**
 * One of your lists as Downloads shows it: only the songs saved on this phone, in the list's
 * own order, playable without a connection.
 */
export function DownloadedList({
  kind,
  title,
  art,
  ids,
  sortKey,
  orderLabel,
  defaultSort,
  open,
  emptyBody,
}: {
  kind: string;
  title: string;
  art?: ReactNode;
  /** The list's songs, in order; every saved song (newest first) when left out. */
  ids?: string[];
  sortKey: string;
  orderLabel?: string;
  defaultSort?: { field: "order" | "title" | "artist"; descending: boolean };
  /** The whole list, online. */
  open?: { label: string; href: string };
  emptyBody: string;
}) {
  const saved = useSavedSongs();
  const items = useDownloads((s) => s.items);
  const songs = useMemo(() => {
    if (ids) {
      const seen = new Set<string>();
      return ids.flatMap((id) => {
        const s = saved.get(id);
        if (!s || seen.has(id)) return [];
        seen.add(id);
        return [s];
      });
    }
    return [...saved.values()].sort((a, b) => (items[b.id]?.updatedAt ?? 0) - (items[a.id]?.updatedAt ?? 0));
  }, [ids, saved, items]);

  const removeAll = async () => {
    const yes = await confirm({
      title: ids ? `Remove ${title} from this phone?` : "Remove all downloads?",
      note: `${plural(songs.length, "song")} will be removed from this phone. ${ids ? "The list itself stays in your library." : "Your likes and playlists stay."}`,
      confirm: "Remove",
      danger: true,
    });
    if (yes) removeDownloads(songs.map((s) => s.id));
  };
  const menu = (): MenuItem[] => [
    ...(open ? [{ label: open.label, icon: "chevron-right" as const, onPress: () => router.push(open.href as never) }] : []),
    ...(songs.length
      ? [{ label: `Remove ${plural(songs.length, "download")}`, icon: "trash" as const, danger: true, onPress: removeAll }]
      : []),
  ];

  return (
    <Collection
      kind={`${kind} · On this phone`}
      title={title}
      art={art}
      artUrl={songs.find((s) => s.artworkUrl)?.artworkUrl}
      songs={songs}
      numbered
      sortKey={sortKey}
      orderLabel={orderLabel}
      defaultSort={defaultSort}
      findLabel={`Find in ${title}`}
      hideDownload
      rowExtras={(song) => [{ label: "Remove download", icon: "trash", onPress: () => removeDownload(song.id) }]}
      menu={menu}
      menuLabel={`${title} options`}
      empty={{ title: "Nothing saved from here", body: emptyBody }}
    />
  );
}
