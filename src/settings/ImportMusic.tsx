import { useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useState } from "react";
import { View } from "react-native";

import { errorMessage } from "@/api/client";
import { Api } from "@/api/endpoints";
import type { ImportProgress } from "@/api/types";
import { readAppleLibrary, type AppleLibrary } from "@/lib/apple-library";
import { plural, shortDate } from "@/lib/format";
import type { ImportLibrary } from "@/lib/import-library";
import { readSpotifyFiles } from "@/lib/spotify-library";
import { SmallButton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { confirm, toast } from "@/ui/overlays";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";
import { Group, Row } from "./parts";

const songCount = (n: number) => `${n.toLocaleString()} ${n === 1 ? "song" : "songs"}`;
const monthYear = (sec: number) => new Date(sec * 1000).toLocaleDateString(undefined, { month: "long", year: "numeric" });
/** "a, b and c", skipping empties. */
function listOf(parts: string[]): string {
  const p = parts.filter(Boolean);
  return p.length > 1 ? `${p.slice(0, -1).join(", ")} and ${p[p.length - 1]}` : (p[0] ?? "Nothing");
}

/** Bring in a library from Apple Music or Spotify: the file is read here, only the music in it is sent. */
export function ImportMusic() {
  const [reading, setReading] = useState(false);
  const q = useQuery({
    queryKey: ["import"],
    queryFn: Api.importProgress,
    refetchInterval: (query) => {
      const s = (query.state.data as ImportProgress | null | undefined)?.status;
      return s === "adding" ? 1500 : s === "improving" ? 5000 : false;
    },
  });
  const p = q.data;
  const [showMissing, setShowMissing] = useState(false);

  // Apple Music's Library.xml, or the zips Spotify emails: read here, on the
  // phone, so only the songs, playlists and plays in them are sent.
  const choose = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ["application/zip", "application/json", "text/xml", "application/xml", "*/*"],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets?.length) return;
    setReading(true);
    // Let "Reading…" show before the unzipping takes the thread.
    await new Promise((done) => setTimeout(done, 60));
    try {
      const xml = r.assets.find((a) => /\.xml$/i.test(a.name) || /xml/.test(a.mimeType ?? ""));
      let lib: AppleLibrary | ImportLibrary;
      let note: string;
      if (xml) {
        try {
          lib = readAppleLibrary(await new File(xml.uri).text());
        } catch {
          toast("That doesn't look like a Library.xml from Apple Music or iTunes.", "error");
          return;
        }
        const liked = lib.tracks.filter((t) => t.inLibrary).length;
        note = listOf([
          `${songCount(liked)} in your library`,
          plural(lib.playlists.length, "playlist"),
          `${songCount(lib.tracks.length)} in all`,
        ]);
      } else {
        const files = await Promise.all(r.assets.map(async (a) => ({ name: a.name, bytes: await new File(a.uri).bytes() })));
        let spotify: ImportLibrary;
        try {
          spotify = readSpotifyFiles(files);
        } catch (e) {
          toast(e instanceof Error ? e.message : "That doesn't look like your Spotify data.", "error");
          return;
        }
        lib = spotify;
        const liked = spotify.tracks.filter((t) => t.inLibrary).length;
        const listens = spotify.listens ?? [];
        note = listOf([
          liked ? `${songCount(liked)} from Liked Songs` : "",
          spotify.playlists.length ? plural(spotify.playlists.length, "playlist") : "",
          // Oldest first.
          listens.length ? `${listens.length.toLocaleString()} plays since ${monthYear(listens[0][1])}` : "",
        ]);
      }
      const yes = await confirm({
        title: `Bring in your ${xml ? "Apple Music" : "Spotify"} library?`,
        note: `${note}. They're added to what you have here; nothing is removed.`,
        confirm: "Bring it in",
      });
      if (!yes) return;
      await Api.startImport(lib);
      q.refetch();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setReading(false);
    }
  };

  const stop = async () => {
    const adding = p?.status === "adding";
    const yes = adding
      ? await confirm({
          title: "Stop bringing it in?",
          note: "Nothing from this library is added. You can start again any time.",
          confirm: "Stop",
          danger: true,
        })
      : await confirm({
          title: "Stop looking for songs?",
          note: "Your library stays as it is. Songs not looked up yet are still found the first time you play them.",
          confirm: "Stop",
        });
    if (!yes) return;
    try {
      await Api.stopImport();
      q.refetch();
    } catch {
      toast("Couldn't stop it.", "error");
    }
  };

  const meter = (n: number, d: number) => (
    <View
      style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface3, marginHorizontal: 20, marginBottom: 16, overflow: "hidden" }}
    >
      <View style={{ height: 8, width: `${d ? Math.min(100, (n / d) * 100) : 0}%`, backgroundColor: colors.accent }} />
    </View>
  );

  const missing = p?.status === "done" ? (p.summary?.missing ?? []) : [];
  const name = p?.source === "spotify" ? "Spotify" : "Apple Music";
  const listening = p?.summary?.listens
    ? `${p.summary.listens.toLocaleString()} plays`
    : p?.summary
      ? `play counts for ${songCount(p.summary.listening)}`
      : "";
  return (
    <Group>
      {p?.status === "adding" ? (
        <>
          <Row first title={`Bringing in your ${name} library`} note={`${p.done.toLocaleString()} of ${p.total.toLocaleString()} songs`}>
            <SmallButton label="Stop" onPress={stop} />
          </Row>
          {meter(p.done, p.total)}
        </>
      ) : p?.status === "improving" && p.summary ? (
        <>
          <Row
            first
            title={`Your ${name} library is in`}
            note={`${songCount(p.summary.liked)} added to your likes, ${plural(p.summary.playlists.length, "playlist")}, ${listening}. Now looking up the ${p.toImprove.toLocaleString()} songs new to Harmoni for their artwork and details: ${p.improved.toLocaleString()} so far. They all play in the meantime.`}
          >
            <SmallButton label="Stop" onPress={stop} />
          </Row>
          {meter(p.improved, p.toImprove)}
        </>
      ) : (
        <>
          {p?.status === "done" && p.summary ? (
            <Row
              first
              title={name}
              note={`Brought in ${shortDate(p.summary.appliedAt)}: ${songCount(p.summary.liked)} added to your likes, ${plural(p.summary.playlists.length, "playlist")} and ${listening}. Bringing it in again adds anything new.`}
            />
          ) : p?.status === "failed" ? (
            <Row first title={name} note={p.error ?? "That didn't work. Try again?"} />
          ) : null}
          <Row
            first={p?.status !== "done" && p?.status !== "failed"}
            title={reading ? "Reading…" : "Choose your Spotify zip or Library.xml"}
            note={
              "Spotify: ask for your data at spotify.com/account/privacy, and tick Extended streaming history too, for every play you've made. Spotify emails a zip for each: choose them as they are, no need to unzip.\n\nApple Music: in Music or iTunes on a computer, File → Library → Export Library…"
            }
          >
            {reading ? null : p?.status === "done" ? (
              <SmallButton label="Choose" icon="plus" onPress={choose} />
            ) : (
              <Press
                onPress={choose}
                feedback="tap"
                scaleTo={0.95}
                style={{
                  height: 34,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: colors.accent,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name="plus" size={15} color={colors.accentInk} />
                <Text size={13} weight={600} color={colors.accentInk}>
                  Choose files
                </Text>
              </Press>
            )}
          </Row>
        </>
      )}
      {missing.length ? (
        <>
          <Row
            title={`${missing.length.toLocaleString()} songs not found anywhere`}
            note="None of the music services had these, so they have no artwork. They stay in your library, and playing one still looks for it."
          />
          <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 6 }}>
            {(showMissing ? missing : missing.slice(0, 5)).map((m, i) => (
              <Text key={i} size={13} color={colors.text2} numberOfLines={1}>
                {m.title} · {m.artist}
              </Text>
            ))}
            {missing.length > 5 ? (
              <Press
                onPress={() => setShowMissing(!showMissing)}
                feedback="tap"
                scaleTo={0.97}
                style={{ alignSelf: "flex-start", paddingVertical: 6 }}
              >
                <Text size={13} weight={600} color={colors.text2}>
                  {showMissing ? "Show fewer" : `Show all ${missing.length.toLocaleString()}`}
                </Text>
              </Press>
            ) : null}
          </View>
        </>
      ) : null}
    </Group>
  );
}

