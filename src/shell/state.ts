import { create } from "zustand";

export type NowPlayingView = "art" | "lyrics" | "queue";

export const useNowPlaying = create<{ open: boolean; view: NowPlayingView }>(() => ({ open: false, view: "art" }));

export function openNowPlaying(view: NowPlayingView = "art") {
  useNowPlaying.setState({ open: true, view });
}

export function closeNowPlaying() {
  useNowPlaying.setState({ open: false });
}

/** Lets a tab's root scroll to the top when its tab is pressed again. */
type ScrollToTop = () => void;
const scrollers = new Map<string, ScrollToTop>();
export function registerScrollToTop(tab: string, fn: ScrollToTop) {
  scrollers.set(tab, fn);
  return () => {
    if (scrollers.get(tab) === fn) scrollers.delete(tab);
  };
}
export function scrollTabToTop(tab: string) {
  scrollers.get(tab)?.();
}

/** Search tab reselect focuses its field. */
export const searchFocus = { current: null as null | (() => void) };
