import { useQuery } from "@tanstack/react-query";
import { useKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { Api } from "@/api/endpoints";
import type { QueueSong } from "@/api/types";
import { haptic } from "@/lib/haptics";
import { kv } from "@/lib/storage";
import { useLink } from "@/link/link";
import { useArtworkColors, usePlayback, usePlayingOn } from "@/player/hooks";
import { closeNowPlaying, openNowPlaying, useNowPlaying, type NowPlayingView } from "@/shell/state";
import { openSongMenu } from "@/song/menu";
import { useIsLiked, useLibrary } from "@/state/library";
import { useSession } from "@/state/session";
import { Artwork } from "@/ui/Artwork";
import { Icon, type IconName } from "@/ui/Icon";
import { toast, useToastOffset } from "@/ui/overlays";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { layout } from "@/ui/theme";
import { FadeMask } from "@/ui/FadeMask";
import { Backdrop } from "./Backdrop";
import { openLinkPicker } from "./LinkPicker";
import { PlainLyrics, SyncedLyrics } from "./Lyrics";
import { QueueView } from "./Queue";
import { Controls, Progress } from "./Transport";

const W = (a: number) => `rgba(255,255,255,${a})`;
const OPEN = Easing.bezier(0.2, 0.9, 0.25, 1);
const CLOSE = Easing.bezier(0.4, 0, 1, 1);

export function NowPlaying() {
  const open = useNowPlaying((s) => s.open);
  const { height } = useWindowDimensions();
  const y = useSharedValue(height);
  const [mounted, setMounted] = useState(false);
  const pb = usePlayback();

  useEffect(() => {
    if (open) {
      setMounted(true);
      y.value = height;
      y.value = withTiming(0, { duration: 460, easing: OPEN });
      useToastOffset.setState({ bottom: 200 });
    } else {
      y.value = withTiming(height, { duration: 280, easing: CLOSE }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
      useToastOffset.setState({ bottom: layout.tabBar + layout.miniPlayer + 24 });
    }
  }, [open, height, y]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeNowPlaying();
      return true;
    });
    return () => sub.remove();
  }, [open]);

  // Closes on its own when nothing's loaded any more.
  useEffect(() => {
    if (open && !pb.song) closeNowPlaying();
  }, [open, pb.song]);

  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 140 || (e.translationY > 40 && e.velocityY > 600)) {
        runOnJS(haptic.gestureEnd)();
        runOnJS(closeNowPlaying)();
      } else y.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.9 });
    });

  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  if (!mounted || !pb.song) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 40 }, sheet]}>
      <StatusBar style="light" />
      <Sheet pan={pan} song={pb.song} />
    </Animated.View>
  );
}

function Sheet({ pan, song }: { pan: ReturnType<typeof Gesture.Pan>; song: QueueSong }) {
  const insets = useSafeAreaInsets();
  const view = useNowPlaying((s) => s.view);
  const theme = useArtworkColors(song.artworkUrl);
  const lyricsOn = useSession((s) => s.me?.server.features.lyrics ?? true);
  const lyricsQ = useQuery({
    queryKey: ["lyrics", song.id],
    queryFn: () => Api.lyrics(song.id),
    enabled: lyricsOn,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const lyrics = lyricsQ.data;
  const hasWords = !!lyrics?.found && !lyrics.instrumental && !!lyrics.lines?.length;
  const shown: NowPlayingView = view === "lyrics" ? (lyricsQ.isLoading || hasWords ? "lyrics" : "art") : view;
  const linkConnected = useLink((l) => l.enabled && l.connected);

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, overflow: "hidden" }}>
      <Backdrop art={song.artworkUrl} theme={theme} />
      <GestureDetector gesture={pan}>
        <View>
          <Press onPress={closeNowPlaying} feedback="tap" scaleTo={1} accessibilityLabel="Close" style={{ height: 30, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: W(0.4) }} />
          </Press>
          {shown !== "art" ? <CompactHeader song={song} /> : null}
        </View>
      </GestureDetector>

      {shown === "art" ? (
        <GestureDetector gesture={pan}>
          <View style={{ flex: 1 }}>
            <ArtStage song={song} quiet={lyrics && !hasWords ? (lyrics.instrumental ? "Instrumental" : "No lyrics for this one") : undefined} pan={pan} />
          </View>
        </GestureDetector>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 8 }}>
            {shown === "queue" ? (
              <FadeMask stops={[[0, 0], [0.03, 1], [0.86, 1], [1, 0]]}>
                <QueueView />
              </FadeMask>
            ) : lyricsQ.isError ? (
              <Text size={13} color={W(0.55)}>
                Couldn't load lyrics right now.
              </Text>
            ) : lyrics && hasWords ? (
              lyrics.sync === "line" || lyrics.sync === "word" ? (
                <FadeMask stops={[[0, 0], [0.14, 0], [0.34, 1], [0.78, 1], [1, 0]]}>
                  <SyncedLyrics key={song.id} lyrics={lyrics} durationMs={song.durationMs} />
                </FadeMask>
              ) : (
                <FadeMask stops={[[0, 0], [0.12, 1], [0.8, 1], [1, 0]]}>
                  <PlainLyrics lyrics={lyrics} />
                </FadeMask>
              )
            ) : null}
            {shown === "lyrics" && hasWords ? <KeepAwakeForLyrics /> : null}
          </View>
          <GestureDetector gesture={pan}>
            <View style={{ paddingHorizontal: 28, paddingBottom: 8 }}>
              <Progress sheetPan={pan} />
              <Controls />
            </View>
          </GestureDetector>
        </View>
      )}

      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 34, paddingTop: 4, paddingBottom: 10 }}>
        <ViewButton icon="lyrics" label="Lyrics" on={shown === "lyrics"} onPress={() => openNowPlaying(view === "lyrics" ? "art" : "lyrics")} disabled={!lyricsOn} />
        {linkConnected ? <LinkButton /> : null}
        <ViewButton icon="queue" label="Up next" on={shown === "queue"} onPress={() => openNowPlaying(view === "queue" ? "art" : "queue")} />
      </View>
    </View>
  );
}

