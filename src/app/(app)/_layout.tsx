import * as Network from "expo-network";
import Native from "harmoni-player";
import { kv } from "@/lib/storage";
import { Tabs } from "expo-router/js-tabs";
import { BlurTargetView } from "expo-blur";
import { useEffect, useRef, type ComponentRef } from "react";
import { View } from "react-native";
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated";

import { link, useLinkPref } from "@/link/link";
import { flushPendingListens, restorePlayer, setPlayerToast } from "@/player/player";
import { Dock, TabBarBridge } from "@/shell/Dock";
import { sheetProgress } from "@/shell/sheet";
import "@/player/remoteSession";
import { NowPlaying } from "@/now-playing/NowPlaying";
import { useLibrary } from "@/state/library";
import { useSession } from "@/state/session";
import { toast } from "@/ui/overlays";
import { colors } from "@/ui/theme";
import { useDownloads } from "@/downloads/downloads";
// Learns which songs each playlist and Spice holds as they load, for Downloads (works offline).
import "@/downloads/members";

setPlayerToast(toast);

export default function AppLayout() {
  const me = useSession((s) => s.me);
  const refreshMe = useSession((s) => s.refreshMe);

  useEffect(() => {
    Native.setSmooth(kv.get("settings.smoothPause", true));
    Native.setCrossfade(kv.get("settings.crossfade", 0));
    restorePlayer();
    refreshMe();
    useLibrary.getState().load();
    useDownloads.getState().load();
    flushPendingListens();
  }, [refreshMe]);

  // Say so when the connection drops; downloads keep playing.
  useEffect(() => {
    let wasOnline = true;
    const sub = Network.addNetworkStateListener((st) => {
      const online = !!st.isConnected && st.isInternetReachable !== false;
      if (wasOnline && !online) toast("You're offline. Downloaded songs still play.");
      wasOnline = online;
    });
    return () => sub.remove();
  }, []);

  const linkOnHere = useLinkPref((p) => p.on);
  const linkOn = (me?.server.features.link ?? false) && linkOnHere && process.env.EXPO_PUBLIC_DISABLE_LINK !== "1";
  useEffect(() => {
    link.setEnabled(linkOn);
  }, [linkOn]);

  const target = useRef<ComponentRef<typeof View>>(null);
  // While Now Playing rises, the app behind sinks back like a card (iOS sheet).
  const stage = useAnimatedStyle(() => {
    const p = sheetProgress.value;
    return {
      transform: [{ scale: interpolate(p, [0, 1], [1, 0.92], "clamp") }, { translateY: interpolate(p, [0, 1], [0, 18], "clamp") }],
      borderRadius: interpolate(p, [0, 0.05, 1], [0, 18, 28], "clamp"),
      opacity: interpolate(p, [0, 1], [1, 0.55], "clamp"),
    };
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Animated.View style={[{ flex: 1, overflow: "hidden", backgroundColor: colors.bg }, stage]}>
        <BlurTargetView ref={target} style={{ flex: 1, backgroundColor: colors.bg }}>
          <Tabs
            tabBar={(props) => <TabBarBridge {...props} />}
            screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: "fade", lazy: true }}
          >
            <Tabs.Screen name="(home)" options={{ title: "Home" }} />
            <Tabs.Screen name="(search)" options={{ title: "Search" }} />
            <Tabs.Screen name="(library)" options={{ title: "Library" }} />
          </Tabs>
        </BlurTargetView>
        <Dock target={target} />
      </Animated.View>
      <NowPlaying />
    </View>
  );
}
