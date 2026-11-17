import Native from "harmoni-player";
import { create } from "zustand";

import { after } from "@/lib/heartbeat";
import { player, usePlayer } from "./player";

/** Sleep timer: pause after some minutes, or when the current song ends. */
export const useSleep = create<{ until: number | null; endOfSong: boolean }>(() => ({ until: null, endOfSong: false }));

let cancel: (() => void) | null = null;
let unsub: (() => void) | null = null;

export function setSleep(minutes: number | "song" | null) {
  cancel?.();
  cancel = null;
  unsub?.();
  unsub = null;
  Native.pauseAtEndOfSong(false);
  if (minutes === null) {
    useSleep.setState({ until: null, endOfSong: false });
    return;
  }
  if (minutes === "song") {
    // ExoPlayer pauses exactly at the end of this song.
    Native.pauseAtEndOfSong(true);
    useSleep.setState({ until: null, endOfSong: true });
    unsub = usePlayer.subscribe((s, prev) => {
      if (prev.playing && !s.playing) setSleep(null);
    });
    return;
  }
  useSleep.setState({ until: Date.now() + minutes * 60_000, endOfSong: false });
  cancel = after(minutes * 60_000, () => {
    player.pause();
    useSleep.setState({ until: null, endOfSong: false });
  });
}

export function sleepLabel(s: { until: number | null; endOfSong: boolean }) {
  if (s.endOfSong) return "Stops after this song";
  if (s.until) return `Stops in ${Math.max(1, Math.round((s.until - Date.now()) / 60_000))} min`;
  return "Off";
}
