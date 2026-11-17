import * as Network from "expo-network";
import Native from "harmoni-player";
import { kv } from "@/lib/storage";
import { Tabs } from "expo-router/js-tabs";
import { useEffect } from "react";
import { View } from "react-native";

import { link, useLinkPref } from "@/link/link";
import { flushPendingListens, restorePlayer, setPlayerToast } from "@/player/player";
import { Dock } from "@/shell/Dock";
import "@/player/remoteSession";
import { NowPlaying } from "@/now-playing/NowPlaying";
import { useLibrary } from "@/state/library";
import { useSession } from "@/state/session";
import { toast } from "@/ui/overlays";
import { colors } from "@/ui/theme";
import { useDownloads } from "@/downloads/downloads";

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        tabBar={(props) => <Dock {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: "shift", lazy: true }}
      >
        <Tabs.Screen name="(home)" options={{ title: "Home" }} />
        <Tabs.Screen name="(search)" options={{ title: "Search" }} />
        <Tabs.Screen name="(library)" options={{ title: "Library" }} />
      </Tabs>
      <NowPlaying />
    </View>
  );
}
