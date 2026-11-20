import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as WebBrowser from "expo-web-browser";
import Native from "harmoni-player";
import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { AppState, StyleSheet, View } from "react-native";

import { errorMessage, serverOrigin } from "@/api/client";
import { Api } from "@/api/endpoints";
import type { ImportProgress, Invite } from "@/api/types";
import { removeAllDownloads, useDownloads } from "@/downloads/downloads";
import { readAppleLibrary, type AppleLibrary } from "@/lib/apple-library";
import type { ImportLibrary } from "@/lib/import-library";
import { readSpotifyFiles } from "@/lib/spotify-library";
import { bytes, plural, shortDate } from "@/lib/format";
import { hapticsEnabled, setHapticsEnabled } from "@/lib/haptics";
import { profilePath } from "@/lib/share";
import { kv } from "@/lib/storage";
import { deviceName, onlineDevices, setDeviceName, setLinkPref, useLink, useLinkPref, deviceId } from "@/link/link";
import { dropAutoplaySongs } from "@/player/player";
import { clearQueryCache } from "@/state/query";
import { useSession } from "@/state/session";
import { SmallButton, Switch } from "@/ui/bits";
import { Icon, type IconName } from "@/ui/Icon";
import { confirm, prompt, toast } from "@/ui/overlays";
import { IconButton, Press } from "@/ui/Press";
import { Screen } from "@/ui/Screen";
import { Spinner } from "@/ui/Spinner";
import { Stepper } from "@/ui/Stepper";
import { Text } from "@/ui/Text";
import { colors, radius } from "@/ui/theme";
import { openUpdateSheet, ProgressBar } from "@/update/UpdateSheet";
import { checkForUpdate, currentBuild, currentVersion, downloadUpdate, retryUpdate, updatesHere, useUpdate } from "@/update/updater";

