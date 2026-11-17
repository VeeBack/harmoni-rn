import { Tabs } from "expo-router/js-tabs";
import { useEffect } from "react";
import { View } from "react-native";

import { link } from "@/link/link";
import { flushPendingListens, restorePlayer, setPlayerToast } from "@/player/player";
import { Dock } from "@/shell/Dock";
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
    restorePlayer();
    refreshMe();
    useLibrary.getState().load();
    useDownloads.getState().load();
    flushPendingListens();
  }, [refreshMe]);

  const linkOn = me?.server.features.link ?? false;
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
