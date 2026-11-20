import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, SplashScreen, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ReducedMotionConfig, ReduceMotion } from "react-native-reanimated";

import { importDevSession } from "@/auth/devSession";
import "@/player/player";
import { restoreQueryCache, queryClient } from "@/state/query";
import { usePrefs } from "@/settings/prefs";
import { useSession } from "@/state/session";
import { OverlayHost } from "@/ui/overlays";
import { colors } from "@/ui/theme";
import { openUpdateSheet } from "@/update/UpdateSheet";
import { startUpdater } from "@/update/updater";

SplashScreen.preventAutoHideAsync().catch(() => {});
SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
restoreQueryCache();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border, primary: colors.accent },
};

export default function RootLayout() {
  const signedIn = useSession((s) => s.signedIn);
  const reduceMotion = usePrefs((s) => s.reduceMotion);
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 60);
    importDevSession().then((ok) => ok && useSession.getState().didSignIn());
    // Before signing in too: an old build that can't sign in can still update.
    startUpdater(openUpdateSheet);
    return () => clearTimeout(t);
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Settings › Look & feel › Reduce motion; otherwise Android's own "Remove animations". */}
      <ReducedMotionConfig mode={reduceMotion ? ReduceMotion.Always : ReduceMotion.System} />
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={theme}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: "fade" }}>
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
          </Stack>
          <OverlayHost />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