/** An inset grouped section: a header, the rows in a rounded card, and a footnote under it. */
function Group({ title, note, children }: { title: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ marginTop: 32 }}>
      <Text variant="title3" weight={600} style={{ marginHorizontal: 4, marginBottom: 10 }}>
        {title}
      </Text>
      <View style={{ backgroundColor: colors.surface, borderRadius: 18, overflow: "hidden" }}>{children}</View>
      {note ? (
        <Text variant="footnote" color={colors.text2} style={{ marginHorizontal: 16, marginTop: 8 }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function Row({
  title,
  note,
  children,
  first,
  onPress,
  icon,
}: {
  title: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
  first?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingLeft: 16, minHeight: 52 }}>
      {icon ? (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            backgroundColor: "rgba(242,221,191,0.12)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={18} color={colors.tint} />
        </View>
      ) : null}
      <View
        style={{
          flex: 1,
          alignSelf: "stretch",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingRight: 16,
          paddingVertical: 11,
        }}
      >
        {first ? null : (
          <View
            style={{ position: "absolute", left: 0, right: 0, top: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }}
          />
        )}
        <View style={{ flex: 1, gap: 2 }}>
          {typeof title === "string" ? <Text variant="body">{title}</Text> : title}
          {typeof note === "string" ? (
            <Text variant="footnote" color={colors.text2}>
              {note}
            </Text>
          ) : (
            (note ?? null)
          )}
        </View>
        {children}
        {onPress ? <Icon name="chevron-right" size={17} color={colors.text3} /> : null}
      </View>
    </View>
  );
  return onPress ? (
    <Press onPress={onPress} feedback={false} scaleTo={1} highlight="rgba(255,255,255,0.06)">
      {body}
    </Press>
  ) : (
    body
  );
}

function OffHere() {
  return (
    <Text size={13} color={colors.text3}>
      Off on this server
    </Text>
  );
}

function openWeb(path: string) {
  const origin = serverOrigin();
  if (origin)
    WebBrowser.openBrowserAsync(`${origin}${path}`, { showTitle: true, toolbarColor: colors.bg, enableBarCollapsing: true }).catch(
      () => {},
    );
}

export default function Settings() {
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const signOut = useSession((s) => s.signOut);
  const f = me?.server.features;

  const patch = async (field: "superProcessing" | "autoplay", on: boolean, fail: string) => {
    if (!me) return;
    setMe({ ...me, [field]: on });
    if (field === "autoplay" && !on) dropAutoplaySongs();
    try {
      setMe(await Api.updateMe({ [field]: on }));
    } catch {
      setMe({ ...me, [field]: !on });
      toast(fail, "error");
    }
  };

  return (
    <Screen back title="Settings" large>
      <Group title="Your account">
        <Row first title={me?.name ?? "…"} note={me ? `@${me.username}${me.role === "admin" ? " · Admin" : ""}` : undefined}>
          <SmallButton
            label="Edit"
            icon="edit"
            onPress={async () => {
              const name = await prompt({
                title: "Your name",
                note: "It's what Harmoni calls you, and what other people here see.",
                label: "Name",
                defaultValue: me?.name,
                confirm: "Save",
              });
              if (!name) return;
              try {
                setMe(await Api.updateMe({ name }));
                toast("Name changed");
              } catch {
                toast("Couldn't change your name.", "error");
              }
            }}
          />
        </Row>
        {me?.username ? (
          <Row
            icon="user"
            title="Your profile"
            note="Your picture, banner, colours and font, and the songs you put on display."
            onPress={() => router.push(profilePath(me.username) as never)}
          />
        ) : null}
        <Row
          title="Password, sessions and apps"
          note="Change your password, or see where you're signed in, on the web."
          onPress={() => openWeb("/settings")}
        />
        <Row title="Sign out" note="Of this phone. Downloads on it are removed.">
          <SmallButton
            label="Sign out"
            icon="logout"
            onPress={async () => {
              if (
                !(await confirm({
                  title: "Sign out?",
                  note: "You'll need to sign in again to listen on this phone. Songs downloaded to it are removed.",
                  confirm: "Sign out",
                }))
              )
                return;
              await signOut();
              clearQueryCache();
            }}
          />
        </Row>
      </Group>

      {me?.role === "admin" ? (
        <Group title="Your server">
          <Row
            first
            icon="server"
            title="Server settings"
            note={`You run ${me.server.name}: people, sign-ups, features, where music comes from, and the audio cache. Opens on the web.`}
            onPress={() => openWeb("/settings/server")}
          />
        </Group>
      ) : null}

      <PlaybackGroup />
      <DownloadsGroup />

      <Group title="Listening">
        <Row
          first
          title="Super Processing"
          note="Harmoni learns from how you listen, and uses it to fill your home screen with mixes, new finds and old favourites, and to choose what autoplay plays next."
        >
          {f && !f.superProcessing ? (
            <OffHere />
          ) : (
            <Switch value={!!me?.superProcessing} onChange={(v) => patch("superProcessing", v, "Couldn't change Super Processing.")} />
          )}
        </Row>
        {me?.superProcessing ? (
          <View style={{ paddingLeft: 38, paddingRight: 20, paddingBottom: 16, gap: 6 }}>
            {[
              "Which songs you finish, which you skip and how soon, and the parts you go back to hear again",
              "What you like, what's in your playlists, and the artists you keep coming back to",
              "All of it stays on this Harmoni server and is only used for you",
            ].map((t) => (
              <Text key={t} size={13} color={colors.text2} style={{ lineHeight: 19 }}>
                • {t}
              </Text>
            ))}
          </View>
        ) : null}
        {me?.superProcessing ? (
          <Row title="Forget what it has learned" note="Start again from scratch.">
            <SmallButton
              label="Forget"
              icon="trash"
              onPress={async () => {
                const yes = await confirm({
                  title: "Forget what it's learned?",
                  note: "Your listening history for Super Processing goes, and your home screen starts again from scratch. Your likes and playlists stay.",
                  confirm: "Forget",
                  danger: true,
                });
                if (!yes) return;
                try {
                  await Api.forgetListening();
                  toast("Forgotten. Super Processing starts again from scratch.");
                } catch {
                  toast("Couldn't clear that. Try again?", "error");
                }
              }}
            />
          </Row>
        ) : null}
        <Row
          title="Autoplay"
          note={`When your queue runs out, keep playing songs like the one that just played${me?.superProcessing ? ", picked for you" : ""}.`}
        >
          {f && !f.autoplay ? (
            <OffHere />
          ) : (
            <Switch value={!!me?.autoplay} onChange={(v) => patch("autoplay", v, "Couldn't change autoplay.")} />
          )}
        </Row>
      </Group>

      <ImportGroup />
      {f?.link !== false ? <LinkGroup /> : null}
      {me?.server.canInvite ? <InvitesGroup days={me.server.inviteDays} /> : null}

      <Group title="This app">
        <Row first title="Haptics" note="Little taps under your finger as you play, skip and pick.">
          <HapticsSwitch />
        </Row>
        <Row title="Move with the music" note="In Now Playing, the background swells and glows with the bass.">
          <KvSwitch k="settings.bassBackdrop" initial />
        </Row>
        {Native.canPinWidget() ? (
          <Row title="Home screen widget" note="What's playing, with play, skip and back, right on your home screen.">
            <SmallButton label="Add" icon="plus" onPress={() => Native.pinWidget()} />
          </Row>
        ) : null}
        <LinksRow />
        <Row title="Server" note={serverOrigin()?.replace(/^https?:\/\//, "")} />
      </Group>
      <UpdatesGroup />
      <Text size={13} color={colors.text3} style={{ marginTop: 10, marginHorizontal: 4 }}>
        Harmoni on {me?.server.name ?? "your server"}
      </Text>
    </Screen>
  );
}

function HapticsSwitch() {
  const [on, setOn] = useState(hapticsEnabled());
  return (
    <Switch
      value={on}
      onChange={(v) => {
        setHapticsEnabled(v);
        setOn(v);
      }}
    />
  );
}

function useKvSwitch(key: string, fallback: boolean) {
  const [v, setV] = useState(kv.get(key, fallback));
  return [v, (x: boolean) => (kv.set(key, x), setV(x))] as const;
}

function PlaybackGroup() {
  const [keepAwake, setKeepAwake] = useKvSwitch("settings.keepAwake", false);
  const [smooth, setSmooth] = useKvSwitch("settings.smoothPause", true);
  const [fade, setFade] = useState(kv.get("settings.crossfade", 0));
  return (
    <Group title="Playback" note="These are for this phone, so your phone and computer can each have their own.">
      <View style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text weight={500}>Crossfade</Text>
            <Text size={13} color={colors.text2} style={{ marginTop: 2, lineHeight: 19 }}>
              {fade ? `Each song fades into the next over ${fade} seconds.` : "Fade each song into the next, the way a DJ would."}
            </Text>
          </View>
          <Text size={13} weight={500} color={colors.text2} tabular style={{ width: 44, textAlign: "right" }}>
            {fade ? `${fade} s` : "Off"}
          </Text>
        </View>
        <Stepper
          label="Crossfade"
          value={fade}
          min={0}
          max={12}
          onChange={(v) => {
            setFade(v);
            kv.set("settings.crossfade", v);
            Native.setCrossfade(v);
          }}
        />
      </View>
      <Row title="Smooth play and pause" note="Eases the music in and out instead of cutting it.">
        <Switch
          value={smooth}
          onChange={(v) => {
            setSmooth(v);
            Native.setSmooth(v);
          }}
        />
      </Row>
      <Row title="Keep the screen on for lyrics" note="While the lyrics are showing, the screen won't dim or lock.">
        <Switch value={keepAwake} onChange={setKeepAwake} />
      </Row>
      {Native.hasEqualizer() ? (
        <Row title="Equalizer" note="Shape the sound with your phone's equalizer." onPress={() => Native.openEqualizer()} />
      ) : null}
      <Row
        title="Load the next song early"
        note="The next song starts straight away, even on a slow connection. Harmoni always does this on Android."
      >
        <Icon name="check" size={20} color={colors.accent} />
      </Row>
    </Group>
  );
}

function DownloadsGroup() {
  const items = useDownloads((s) => s.items);
  const done = Object.values(items).filter((d) => d.state === "done").length;
  const [size, setSize] = useState(0);
  useEffect(() => {
    Native.getDownloadSize().then(setSize);
  }, [done]);
  return (
    <Group title="Downloads" note="Songs you download play without a connection, from this phone's storage.">
      <Row
        first
        title={done ? `${plural(done, "song")} saved` : "Nothing saved yet"}
        note={done ? `${bytes(size)} on this phone` : "Download a playlist, album, Spice or song to listen offline."}
      >
        {done ? (
          <SmallButton
            label="Remove all"
            icon="trash"
            onPress={async () => {
              if (
                await confirm({
                  title: "Remove all downloads?",
                  note: `${plural(done, "song")} saved on this phone will be removed.`,
                  confirm: "Remove all",
                  danger: true,
                })
              )
                removeAllDownloads();
            }}
          />
        ) : null}
      </Row>
    </Group>
  );
}

function LinkGroup() {
  const connected = useLink((l) => l.connected);
  const devices = useLink((l) => l.devices);
  const on = useLinkPref((p) => p.on);
  void devices;
  const others = onlineDevices().filter((d) => d.id !== deviceId).length;
  const [name, setName] = useState(deviceName());
  return (
    <Group
      title={
        <>
          Harmoni{" "}
          <Text size={18} weight={500} style={{ fontStyle: "italic" }}>
            Link
          </Text>
        </>
      }
      note="Your queue follows you between devices. Open Harmoni on any of them, then use the link button in the player to play there, or to control whichever one is playing."
    >
      <Row first title="Use Harmoni Link on this phone" note="Turn it off to keep this phone's playback to itself.">
        <Switch value={on} onChange={setLinkPref} />
      </Row>
      <Row
        title={name}
        note={
          !on
            ? "This phone."
            : connected
              ? `This phone. ${others ? `${plural(others, "other device")} ${others === 1 ? "is" : "are"} here now.` : "No other devices here now."}`
              : "Connecting…"
        }
      >
        <SmallButton
          label="Rename"
          icon="edit"
          onPress={async () => {
            const v = await prompt({
              title: "Name this device",
              note: "It's how this phone shows up in Harmoni Link on your others. Leave it empty to go back to the automatic name.",
              label: "Name",
              defaultValue: name,
              confirm: "Save",
            });
            if (v === undefined) return;
            setDeviceName(v);
            setName(deviceName());
          }}
        />
      </Row>
    </Group>
  );
}

function ago(iso: string | null) {
  if (!iso) return "never";
  return shortDate(iso);
}

function InvitesGroup({ days }: { days: number }) {
  const q = useQuery({ queryKey: ["invites"], queryFn: Api.invites });
  const mine = (q.data ?? []).filter((i) => !i.createdBy);
  const lasts = days === 0 ? "" : ` and lasts ${days === 1 ? "a day" : days === 7 ? "a week" : `${days} days`}`;
  const link = (code: string) => `${serverOrigin()}/signup?invite=${code}`;
  const copy = async (code: string) => {
    await Clipboard.setStringAsync(link(code));
    toast("Invite link copied");
  };
  const status = (i: Invite) => {
    if (i.usedAt) return i.usedBy ? `Used by @${i.usedBy}` : "Used";
    if (i.expiresAt && Date.parse(i.expiresAt) < Date.now()) return "Expired";
    return i.expiresAt ? `Not used yet · lasts until ${ago(i.expiresAt)}` : "Not used yet";
  };
  return (
    <Group title="Invite someone" note={`Each invite works once${lasts}. Send the link and they can pick their own username and password.`}>
      <Row first title="New invite link" note="Made and copied in one go.">
        <Press
          onPress={async () => {
            try {
              const r = await Api.createInvite();
              await copy(r.code);
              q.refetch();
            } catch {
              toast("Couldn't make an invite.", "error");
            }
          }}
          feedback="confirm"
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
          <Icon name="ticket" size={15} color={colors.accentInk} />
          <Text size={13} weight={500} color={colors.accentInk}>
            Create
          </Text>
        </Press>
      </Row>
      {mine.map((i) => {
        const expired = !!i.expiresAt && Date.parse(i.expiresAt) < Date.now();
        return (
          <Row key={i.code} title={<Text style={{ fontFamily: "monospace", letterSpacing: 1 }}>{i.code}</Text>} note={status(i)}>
            {!i.usedAt && !expired ? (
              <IconButton label="Copy link" size={36} onPress={() => copy(i.code)}>
                <Icon name="copy" size={19} color={colors.text2} />
              </IconButton>
            ) : null}
            {!i.usedAt ? (
              <IconButton
                label={expired ? "Remove" : "Take back"}
                size={36}
                onPress={async () => {
                  try {
                    await Api.deleteInvite(i.code);
                    q.refetch();
                  } catch {
                    toast("Couldn't take that invite back.", "error");
                  }
                }}
              >
                <Icon name="trash" size={19} color={colors.text2} />
              </IconButton>
            ) : null}
          </Row>
        );
      })}
    </Group>
  );
}

const songCount = (n: number) => `${n.toLocaleString()} ${n === 1 ? "song" : "songs"}`;
const monthYear = (sec: number) => new Date(sec * 1000).toLocaleDateString(undefined, { month: "long", year: "numeric" });
/** "a, b and c", skipping empties. */
function listOf(parts: string[]): string {
  const p = parts.filter(Boolean);
  return p.length > 1 ? `${p.slice(0, -1).join(", ")} and ${p[p.length - 1]}` : (p[0] ?? "Nothing");
}

function ImportGroup() {
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
    <Group
      title="Bring your music"
      note="Your library, playlists and listening from Apple Music or Spotify. Choose the file below: it's read on this phone, and only the music in it is sent."
    >
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

function checkedAgo(at: number) {
  const min = Math.round((Date.now() - at) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} hr ago` : shortDate(new Date(at).toISOString());
}

/** This version, whether there's a newer one (and getting it), and whether updates download by themselves. */
function UpdatesGroup() {
  const s = useUpdate();
  const [auto, setAuto] = useKvSwitch("settings.autoUpdate", true);
  const version = `Harmoni for Android ${currentVersion}${currentBuild ? ` (${currentBuild})` : ""}`;
  if (!updatesHere()) {
    return (
      <Group title="Updates">
        <Row first title="Version" note={version} />
      </Group>
    );
  }
  const r = s.release;
  const pct = s.total ? Math.round((s.received / s.total) * 100) : 0;
  let title = `Harmoni ${currentVersion}`;
  let note: ReactNode = s.checkedAt ? `Up to date · checked ${checkedAgo(s.checkedAt)}` : "Look for a newer version.";
  let action: ReactNode = <SmallButton label="Check" onPress={() => checkForUpdate({ manual: true })} />;
  if (s.phase === "checking") {
    note = "Checking…";
    action = <Spinner size={20} color={colors.text2} />;
  } else if (s.phase === "failed") {
    title = r ? `Harmoni ${r.version}` : "Couldn't check for updates";
    note = s.error;
    action = <SmallButton label="Try Again" onPress={retryUpdate} />;
  } else if (r && s.phase === "available") {
    title = `Harmoni ${r.version} is out`;
    note = `${bytes(r.size)} · you have ${currentVersion}`;
    action = <SmallButton label="Get" onPress={openUpdateSheet} />;
  } else if (r && (s.phase === "downloading" || s.phase === "verifying")) {
    title = `Downloading Harmoni ${r.version}`;
    note = (
      <View style={{ gap: 8, paddingTop: 4 }}>
        <ProgressBar value={s.total ? s.received / s.total : 0} />
        <Text variant="footnote" color={colors.text2}>
          {s.phase === "verifying" ? "Checking the download…" : `${bytes(s.received)} of ${bytes(s.total)} · ${pct}%`}
        </Text>
      </View>
    );
    action = null;
  } else if (r && s.phase === "ready") {
    title = `Harmoni ${r.version} is ready`;
    note = `Downloaded · you have ${currentVersion}`;
    action = <SmallButton label="Update" onPress={openUpdateSheet} />;
  } else if (r && s.phase === "installing") {
    title = `Updating to Harmoni ${r.version}`;
    note = "Android is installing it.";
    action = null; // the row opens the sheet, which can start again
  }
  return (
    <Group title="Updates" note={`${version}. New versions come from Harmoni's releases on GitHub.`}>
      <Row first title={title} note={note} onPress={r && !action ? openUpdateSheet : undefined}>
        {action}
      </Row>
      <Row title="Download updates automatically" note="On Wi‑Fi. Harmoni still asks before it installs one.">
        <Switch
          value={auto}
          onChange={(v) => {
            setAuto(v);
            if (v && s.phase === "available" && !Native.networkMetered()) downloadUpdate();
          }}
        />
      </Row>
    </Group>
  );
}

/** Whether links to this server's songs, playlists and profiles open here (Android asks the person). */
function LinksRow() {
  const [on, setOn] = useState(() => Native.linksEnabled());
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => st === "active" && setOn(Native.linksEnabled()));
    return () => sub.remove();
  }, []);
  const host = serverOrigin()?.replace(/^https?:\/\//, "") ?? "your server";
  return (
    <Row
      title="Open Harmoni links here"
      note={
        on
          ? `Links to songs, playlists and profiles on ${host} open in this app.`
          : `Links people send you open in the browser. Turn on links for ${host} so they open here.`
      }
    >
      {on ? <Icon name="check" size={20} color={colors.tint} /> : <SmallButton label="Turn on" onPress={() => Native.openLinkSettings()} />}
    </Row>
  );
}

function KvSwitch({ k, initial }: { k: string; initial: boolean }) {
  const [on, setOn] = useState(() => kv.get(k, initial));
  return (
    <Switch
      value={on}
      onChange={(v) => {
        setOn(v);
        kv.set(k, v);
      }}
    />
  );
}
