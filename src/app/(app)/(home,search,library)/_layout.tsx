import { Stack } from "expo-router";

import { colors } from "@/ui/theme";

export const unstable_settings = {
  anchor: "index",
  search: { anchor: "search" },
  library: { anchor: "library" },
};

export default function TabStack({ segment }: { segment: string }) {
  const root = segment === "(search)" ? "search" : segment === "(library)" ? "library" : "index";
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: "ios_from_right",
        animationDuration: 320,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name={root} />
    </Stack>
  );
}
