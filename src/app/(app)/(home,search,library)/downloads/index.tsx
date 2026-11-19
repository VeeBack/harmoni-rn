import { router } from "expo-router";
import Native from "harmoni-player";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { countSaved, useSavedSongs } from "@/downloads/DownloadedList";
import { download, removeAllDownloads, useDownloads, type DownloadItem } from "@/downloads/downloads";
import { DownloadRing } from "@/downloads/DownloadRing";
import { listKey, refreshMembers, useMembers } from "@/downloads/members";
import { artistLine, bytes, plural } from "@/lib/format";
import { CardLink, useGridWidth } from "@/song/cards";
import { SpiceArt } from "@/spice/SpiceArt";
import { sortCollections, usePlaylists, useSharedPlaylists, useSpices } from "@/state/collections";
import { useLibrary } from "@/state/library";
import { Artwork } from "@/ui/Artwork";
import { EmptyState, Section, SmallButton } from "@/ui/bits";
import { NavRow } from "@/ui/NavRow";
import { confirm } from "@/ui/overlays";
import { Press } from "@/ui/Press";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";

/**
 * Your library, as it is on this phone: the same lists (Liked Songs, your playlists and
 * Spices, ones shared with you), each with just the songs saved here, so all of it works
 * without a connection. What's downloading now sits on top.
 */
export default function Downloads() {
  const saved = useSavedSongs();
  const items = useDownloads((s) => s.items);
  const liked = useLibrary((s) => s.liked);
  const playlists = usePlaylists();
  const spices = useSpices();
  const shared = useSharedPlaylists();
  const lists = useMembers((s) => s.lists);
  const w = useGridWidth();

  // Learn the songs of playlists not seen yet, so they can show here offline later.
  useEffect(() => {
    refreshMembers([...(playlists.data ?? []), ...(shared.data ?? [])]);
  }, [playlists.data, shared.data]);

  const [size, setSize] = useState(0);
  useEffect(() => {
    Native.getDownloadSize().then(setSize);
  }, [saved.size]);

  const { inFlight, waiting, failed } = useMemo(() => {
    const all = Object.values(items);
    return {
      inFlight: all.filter((d) => d.state === "downloading" && d.song),
      waiting: all.filter((d) => d.state === "queued").length,
      failed: all.filter((d) => d.state === "failed" && d.song).map((d) => d.song!),
    };
  }, [items]);

  const likedCount = useMemo(() => {
    let n = 0;
    for (const id of saved.keys()) if (liked.has(id)) n++;
    return n;
  }, [saved, liked]);
  const cols = sortCollections(playlists.data, spices.data)
    .map((c) => ({ c, n: countSaved(lists[listKey(c.type, c.id)]?.ids, saved) }))
    .filter((x) => x.n > 0);
  const sharedCols = (shared.data ?? [])
    .map((p) => ({ p, n: countSaved(lists[listKey("playlist", p.id)]?.ids, saved) }))
    .filter((x) => x.n > 0);

  const removeAll = async () => {
    const yes = await confirm({
      title: "Remove all downloads?",
      note: `${plural(saved.size, "song")} saved on this phone will be removed. Your likes and playlists stay.`,
      confirm: "Remove All",
      danger: true,
    });
    if (yes) removeAllDownloads();
  };

  const nothing = !saved.size && !inFlight.length && !waiting;
  return (
    <Screen back title="Downloads" large>
      <Text variant="subhead" color={colors.text2} style={{ marginTop: -4 }}>
        {saved.size ? `${plural(saved.size, "song")} on this phone${size ? ` · ${bytes(size)}` : ""}` : "Nothing on this phone yet"}
      </Text>

      {inFlight.length > 0 || waiting > 0 ? (
        <Section title="Downloading">
          <View>
            {inFlight.map((d, i) => (
              <InFlight key={d.id} item={d} last={i === inFlight.length - 1 && !waiting} />
            ))}
            {waiting ? (
              <Text variant="footnote" color={colors.text3} style={{ paddingTop: 10 }}>
                {plural(waiting, "more song")} waiting, in order from the top of the list you saved them from.
              </Text>
            ) : null}
          </View>
        </Section>
      ) : null}
      {failed.length ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 }}>
          <Text variant="footnote" color={colors.danger} style={{ flex: 1 }}>
            {plural(failed.length, "song")} couldn&apos;t be saved: the server didn&apos;t send {failed.length === 1 ? "it" : "them"}.
          </Text>
          <SmallButton label="Try Again" icon="download" onPress={() => download(failed)} />
        </View>
      ) : null}

      {nothing ? (
        <EmptyState
          title="Nothing saved yet"
          body="Tap the download button on a playlist, album or Spice, or choose Download from any song's menu. Your library shows up here with just what's on this phone, ready without a connection."
        />
      ) : (
        <>
          <View style={{ marginTop: 18 }}>
            <NavRow icon="music" label="Songs" detail={saved.size.toLocaleString()} onPress={() => router.push("/downloads/songs")} />
            <NavRow
              icon="heart"
              label="Liked Songs"
              detail={likedCount.toLocaleString()}
              onPress={() => router.push("/downloads/liked")}
              last
            />
          </View>
          {cols.length ? (
            <Section title="Playlists">
              <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 20 }}>
                {cols.map(({ c, n }) =>
                  c.type === "playlist" ? (
                    <CardLink
                      key={`p${c.id}`}
                      title={c.name}
                      subtitle={`Playlist · ${plural(n, "song")}`}
                      artwork={c.artworks[0]}
                      width={w}
                      onPress={() => router.push(`/downloads/playlist/${c.id}`)}
                    />
                  ) : (
                    <CardLink
                      key={`s${c.id}`}
                      title={c.name}
                      subtitle={`Spice · ${plural(n, "song")}`}
                      width={w}
                      onPress={() => router.push(`/downloads/spice/${c.id}`)}
                    >
                      <SpiceArt name={c.name} covers={c.covers} clearRight />
                    </CardLink>
                  ),
                )}
              </View>
            </Section>
          ) : null}
          {sharedCols.length ? (
            <Section title="Shared with you">
              <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 20 }}>
                {sharedCols.map(({ p, n }) => (
                  <CardLink
                    key={p.id}
                    title={p.name}
                    subtitle={`${p.owner.name} · ${plural(n, "song")}`}
                    artwork={p.artworks[0]}
                    width={w}
                    onPress={() => router.push(`/downloads/playlist/${p.id}`)}
                  />
                ))}
              </View>
            </Section>
          ) : null}
          {saved.size ? (
            <Press onPress={removeAll} feedback="tap" scaleTo={0.97} style={{ marginTop: 36, alignSelf: "center", padding: 10 }}>
              <Text variant="callout" color={colors.danger}>
                Remove All Downloads
              </Text>
            </Press>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** A song downloading right now, with its ring. */
function InFlight({ item, last }: { item: DownloadItem; last?: boolean }) {
  const song = item.song!;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 58 }}>
      <Artwork url={song.artworkUrl} size={44} radius={6} />
      <View style={{ flex: 1, alignSelf: "stretch", justifyContent: "center", gap: 1 }}>
        <Text variant="callout" weight={500} numberOfLines={1}>
          {song.title}
        </Text>
        <Text variant="subhead" color={colors.text2} numberOfLines={1}>
          {artistLine(song)}
        </Text>
        {last ? null : (
          <View style={{ position: "absolute", left: 0, right: -20, bottom: 0, height: 0.5, backgroundColor: colors.border }} />
        )}
      </View>
      <DownloadRing id={item.id} size={22} />
    </View>
  );
}
