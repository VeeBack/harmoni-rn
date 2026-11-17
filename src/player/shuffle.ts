import type { QueueSong } from "@/api/types";

// The web app's shuffle rules (src/components/player/shuffle.ts there).
// A queue entry may carry `pos`: its place in the list before shuffling.
export type Entry = QueueSong & { pos?: number };

export function shuffled<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Turns shuffle on. With `first` (shuffle play from a list) that song goes to
 * the front and everything else is shuffled after it. Otherwise played songs
 * and the current one stay, upcoming songs you queued are shuffled, and
 * upcoming autoplay songs keep their order after them.
 */
export function shuffleQueue(queue: Entry[], index: number, first?: number): { queue: Entry[]; unshuffled: Entry[]; index: number } {
  const tagged = queue.map((s, i) => (s.autoplay ? s : { ...s, pos: i }));
  const unshuffled = tagged.filter((s) => !s.autoplay);
  if (first !== undefined) {
    const head = tagged[first];
    const rest = tagged.filter((_, i) => i !== first);
    const mine = rest.filter((s) => !s.autoplay);
    const auto = rest.filter((s) => s.autoplay);
    return { queue: [head, ...shuffled(mine), ...auto], unshuffled, index: 0 };
  }
  const kept = tagged.slice(0, index + 1);
  const upcoming = tagged.slice(index + 1);
  const mine = upcoming.filter((s) => !s.autoplay);
  const auto = upcoming.filter((s) => s.autoplay);
  return { queue: [...kept, ...shuffled(mine), ...auto], unshuffled, index };
}

/** Turns shuffle off, going back to the original order after the current song. */
export function unshuffleQueue(queue: Entry[], index: number, unshuffled: Entry[] | null | undefined): Entry[] {
  const strip = (s: Entry): Entry => {
    if (s.pos === undefined) return s;
    const { pos: _pos, ...rest } = s;
    return rest as Entry;
  };
  let anchor: Entry | undefined;
  for (let i = Math.min(index, queue.length - 1); i >= 0; i--) {
    if (queue[i].pos !== undefined) {
      anchor = queue[i];
      break;
    }
  }
  if (!anchor || !unshuffled?.length) return queue.map(strip);

  const kept = queue.slice(0, index + 1);
  const upcoming = queue.slice(index + 1);
  const handQueued = upcoming.filter((s) => s.pos === undefined && !s.autoplay);
  const auto = upcoming.filter((s) => s.autoplay);
  const stillThere = new Set(upcoming.filter((s) => s.pos !== undefined).map((s) => s.pos));
  const restored = unshuffled.filter((s) => s.pos !== undefined && s.pos > anchor!.pos! && stillThere.has(s.pos));
  return [...kept, ...handQueued, ...restored, ...auto].map(strip);
}

/** The 500-song window the web app plays from a long list. */
export function windowed(songs: QueueSong[], start: number, shuffle: boolean): { songs: QueueSong[]; start: number } {
  const CAP = 500;
  if (songs.length <= CAP) return { songs, start };
  if (!shuffle) {
    const from = Math.max(0, Math.min(start - 20, songs.length - CAP));
    return { songs: songs.slice(from, from + CAP), start: start - from };
  }
  const others = shuffled(songs.map((_, i) => i).filter((i) => i !== start)).slice(0, CAP - 1);
  const keep = new Set([start, ...others]);
  const picked: QueueSong[] = [];
  let newStart = 0;
  songs.forEach((s, i) => {
    if (!keep.has(i)) return;
    if (i === start) newStart = picked.length;
    picked.push(s);
  });
  return { songs: picked, start: newStart };
}
