import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePlayback } from "@/player/hooks";

export const TOPBAR = 52;
export const TABS = 54;
export const MINI = 60;

/** Height the dock covers at the bottom (tabs, plus the mini player when a song is loaded). */
export function useDockHeight() {
  const insets = useSafeAreaInsets();
  const { song } = usePlayback();
  return TABS + 6 + (song ? MINI + 6 : 0) + insets.bottom;
}

/** Bottom padding for scrolling content so it clears the dock. */
export function useContentBottom() {
  return useDockHeight() + 28;
}
