import { router } from "expo-router";
import { create } from "zustand";

import type { Song } from "@/api/types";
import { closeNowPlaying } from "@/shell/state";

/** Songs to start a new Spice with (from a song menu). */
export const useSpiceDraft = create<{ seeds: Song[] }>(() => ({ seeds: [] }));

export function startSpiceWith(songs: Song[]) {
  useSpiceDraft.setState({ seeds: songs });
  closeNowPlaying();
  router.push("/spice/new");
}

/** The web's Spice auto-name (spice-name.ts). */
export function autoName(seeds: Song[]): string {
  if (!seeds.length) return "My Spice";
  const counts = new Map<string, { n: number; first: number }>();
  seeds.forEach((s, i) => {
    const lead = (s.artists.find((a) => a.role !== "featured") ?? s.artists[0])?.name;
    if (!lead) return;
    const c = counts.get(lead);
    if (c) c.n++;
    else counts.set(lead, { n: 1, first: i });
  });
  const names = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first).map(([n]) => n);
  const [a, b, c] = names;
  const candidates =
    names.length === 1
      ? [a]
      : names.length === 2
        ? [`${a} & ${b}`, `${a} & more`]
        : names.length === 3
          ? [`${a}, ${b} & ${c}`, `${a}, ${b} & more`, `${a} & more`]
          : [`${a}, ${b} & more`, `${a} & more`];
  return candidates.find((x) => x.length <= 60) ?? candidates[candidates.length - 1].slice(0, 60);
}
