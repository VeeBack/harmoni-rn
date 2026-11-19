import { useQuery } from "@tanstack/react-query";
import * as Application from "expo-application";
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
import { readAppleLibrary } from "@/lib/apple-library";
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
import { Stepper } from "@/ui/Stepper";
import { Text } from "@/ui/Text";
import { colors, radius } from "@/ui/theme";

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
          {note ? (
            <Text variant="footnote" color={colors.text2}>
              {note}
            </Text>
          ) : null}
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
        <Row
          title="Version"
          note={`Harmoni for Android ${Application.nativeApplicationVersion ?? ""} (${Application.nativeBuildVersion ?? ""})`}
        />
      </Group>
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

  const choose = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["text/xml", "application/xml", "*/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    setReading(true);
    try {
      const xml = await new File(r.assets[0].uri).text();
      let lib;
      try {
        lib = readAppleLibrary(xml);
      } catch {
        toast("That doesn't look like a Library.xml from Apple Music or iTunes.", "error");
        return;
      }
      const songs = lib.tracks.filter((t) => t.inLibrary).length;
      const inPlaylists = lib.playlists.reduce((a, pl) => a + pl.trackIds.length, 0);
      const yes = await confirm({
        title: "Bring in your Apple Music library?",
        note: `${songs.toLocaleString()} songs in your library, ${plural(lib.playlists.length, "playlist")} and ${inPlaylists.toLocaleString()} songs in all. They're added to what you have here; nothing is removed.`,
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
  return (
    <Group
      title="Bring your music"
      note="Your Apple Music library, playlists and play counts. In Music or iTunes on a computer, choose File → Library → Export Library…, then pick the file here."
    >
      {p?.status === "adding" ? (
        <>
          <Row first title="Bringing in your library" note={`${p.done.toLocaleString()} of ${p.total.toLocaleString()} songs`}>
            <SmallButton label="Stop" onPress={stop} />
          </Row>
          {meter(p.done, p.total)}
        </>
      ) : p?.status === "improving" && p.summary ? (
        <>
          <Row
            first
            title="Your library is in"
            note={`${p.summary.liked.toLocaleString()} songs added to your likes, ${plural(p.summary.playlists.length, "playlist")}. Now looking up the ${p.toImprove.toLocaleString()} songs new to Harmoni for their artwork and details: ${p.improved.toLocaleString()} so far. They all play in the meantime.`}
          >
            <SmallButton label="Stop" onPress={stop} />
          </Row>
          {meter(p.improved, p.toImprove)}
        </>
      ) : (
        <Row
          first
          title="Apple Music"
          note={
            p?.status === "done" && p.summary
              ? `Brought in ${shortDate(p.summary.appliedAt)}: ${p.summary.liked.toLocaleString()} songs added to your likes, ${plural(p.summary.playlists.length, "playlist")}, and play counts for ${p.summary.listening.toLocaleString()} songs. Bringing it in again adds anything new.`
              : p?.status === "failed"
                ? (p.error ?? "That didn't work. Try again?")
                : "Nothing here yet."
          }
        >
          {reading ? (
            <Text size={13} color={colors.text2}>
              Reading…
            </Text>
          ) : p?.status === "done" ? (
            <SmallButton label="Again" icon="plus" onPress={choose} />
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
              <Text size={13} weight={500} color={colors.accentInk}>
                Choose file
              </Text>
            </Press>
          )}
        </Row>
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