function KeepAwakeForLyrics() {
  const keep = kv.get("settings.keepAwake", false);
  return keep ? <KeepAwake /> : null;
}
function KeepAwake() {
  useKeepAwake("lyrics");
  return null;
}

function ViewButton({ icon, label, on, onPress, disabled, accent }: { icon: IconName; label: string; on?: boolean; onPress: () => void; disabled?: boolean; accent?: boolean }) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      feedback="select"
      scaleTo={0.88}
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: on ? W(0.2) : accent ? "rgba(239,230,214,0.14)" : "transparent", opacity: disabled ? 0.35 : 1 }}
    >
      <Icon name={icon} size={22} color={accent ? "#efe6d6" : on ? "#fff" : W(0.85)} />
    </Press>
  );
}

function LinkButton() {
  const playingOn = usePlayingOn();
  return <ViewButton icon="link" label={playingOn ? `Playing on ${playingOn}. Harmoni Link` : "Harmoni Link"} accent={!!playingOn} onPress={openLinkPicker} />;
}

function LikeButton({ song }: { song: QueueSong }) {
  const liked = useIsLiked(song.id);
  return (
    <Press
      onPress={() => useLibrary.getState().toggleLike(song).catch(() => toast("Couldn't save that. Try again?", "error"))}
      feedback={liked ? "toggleOff" : "confirm"}
      scaleTo={0.85}
      accessibilityLabel={liked ? "Remove from Liked" : "Add to Liked"}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: liked ? W(0.2) : "transparent" }}
    >
      <Icon name={liked ? "heart-solid" : "heart"} size={22} color={liked ? "#fff" : W(0.85)} />
    </Press>
  );
}

function PlayingOn() {
  const on = usePlayingOn();
  if (!on) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6, opacity: 0.9 }}>
      <Icon name="link" size={14} color="#fff" />
      <Text size={13} weight={500} color="#fff" numberOfLines={1}>
        Playing on {on}
      </Text>
    </View>
  );
}

function CompactHeader({ song }: { song: QueueSong }) {
  return (
    <Animated.View entering={FadeIn.duration(360)} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 4 }}>
      <Press onPress={() => openNowPlaying("art")} feedback="tap" scaleTo={0.95} style={{ elevation: 8, shadowColor: "#000", borderRadius: 8 }}>
        <Artwork url={song.artworkUrl} size={56} radius={8} />
      </Press>
      <View style={{ flex: 1 }}>
        <Text size={17} weight={600} color="#fff" numberOfLines={1}>
          {song.title}
        </Text>
        <Text color={W(0.68)} numberOfLines={1}>
          {song.artists.map((a) => a.name).join(", ")}
        </Text>
        <PlayingOn />
      </View>
      <LikeButton song={song} />
    </Animated.View>
  );
}

function ArtStage({ song, quiet, pan }: { song: QueueSong; quiet?: string; pan: ReturnType<typeof Gesture.Pan> }) {
  const { width, height } = useWindowDimensions();
  const pb = usePlayback();
  const art = Math.min(width - 56, height * 0.44, 520);
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 400 });
  }, [opacity]);
  useEffect(() => {
    scale.value = withTiming(pb.playing ? 1 : 0.86, { duration: 520, easing: Easing.bezier(0.2, 0.9, 0.25, 1.06) });
  }, [pb.playing, scale]);
  const artStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  const featuredAt = song.artists.findIndex((a) => a.role === "featured");
  const go = (href: string) => {
    closeNowPlaying();
    setTimeout(() => router.push(href as never), 60);
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: 28, paddingBottom: height * 0.02, alignItems: "center" }}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Animated.View style={[{ elevation: 24, shadowColor: "#000", borderRadius: 10 }, artStyle]}>
          <Press onLongPress={() => openSongMenu(song, [], { fromNowPlaying: true })} feedback={false} scaleTo={1}>
            <Artwork url={song.artworkUrl} size={art} radius={10} px={900} priority="high" />
          </Press>
        </Animated.View>
      </View>
      <View style={{ width: "100%", flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text size={21} weight={600} color="#fff" numberOfLines={1} style={{ letterSpacing: -0.2 }}>
            {song.title}
          </Text>
          <Text size={17} color={W(0.68)} numberOfLines={1}>
            {song.artists.map((a, i) => (
              <Text key={i} size={17} color={W(0.68)} onPress={a.id ? () => go(`/artist/${a.id}`) : undefined}>
                {i > 0 ? (i === featuredAt ? " feat. " : ", ") : ""}
                {a.name}
              </Text>
            ))}
            {song.album?.id ? (
              <Text size={17} color={W(0.68)} onPress={() => go(`/album/${song.album!.id}`)}>
                {" · "}
                {song.album.title}
              </Text>
            ) : null}
          </Text>
          <PlayingOn />
          {quiet ? (
            <Text size={13} color={W(0.55)} style={{ marginTop: 6 }}>
              {quiet}
            </Text>
          ) : null}
        </View>
        <Press onPress={() => openSongMenu(song, [], { fromNowPlaying: true })} feedback="contextClick" scaleTo={0.85} accessibilityLabel={`More options for ${song.title}`} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <Icon name="more" size={22} color={W(0.85)} />
        </Press>
        <LikeButton song={song} />
      </View>
      <View style={{ width: "100%" }}>
        <Progress sheetPan={pan} />
        <Controls />
      </View>
    </View>
  );
}
