import Native, { type ArtworkColors } from "harmoni-player";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useShallow } from "zustand/react/shallow";

import type { QueueSong } from "@/api/types";
import { sized } from "@/lib/art";
import { onlineDevices, positionNow, useLink } from "@/link/link";
import { deviceId } from "@/link/link";
import { usePlayer, type PlaybackView } from "./player";

/** What's playing, wherever it's playing. */
export function usePlayback(): PlaybackView {
  const linkView = useLink(
    useShallow((l) => ({
      remote: l.enabled && l.connected && !!l.active && l.active !== deviceId,
      state: l.state,
    })),
  );
  const local = usePlayer(
    useShallow((s) => ({
      queue: s.queue,
      index: s.index,
      playing: s.playing,
      buffering: s.buffering,
      shuffle: s.shuffle,
      repeat: s.repeat,
      durationMs: s.durationMs,
      error: s.error,
    })),
  );
  if (linkView.remote && linkView.state) {
    const st = linkView.state;
    const queue = (st.queue ?? []) as QueueSong[];
    return {
      remote: true,
      queue,
      index: st.index,
      song: queue[st.index] ?? null,
      playing: st.playing,
      buffering: st.buffering,
      shuffle: st.shuffle,
      repeat: st.repeat,
      durationMs: st.durationMs ?? queue[st.index]?.durationMs ?? null,
      error: st.error ?? null,
    };
  }
  return { remote: false, ...local, song: local.queue[local.index] ?? null };
}

export function useCurrentSong(): QueueSong | null {
  return usePlayback().song;
}

/** The name of the device playing, when it isn't this one. */
export function usePlayingOn(): string | null {
  return useLink((l) => {
    if (!l.enabled || !l.connected || !l.active || l.active === deviceId) return null;
    return l.devices.find((d) => d.id === l.active)?.name ?? "another device";
  });
}

/** Reads the playhead now (local or remote). Not reactive; call it from a frame loop or interval. */
export function readPosition(): { positionMs: number; durationMs: number | null; playing: boolean } {
  const l = useLink.getState();
  if (l.enabled && l.connected && l.active && l.active !== deviceId && l.state) {
    const st = l.state;
    return { positionMs: positionNow(st), durationMs: st.durationMs ?? st.queue?.[st.index]?.durationMs ?? null, playing: st.playing };
  }
  const s = usePlayer.getState();
  const live = s.playing && !s.buffering ? Date.now() - s.positionAt : 0;
  const dur = s.durationMs ?? s.queue[s.index]?.durationMs ?? null;
  const pos = s.positionMs + live;
  return { positionMs: dur ? Math.min(pos, dur) : pos, durationMs: dur, playing: s.playing };
}

/** The playhead, re-rendering every `everyMs` while the app is in front. */
export function useProgress(everyMs = 250) {
  const [p, setP] = useState(readPosition);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = setInterval(() => setP(readPosition()), everyMs);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && !id) id = setInterval(() => setP(readPosition()), everyMs);
      if (s !== "active" && id) {
        clearInterval(id);
        id = null;
      }
    });
    return () => {
      if (id) clearInterval(id);
      sub.remove();
    };
  }, [everyMs]);
  return p;
}

// --- artwork colours (the web's weighted mean, computed natively) ---

const colorCache = new Map<string, ArtworkColors | null>();
const inflight = new Map<string, Promise<ArtworkColors | null>>();

export function artworkColors(url: string): Promise<ArtworkColors | null> {
  if (colorCache.has(url)) return Promise.resolve(colorCache.get(url)!);
  let p = inflight.get(url);
  if (!p) {
    // A small copy is plenty: native samples it down to 24px for the mean colour.
    p = Native.getArtworkColors(sized(url, 256) ?? url).then((c) => {
      colorCache.set(url, c);
      inflight.delete(url);
      return c;
    });
    inflight.set(url, p);
  }
  return p;
}

export function useArtworkColors(url: string | undefined): ArtworkColors | null {
  const [c, setC] = useState<ArtworkColors | null>(() => (url ? (colorCache.get(url) ?? null) : null));
  useEffect(() => {
    if (!url) {
      setC(null);
      return;
    }
    if (colorCache.has(url)) {
      setC(colorCache.get(url)!);
      return;
    }
    let live = true;
    artworkColors(url).then((v) => live && setC(v));
    return () => {
      live = false;
    };
  }, [url]);
  return c;
}

export function useOnlineDevices() {
  const devices = useLink((l) => l.devices);
  const offset = useLink((l) => l.offset);
  void devices;
  void offset;
  return onlineDevices();
}

/** Text colour that reads on a background colour (the web's ink rules). */
export function inkFor(c: ArtworkColors | null) {
  if (!c) return { ink: "#f7f5f2", inkMuted: "rgba(247,245,242,0.72)" };
  return c.light ? { ink: "#151412", inkMuted: "rgba(21,20,18,0.68)" } : { ink: "#f7f5f2", inkMuted: "rgba(247,245,242,0.72)" };
}

export function mix(hex: string, base: [number, number, number], amount: number, baseAlpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const alpha = amount + (1 - amount) * baseAlpha;
  const ch = c.map((v, i) => Math.round((amount * v + (1 - amount) * baseAlpha * base[i]) / alpha));
  return `rgba(${ch[0]},${ch[1]},${ch[2]},${alpha.toFixed(3)})`;
}
