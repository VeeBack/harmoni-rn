import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

import { Api } from "@/api/endpoints";
import type { Playlist, Song } from "@/api/types";
import { copyLink, playlistPath, profilePath, shareLink } from "@/lib/share";
import { linkFor, openShareSheet, type Sharing } from "@/profile/ShareSheet";
import { Collage } from "@/song/art";
import { Collection } from "@/song/Collection";
import { libraryChanged } from "@/state/collections";
import { queryClient } from "@/state/query";
import { Icon } from "@/ui/Icon";
import { confirm, prompt, toast, type MenuItem } from "@/ui/overlays";
import { IconButton } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";

const KIND = { private: "Playlist", link: "Playlist · shared by link", users: "Shared playlist", public: "Public playlist" } as const;

export default function PlaylistScreen() {
  // From a share link: ?key= lets them in.
  const { id, key } = useLocalSearchParams<{ id: string; key?: string }>();
  const q = useQuery({ queryKey: ["playlist", id, key ?? null], queryFn: () => Api.playlist(id, key) });
  const p = q.data;
  const owned = p?.owned !== false;
  const songs = useMemo(() => p?.items.map((i) => i.song), [p]);
  const itemFor = useMemo(() => {
    // Map song object identity back to its item, so duplicates keep their own itemId.
    const m = new Map<Song, string>();
    p?.items.forEach((i) => m.set(i.song, i.itemId));
    return m;
  }, [p]);
  const covers = useMemo(() => [...new Set((songs ?? []).map((s) => s.artworkUrl).filter(Boolean) as string[])], [songs]);

  const reload = () => {
    libraryChanged();
    q.refetch();
  };

  const sharing: Sharing | null = p
    ? { visibility: p.visibility ?? "private", shareUrl: p.shareUrl, sharedWith: p.sharedWith ?? [] }
    : null;
  const setSharing = (s: Sharing) => {
    queryClient.setQueryData<Playlist>(["playlist", id, key ?? null], (old) =>
      old ? { ...old, visibility: s.visibility, shareUrl: s.shareUrl, sharedWith: s.sharedWith } : old,
    );
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  };
  const share = () => p && sharing && openShareSheet({ id: p.id, name: p.name }, sharing, setSharing);
  // What to send someone: yours by its sharing; someone else's as you opened it.
  const sendPath =
    p && sharing ? (owned ? linkFor(p.id, sharing) : `${playlistPath(p.id)}${key ? `?key=${encodeURIComponent(key)}` : ""}`) : undefined;
  const linkItems: MenuItem[] = sendPath
    ? [
        { label: "Share link…", icon: "share", onPress: () => shareLink(sendPath, p!.name) },
        {
          label: "Copy link",
          icon: "copy",
          onPress: () => copyLink(sendPath).then((ok) => toast(ok ? "Link copied" : "Couldn't copy the link.", ok ? "info" : "error")),
        },
      ]
    : [];

  return (
    <Collection
      kind={KIND[sharing?.visibility ?? "private"]}
      title={p?.name ?? ""}
      description={p?.description}
      meta={
        p && !owned && p.owner ? (
          <Text variant="subhead" color={colors.text2}>
            By{" "}
            <Text variant="subhead" weight={600} color={colors.tint} onPress={() => router.push(profilePath(p.owner!.username) as never)}>
              {p.owner.name}
            </Text>
          </Text>
        ) : undefined
      }
      actions={
        p && owned ? (
          <IconButton label="Share" onPress={share} size={40}>
            <Icon name="share" size={21} color={colors.tint} />
          </IconButton>
        ) : undefined
      }
      songs={songs}
      art={covers.length >= 4 ? <Collage urls={covers} /> : undefined}
      artUrl={covers[0]}
      numbered
      sortKey={`playlist:${id}`}
      findLabel="Find in playlist"
      error={q.isError ? { title: "Playlist not found", body: "It may have been deleted, or its owner stopped sharing it." } : null}
      noMatch={(x) => `Nothing in this playlist matches “${x}”.`}
      empty={
        owned
          ? { title: "An empty playlist, full of potential", body: "Find a song, open its ••• menu and choose Add to playlist." }
          : { title: "Nothing in here yet", body: `${p?.owner?.name ?? "Its owner"} hasn't added any songs.` }
      }
      menuLabel="Playlist options"
      menu={() =>
        !owned
          ? [
              ...linkItems,
              ...(p?.owner
                ? [
                    {
                      label: `Go to ${p.owner.name}`,
                      icon: "user" as const,
                      onPress: () => router.push(profilePath(p.owner!.username) as never),
                    },
                  ]
                : []),
            ]
          : [
              { label: "Share…", icon: "users", detail: sharing ? KIND[sharing.visibility] : undefined, onPress: share },
              ...linkItems,
              "divider",
              {
                label: "Rename",
                icon: "edit",
                onPress: async () => {
                  const name = await prompt({ title: "Rename playlist", label: "Name", defaultValue: p?.name, confirm: "Save" });
                  if (!name || !p) return;
                  try {
                    await Api.updatePlaylist(p.id, { name });
                    reload();
                  } catch {
                    toast("Couldn't rename it.", "error");
                  }
                },
              },
              {
                label: "Delete playlist",
                icon: "trash",
                danger: true,
                onPress: async () => {
                  if (!p) return;
                  if (!(await confirm({ title: `Delete “${p.name}”?`, note: "This can't be undone.", confirm: "Delete", danger: true })))
                    return;
                  try {
                    await Api.deletePlaylist(p.id);
                    toast(`Deleted ${p.name}`);
                    queryClient.removeQueries({ queryKey: ["playlist", id] });
                    libraryChanged();
                    router.back();
                  } catch {
                    toast("Couldn't delete it.", "error");
                  }
                },
              },
            ]
      }
      rowExtras={(song) =>
        !owned
          ? []
          : [
              {
                label: "Remove from this playlist",
                icon: "trash",
                onPress: async () => {
                  const itemId = itemFor.get(song);
                  if (!itemId || !p) return;
                  try {
                    await Api.removeFromPlaylist(p.id, itemId);
                    reload();
                  } catch {
                    toast("Couldn't remove that song.", "error");
                  }
                },
              },
            ]
      }
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
    />
  );
}
