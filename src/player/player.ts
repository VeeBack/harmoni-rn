import Native, { type NativePlayerState } from "harmoni-player";
import { AppState } from "react-native";
import { create } from "zustand";

import { Api } from "@/api/endpoints";
import type { LinkCommand, LinkEvent, LinkState, QueueSong, RepeatMode, Song } from "@/api/types";
import { after, onTick } from "@/lib/heartbeat";
import { kv } from "@/lib/storage";
import { deviceId, link, positionNow, setLinkHandler, useLink, type ReportPatch } from "@/link/link";
import { features, signOutHooks, useSession } from "@/state/session";
import { shuffleQueue, unshuffleQueue, windowed, type Entry } from "./shuffle";

// The player. Native (Media3) plays the queue and owns the playhead; this
// store owns the queue's meaning (shuffle, autoplay), Harmoni Link, and
// reporting. When another device is playing, controls become Link commands.

export interface PlayerStore {
  queue: Entry[];
  index: number;
  shuffle: boolean;
  unshuffled: Entry[] | null;
  repeat: RepeatMode;
  playing: boolean;
  buffering: boolean;
  positionMs: number;
  positionAt: number; // Date.now() when positionMs was read
  durationMs: number | null;
  error: string | null;
  volume: number;
  muted: boolean;
}

const saved = kv.get<{ shuffle: boolean; unshuffled: Entry[] | null; volume: number; repeat: RepeatMode } | null>("player.extra", null);

export const usePlayer = create<PlayerStore>(() => ({
  queue: [],
  index: -1,
  shuffle: saved?.shuffle ?? false,
  unshuffled: saved?.unshuffled ?? null,
  repeat: saved?.repeat ?? "off",
  playing: false,
  buffering: false,
  positionMs: 0,
  positionAt: Date.now(),
  durationMs: null,
  error: null,
  volume: saved?.volume ?? 1,
  muted: false,
}));

const set = usePlayer.setState;
const get = usePlayer.getState;

/** Is the native player holding our queue? (false after a restore or adopting Link state, until play) */
let nativeLoaded = false;
/** Native events from before a queue change we just made can still be in flight; ignore their index briefly. */
let ignoreIndexUntil = 0;
const settle = () => (ignoreIndexUntil = Date.now() + 400);
let pendingPosition = 0;

function persistExtra() {
  const s = get();
  kv.set("player.extra", { shuffle: s.shuffle, unshuffled: s.unshuffled?.slice(0, 500) ?? null, volume: s.volume, repeat: s.repeat });
}

export const isRemote = () => {
  const l = useLink.getState();
  return l.enabled && l.connected && !!l.active && l.active !== deviceId;
};

export function currentSong(): Entry | null {
  const s = get();
  return s.queue[s.index] ?? null;
}

const json = (q: Entry[]) => JSON.stringify(q);

function loadNative(play: boolean, positionMs = 0) {
  const s = get();
  if (s.index < 0 || !s.queue.length) return;
  nativeLoaded = true;
  settle();
  Native.setQueue(json(s.queue), s.index, positionMs, play);
  Native.setRepeat(s.repeat);
  Native.setVolume(s.muted ? 0 : s.volume);
}

function setQueueState(queue: Entry[], index: number, extra: Partial<PlayerStore> = {}) {
  autoplayGen++;
  autoplayTries = 0;
  set({ queue, index, error: null, ...extra });
  persistExtra();
  queueDirty++;
  scheduleReport();
}

// --- local actions (this device plays) ---

const local = {
  play(list: QueueSong[], start = 0, opts: { shuffle?: boolean } = {}) {
    if (!list.length) return;
    const shuffle = !!opts.shuffle || get().shuffle;
    const w = windowed(list, Math.max(0, Math.min(start, list.length - 1)), shuffle);
    let queue: Entry[] = w.songs.map((s) => stripQueueFields(s));
    let index = w.start;
    let unshuffled: Entry[] | null = null;
    if (shuffle) {
      const r = shuffleQueue(queue, 0, w.start);
      queue = r.queue;
      index = 0;
      unshuffled = r.unshuffled;
    }
    setQueueState(queue, index, { shuffle, unshuffled, playing: true, buffering: true, positionMs: 0, positionAt: Date.now() });
    loadNative(true, 0);
    claimIfNeeded();
  },

  playNext(song: Song) {
    const s = get();
    if (s.index < 0) return local.play([song], 0);
    const queue = s.queue.slice();
    queue.splice(s.index + 1, 0, stripQueueFields(song));
    set({ queue });
    queueDirty++;
    if (nativeLoaded) Native.insert(s.index + 1, json([queue[s.index + 1]]));
    scheduleReport();
  },

  addToQueue(song: Song) {
    const s = get();
    if (s.index < 0) return local.play([song], 0);
    let at = s.queue.findIndex((q, i) => i > s.index && q.autoplay);
    if (at < 0) at = s.queue.length;
    const queue = s.queue.slice();
    queue.splice(at, 0, stripQueueFields(song));
    set({ queue });
    queueDirty++;
    if (nativeLoaded) Native.insert(at, json([queue[at]]));
    scheduleReport();
  },

  removeFromQueue(i: number) {
    const s = get();
    if (i === s.index || i < 0 || i >= s.queue.length) return;
    const queue = s.queue.slice();
    queue.splice(i, 1);
    set({ queue, index: i < s.index ? s.index - 1 : s.index });
    queueDirty++;
    if (nativeLoaded) Native.removeAt(i);
    scheduleReport();
  },

  moveInQueue(from: number, to: number) {
    const s = get();
    if (from <= s.index || to <= s.index || from >= s.queue.length || to >= s.queue.length || from === to) return;
    const queue = s.queue.slice();
    const [m] = queue.splice(from, 1);
    queue.splice(to, 0, m);
    set({ queue });
    queueDirty++;
    if (nativeLoaded) Native.move(from, to);
    scheduleReport();
  },

  jumpTo(i: number) {
    const s = get();
    if (i < 0 || i >= s.queue.length) return;
    set({ index: i, error: null, buffering: true, positionMs: 0, positionAt: Date.now() });
    settle();
    if (!nativeLoaded) loadNative(true, 0);
    else {
      Native.skipTo(i, 0);
      Native.play();
    }
    claimIfNeeded();
  },

  toggle() {
    const s = get();
    if (s.index < 0) return;
    if (s.playing) {
      set({ playing: false });
      Native.pause();
    } else {
      set({ playing: true, buffering: true, error: null });
      if (!nativeLoaded) loadNative(true, pendingPosition);
      else Native.play();
      claimIfNeeded();
    }
  },

  pause() {
    if (get().playing) {
      set({ playing: false });
      Native.pause();
    }
  },

  next() {
    const s = get();
    if (s.index < 0) return;
    if (s.index + 1 < s.queue.length) return local.jumpTo(s.index + 1);
    if (s.repeat === "all") return local.jumpTo(0);
    // End of the queue: autoplay may bring more.
    runAutoplay(true);
  },

  prev() {
    const s = get();
    if (s.index < 0) return;
    if (!nativeLoaded) {
      if (pendingPosition > 3000 || s.index === 0) {
        pendingPosition = 0;
        set({ positionMs: 0, positionAt: Date.now() });
        return;
      }
      set({ index: s.index - 1, positionMs: 0 });
      pendingPosition = 0;
      return;
    }
    const pos = livePosition();
    if (pos > 3000 || s.index === 0) {
      Native.seekTo(0);
      set({ positionMs: 0, positionAt: Date.now() });
      scheduleReport(true);
      return;
    }
    local.jumpTo(s.index - 1);
  },

  seek(ms: number) {
    set({ positionMs: ms, positionAt: Date.now() });
    if (!nativeLoaded) pendingPosition = ms;
    else Native.seekTo(ms);
    scheduleReport(true);
  },

  setShuffle(on: boolean) {
    const s = get();
    if (on === s.shuffle) return;
    if (s.index < 0) {
      set({ shuffle: on });
      persistExtra();
      scheduleReport();
      return;
    }
    if (on) {
      const r = shuffleQueue(s.queue, s.index);
      set({ queue: r.queue, unshuffled: r.unshuffled, shuffle: true });
    } else {
      set({ queue: unshuffleQueue(s.queue, s.index, s.unshuffled), unshuffled: null, shuffle: false });
    }
    queueDirty++;
    persistExtra();
    if (nativeLoaded) Native.replaceAround(json(get().queue), get().index);
    scheduleReport();
  },

  setRepeat(mode: RepeatMode) {
    set({ repeat: mode });
    persistExtra();
    Native.setRepeat(mode);
    scheduleReport();
  },

  cycleRepeat() {
    const r = get().repeat;
    local.setRepeat(r === "off" ? "all" : r === "all" ? "one" : "off");
  },

  setVolume(v: number) {
    const volume = Math.max(0, Math.min(1, v));
    set({ volume, muted: false });
    persistExtra();
    Native.setVolume(volume);
    scheduleReport();
  },

  setMuted(muted: boolean) {
    set({ muted });
    Native.setVolume(muted ? 0 : get().volume);
    scheduleReport();
  },
};

/** Songs from the server's Link state or commands are stored as given: keep only real songs. */
function isSong(x: unknown): x is Entry {
  return !!x && typeof x === "object" && typeof (x as Entry).id === "string" && typeof (x as Entry).title === "string" && Array.isArray((x as Entry).artists);
}
function songsOnly(list: unknown): Entry[] {
  return Array.isArray(list) ? list.filter(isSong) : [];
}

function stripQueueFields(s: QueueSong | Entry): Entry {
  const { autoplay: _a, pos: _p, ...rest } = s as Entry;
  return rest as Entry;
}

function livePosition() {
  const s = get();
  return s.positionMs + (s.playing && !s.buffering ? Date.now() - s.positionAt : 0);
}

// --- remote actions (another device plays; send commands and update our view at once) ---

function patchRemote(p: Partial<LinkState>) {
  const st = useLink.getState().state;
  if (st) useLink.setState({ state: { ...st, ...p } });
}

async function send(command: LinkCommand) {
  const ok = await link.command(command);
  if (!ok) toastHook?.("The playing device can't be reached.", "error");
}

const remote = {
  play(list: QueueSong[], start = 0, opts: { shuffle?: boolean } = {}) {
    const w = windowed(list, start, !!opts.shuffle);
    send({ type: "play", songs: w.songs, startIndex: w.start, shuffle: opts.shuffle });
  },
  playNext: (song: Song) => send({ type: "playNext", song }),
  addToQueue: (song: Song) => send({ type: "addToQueue", song }),
  removeFromQueue(i: number) {
    const st = useLink.getState().state;
    const song = st?.queue[i];
    if (!st || !song || i <= st.index) return;
    patchRemote({ queue: st.queue.filter((_, j) => j !== i) });
    send({ type: "removeFromQueue", index: i, songId: song.id });
  },
  moveInQueue(from: number, to: number) {
    const st = useLink.getState().state;
    const song = st?.queue[from];
    if (!st || !song || from <= st.index || to <= st.index) return;
    const q = st.queue.slice();
    const [m] = q.splice(from, 1);
    q.splice(to, 0, m);
    patchRemote({ queue: q });
    send({ type: "moveInQueue", from, to, songId: song.id });
  },
  jumpTo(i: number) {
    const st = useLink.getState().state;
    const song = st?.queue[i];
    if (!song) return;
    patchRemote({ index: i, positionMs: 0, at: Date.now() + useLink.getState().offset });
    send({ type: "jumpTo", index: i, songId: song.id });
  },
  toggle() {
    const st = useLink.getState().state;
    if (st) patchRemote({ playing: !st.playing, positionMs: positionNow(st), at: Date.now() + useLink.getState().offset });
    send({ type: "toggle" });
  },
  pause() {
    const st = useLink.getState().state;
    if (st?.playing) remote.toggle();
  },
  next: () => send({ type: "next" }),
  prev: () => send({ type: "prev" }),
  seek(ms: number) {
    patchRemote({ positionMs: ms, at: Date.now() + useLink.getState().offset });
    send({ type: "seek", seconds: ms / 1000 });
  },
  setShuffle(on: boolean) {
    patchRemote({ shuffle: on });
    send({ type: "setShuffle", on });
  },
  cycleRepeat() {
    const r = useLink.getState().state?.repeat ?? "off";
    patchRemote({ repeat: r === "off" ? "all" : r === "all" ? "one" : "off" });
    send({ type: "cycleRepeat" });
  },
  setVolume(v: number) {
    patchRemote({ volume: v, muted: false });
    send({ type: "setVolume", volume: v });
  },
  setMuted(muted: boolean) {
    patchRemote({ muted });
    send({ type: "setMuted", muted });
  },
};

/** What the UI calls. Routes to this device or to the playing device. */
export const player = {
  play: (list: QueueSong[], start = 0, opts?: { shuffle?: boolean }) => (isRemote() ? remote.play(list, start, opts) : local.play(list, start, opts)),
  playNext: (song: Song) => (isRemote() ? remote.playNext(song) : local.playNext(song)),
  addToQueue: (song: Song) => (isRemote() ? remote.addToQueue(song) : local.addToQueue(song)),
  removeFromQueue: (i: number) => (isRemote() ? remote.removeFromQueue(i) : local.removeFromQueue(i)),
  moveInQueue: (from: number, to: number) => (isRemote() ? remote.moveInQueue(from, to) : local.moveInQueue(from, to)),
  jumpTo: (i: number) => (isRemote() ? remote.jumpTo(i) : local.jumpTo(i)),
  toggle: () => (isRemote() ? remote.toggle() : local.toggle()),
  pause: () => (isRemote() ? remote.pause() : local.pause()),
  next: () => (isRemote() ? remote.next() : local.next()),
  prev: () => (isRemote() ? remote.prev() : local.prev()),
  seek: (ms: number) => (isRemote() ? remote.seek(ms) : local.seek(ms)),
  setShuffle: (on: boolean) => (isRemote() ? remote.setShuffle(on) : local.setShuffle(on)),
  cycleRepeat: () => (isRemote() ? remote.cycleRepeat() : local.cycleRepeat()),
  setVolume: (v: number) => (isRemote() ? remote.setVolume(v) : local.setVolume(v)),

  /** Moves playback to another device (or here). */
  async transferTo(to: string) {
    if (to === deviceId) {
      if (!isRemote()) return;
      const st = useLink.getState().state;
      if (st?.queue?.length) adopt(st, st.playing);
      await link.transfer(deviceId);
      queueDirty++;
      scheduleReport(true);
      return;
    }
    if (!isRemote() && get().index >= 0) {
      const v = queueDirty;
      const r = await link.report(buildPatch(true), useLink.getState().active !== deviceId);
      if (r === "ok") queueAcked = v;
    }
    const ok = await link.transfer(to);
    if (!ok) toastHook?.("That device isn't online any more.", "error");
  },

  /** Stops and forgets the queue (sign out). */
  async clear() {
    autoplayGen++;
    nativeLoaded = false;
    await Native.stop();
    set({ queue: [], index: -1, playing: false, buffering: false, positionMs: 0, error: null, unshuffled: null });
    persistExtra();
  },
};

export let toastHook: ((message: string, kind?: "error" | "info") => void) | null = null;
export function setPlayerToast(fn: (message: string, kind?: "error" | "info") => void) {
  toastHook = fn;
}

// --- adopting state (Link hello / transfer / restore) ---

function adopt(st: LinkState, play: boolean) {
  const queue = songsOnly(st.queue);
  const index = Math.max(0, Math.min(st.index, queue.length - 1));
  const pos = positionNow(st);
  autoplayGen++;
  set({
    queue,
    index: queue.length ? index : -1,
    shuffle: st.shuffle,
    unshuffled: st.unshuffled ? songsOnly(st.unshuffled) : null,
    repeat: st.repeat,
    volume: typeof st.volume === "number" ? st.volume : 1,
    muted: !!st.muted,
    positionMs: pos,
    positionAt: Date.now(),
    durationMs: st.durationMs ?? null,
    playing: play,
    buffering: play,
    error: null,
  });
  persistExtra();
  if (!queue.length) return;
  if (play) loadNative(true, pos);
  else {
    if (nativeLoaded) {
      Native.stop();
      nativeLoaded = false;
    }
    pendingPosition = pos;
  }
}

/** On launch: pick up where we left off, paused (or attach to playback that's still going). */
export async function restorePlayer() {
  const q = await Native.getQueue();
  if (!q) return;
  let queue: Entry[] = [];
  try {
    queue = JSON.parse(q.queue);
  } catch {
    return;
  }
  if (!queue.length) return;
  const st = Native.getState() as NativePlayerState;
  set({ queue, index: q.index, positionMs: q.positionMs, positionAt: Date.now(), repeat: (st.repeat as RepeatMode) ?? get().repeat });
  if (q.live) {
    nativeLoaded = true;
    applyNative(st);
  } else {
    nativeLoaded = false;
    pendingPosition = q.positionMs;
  }
}

// --- native events ---

function applyNative(n: NativePlayerState) {
  if (!nativeLoaded || n.index === undefined) return;
  const s = get();
  const patch: Partial<PlayerStore> = {
    playing: n.playWhenReady && !n.ended && !n.idle,
    buffering: n.playWhenReady && n.buffering && !n.idle,
    positionMs: n.positionMs,
    positionAt: Date.now(),
    durationMs: n.durationMs ?? s.queue[n.index]?.durationMs ?? null,
  };
  if (n.index >= 0 && n.index !== s.index && n.index < s.queue.length && Date.now() > ignoreIndexUntil) patch.index = n.index;
  if (n.repeat && n.repeat !== s.repeat) patch.repeat = n.repeat;
  set(patch);
  const endedNow = n.ended && !wasEnded;
  wasEnded = n.ended;
  if (endedNow && !isRemote() && n.index === get().index) onQueueEnded();
}
let wasEnded = false;

let adopting = false;
/** Native started playing on its own (widget, headset, car) while JS wasn't driving it: take its queue. */
async function adoptNative() {
  if (adopting) return;
  adopting = true;
  try {
    const q = await Native.getQueue();
    if (!q?.live) return;
    const queue = songsOnly(JSON.parse(q.queue));
    if (!queue.length) return;
    autoplayGen++;
    nativeLoaded = true;
    set({ queue, index: q.index, positionMs: q.positionMs, positionAt: Date.now() });
    applyNative(Native.getState() as NativePlayerState);
    queueDirty++;
    claimIfNeeded();
    checkAutoplay();
  } catch {
    // keep what we had
  } finally {
    adopting = false;
  }
}

Native.addListener("onState", (n) => {
  if (!nativeLoaded && n.count > 0 && n.playWhenReady && !n.idle) {
    adoptNative();
    return;
  }
  const before = get();
  applyNative(n);
  const after = get();
  if (before.playing !== after.playing || before.buffering !== after.buffering || before.index !== after.index) scheduleReport();
});

Native.addListener("onTransition", ({ index }) => {
  if (!nativeLoaded) return;
  const s = get();
  if (index >= 0 && index < s.queue.length) {
    if (Date.now() > ignoreIndexUntil || index === s.index) set({ index, error: null, positionMs: 0, positionAt: Date.now() });
    autoplayTries = 0;
    checkAutoplay();
    scheduleReport();
  }
});

Native.addListener("onTimeline", async ({ count }) => {
  if (!nativeLoaded) return;
  if (count !== get().queue.length) {
    // Something outside the app changed the queue (e.g. resumed from the widget). Take native's.
    const q = await Native.getQueue();
    if (q?.live) {
      try {
        set({ queue: JSON.parse(q.queue), index: q.index });
      } catch {}
    }
  }
});

Native.addListener("onTick", (t) => {
  if (!nativeLoaded || t.positionMs === undefined) return;
  set({ positionMs: t.positionMs, positionAt: Date.now(), durationMs: t.durationMs ?? get().durationMs });
  // Link: keep remotes' playheads true while playing.
  if (t.playing && Date.now() - lastReportAt > 5000) scheduleReport(true);
});

Native.addListener("onError", ({ message }) => {
  set({ error: message, buffering: false, playing: false });
  toastHook?.(message, "error");
  scheduleReport();
});

// Debug runs against a real account can opt out of writing history.
const NO_REPORTS = process.env.EXPO_PUBLIC_NO_REPORTS === "1";
if (NO_REPORTS) console.log("[harmoni] not reporting plays or listens (EXPO_PUBLIC_NO_REPORTS)");

Native.addListener("onPlayed", ({ songId }) => {
  if (NO_REPORTS) return;
  Api.recordPlay(songId).catch(() => {});
});

Native.addListener("onListen", (e) => {
  if (NO_REPORTS || !useSession.getState().me?.superProcessing || e.playedMs < 2000) return;
  let auto = false;
  try {
    auto = !!(e.song && JSON.parse(e.song).autoplay);
  } catch {}
  const body = {
    songId: e.songId,
    playedMs: Math.round(Math.min(e.playedMs, 6 * 3600_000)),
    positionMs: Math.round(Math.min(e.positionMs, 6 * 3600_000)),
    durationMs: e.durationMs ? Math.round(e.durationMs) : undefined,
    reason: e.reason,
    heard: e.heard,
    replays: Math.min(100, e.replays),
    context: auto ? ("autoplay" as const) : undefined,
  };
  Api.listen(body).catch(() => {
    const pending = kv.get<(typeof body)[]>("listens.pending", []);
    kv.set("listens.pending", [...pending, body].slice(-50));
  });
});

export function flushPendingListens() {
  const pending = kv.get<Parameters<typeof Api.listen>[0][]>("listens.pending", []);
  if (!pending.length) return;
  kv.set("listens.pending", []);
  for (const l of pending) Api.listen(l).catch(() => {});
}

// --- autoplay ---

let autoplayGen = 0;
/** Next was pressed on the last song while a fetch was already running. */
let playWhenAdded = false;
let autoplayBusy = false;
let autoplayTries = 0;
let autoplayFor: string | null = null;

function autoplayOn() {
  const me = useSession.getState().me;
  return !!me?.autoplay && features().autoplay;
}

function checkAutoplay() {
  const s = get();
  if (isRemote() || s.index < 0 || !autoplayOn()) return;
  if (s.index >= s.queue.length - 2) runAutoplay(false);
}

async function runAutoplay(thenPlay: boolean) {
  const s = get();
  if (isRemote() || s.index < 0) return;
  if (!autoplayOn()) {
    if (thenPlay) local.pause();
    return;
  }
  if (autoplayBusy) {
    if (thenPlay) playWhenAdded = true;
    return;
  }
  const cur = s.queue[s.index];
  if (autoplayFor !== cur.id) {
    autoplayFor = cur.id;
    autoplayTries = 0;
  }
  if (autoplayTries >= 4) {
    if (thenPlay) local.pause();
    return;
  }
  autoplayTries++;
  autoplayBusy = true;
  const gen = autoplayGen;
  const seeds = s.queue
    .slice(Math.max(0, s.index - 2), s.index + 1)
    .reverse()
    .map((q) => q.id);
  const exclude = s.queue.slice(-400).map((q) => q.id);
  let added = 0;
  try {
    const songs = await Api.autoplay(seeds, exclude);
    if (gen !== autoplayGen || isRemote()) return;
    const now = get();
    const have = new Set(now.queue.map((q) => q.id));
    const fresh: Entry[] = songs.filter((x) => !have.has(x.id)).map((x) => ({ ...stripQueueFields(x), autoplay: true as const }));
    if (fresh.length) {
      added = fresh.length;
      const at = now.queue.length;
      set({ queue: [...now.queue, ...fresh] });
      queueDirty++;
      if (nativeLoaded) Native.insert(at, json(fresh));
      trimPlayed();
      scheduleReport();
      if (thenPlay || playWhenAdded) local.jumpTo(now.index + 1);
      playWhenAdded = false;
    }
  } catch {
    // silent, like the web
  } finally {
    autoplayBusy = false;
  }
  if (!added && gen === autoplayGen) {
    if (thenPlay && autoplayTries >= 4) local.pause();
    else if (autoplayTries < 4)
      after(8000, () => {
        if (gen !== autoplayGen || isRemote()) return;
        if (thenPlay) runAutoplay(true);
        else checkAutoplay();
      });
  }
}

/** The queue (and what Link stores) is capped at 500: drop the oldest played songs to make room. */
function trimPlayed() {
  const s = get();
  const extra = Math.min(s.queue.length - 500, s.index);
  if (extra <= 0) return;
  set({ queue: s.queue.slice(extra), index: s.index - extra });
  settle();
  if (nativeLoaded) Native.removeRange(0, extra);
  queueDirty++;
}

function onQueueEnded() {
  const s = get();
  if (s.index < s.queue.length - 1) {
    local.jumpTo(s.index + 1);
    return;
  }
  set({ playing: false, buffering: false });
  runAutoplay(true);
}

/** Turning autoplay off removes upcoming autoplay songs. */
export function dropAutoplaySongs() {
  autoplayGen++;
  const s = get();
  const keep: Entry[] = [];
  const removeAt: number[] = [];
  s.queue.forEach((q, i) => {
    if (i > s.index && q.autoplay) removeAt.push(i);
    else keep.push(q);
  });
  if (!removeAt.length) return;
  set({ queue: keep });
  queueDirty++;
  if (nativeLoaded) for (const i of removeAt.reverse()) Native.removeAt(i);
  scheduleReport();
}

// --- Harmoni Link reporting ---

/** Bumped on every queue change; a report clears it only up to the version it carried. */
let queueDirty = 1;
let queueAcked = 0;
let lastReportAt = 0;
let reportTimer: (() => void) | null = null;
let reporting = false;

function buildPatch(withQueue: boolean): ReportPatch {
  const s = get();
  const p: ReportPatch = {
    index: s.index,
    playing: s.playing,
    positionMs: Math.max(0, Math.round(nativeLoaded ? livePosition() : pendingPosition)),
    shuffle: s.shuffle,
    repeat: s.repeat,
    buffering: s.buffering,
    error: s.error,
    volume: s.volume,
    muted: s.muted,
    durationMs: s.durationMs ?? s.queue[s.index]?.durationMs ?? null,
  };
  if (withQueue) {
    p.queue = s.queue.slice(0, 500);
    p.unshuffled = s.unshuffled ? s.unshuffled.slice(0, 500) : null;
  }
  return p;
}

function claimIfNeeded() {
  if (useLink.getState().enabled && useLink.getState().active !== deviceId) {
    queueDirty++;
    scheduleReport(true);
  }
}

function scheduleReport(now = false) {
  const l = useLink.getState();
  if (!l.enabled || !l.connected) return;
  if (isRemote() && !get().playing) return;
  if (get().index < 0) return;
  reportTimer?.();
  reportTimer = after(now ? 0 : 150, sendReport);
}

async function sendReport() {
  reportTimer = null;
  if (reporting) {
    scheduleReport();
    return;
  }
  const l = useLink.getState();
  if (!l.enabled || !l.connected || get().index < 0) return;
  const active = l.active === deviceId;
  const s = get();
  // A paused device that isn't active doesn't report (it's a remote, or nobody's playing).
  if (!active && !s.playing && l.active) return;
  reporting = true;
  // Taking over always carries the queue (the server would otherwise keep the other device's).
  const version = queueDirty;
  const withQueue = version !== queueAcked || !active;
  lastReportAt = Date.now();
  const result = await link.report(buildPatch(withQueue), !active && s.playing);
  reporting = false;
  if (result === "ok") {
    if (withQueue) queueAcked = Math.max(queueAcked, version);
  } else if (result === "stale") {
    // a newer report won
  } else if (result === "not-playing") {
    queueDirty++;
    local.pause();
    link.reconnect();
  } else {
    queueDirty++;
    if (result === "gone") link.reconnect();
  }
}

function validCommand(c: LinkCommand): boolean {
  if (!c || typeof c.type !== "string") return false;
  const isInt = (n: unknown) => typeof n === "number" && Number.isInteger(n);
  switch (c.type) {
    case "play":
      return Array.isArray(c.songs) && c.songs.length > 0 && c.songs.every(isSong) && isInt(c.startIndex);
    case "playNext":
    case "addToQueue":
      return isSong(c.song);
    case "removeFromQueue":
    case "jumpTo":
      return isInt(c.index) && typeof c.songId === "string";
    case "moveInQueue":
      return isInt(c.from) && isInt(c.to) && typeof c.songId === "string";
    case "seek":
      return typeof c.seconds === "number" && c.seconds >= 0;
    case "setShuffle":
      return typeof c.on === "boolean";
    case "setVolume":
      return typeof c.volume === "number";
    case "setMuted":
      return typeof c.muted === "boolean";
    default:
      return ["toggle", "next", "prev", "cycleRepeat"].includes(c.type);
  }
}

/** Finds `songId` at `index`, or nearest to it. */
function locate(index: number, songId: string): number {
  const q = get().queue;
  if (q[index]?.id === songId) return index;
  let best = -1;
  q.forEach((s, i) => {
    if (s.id === songId && (best < 0 || Math.abs(i - index) < Math.abs(best - index))) best = i;
  });
  return best;
}

function applyCommand(c: LinkCommand) {
  if (!validCommand(c)) return;
  switch (c.type) {
    case "play":
      return local.play(c.songs, c.startIndex, { shuffle: c.shuffle });
    case "playNext":
      return local.playNext(c.song);
    case "addToQueue":
      return local.addToQueue(c.song);
    case "removeFromQueue": {
      const i = locate(c.index, c.songId);
      if (i >= 0) local.removeFromQueue(i);
      return;
    }
    case "jumpTo": {
      const i = locate(c.index, c.songId);
      if (i >= 0) local.jumpTo(i);
      return;
    }
    case "moveInQueue": {
      const i = locate(c.from, c.songId);
      if (i >= 0) local.moveInQueue(i, c.to);
      return;
    }
    case "toggle":
      return local.toggle();
    case "next":
      return local.next();
    case "prev":
      return local.prev();
    case "cycleRepeat":
      return local.cycleRepeat();
    case "seek":
      return local.seek(c.seconds * 1000);
    case "setShuffle":
      return local.setShuffle(c.on);
    case "setVolume":
      return local.setVolume(c.volume);
    case "setMuted":
      return local.setMuted(c.muted);
  }
}

let lastRemoteState: LinkState | null = null;

setLinkHandler((e: LinkEvent) => {
  switch (e.type) {
    case "hello": {
      const s = get();
      if (e.active === deviceId) {
        queueDirty++;
        scheduleReport(true);
      } else if (s.playing && nativeLoaded) {
        queueDirty++;
        scheduleReport(true); // claim: we're playing right now
      } else if (e.active && e.active !== deviceId) {
        lastRemoteState = e.state;
        if (nativeLoaded && s.playing) local.pause();
      } else if (!e.active && e.state?.queue?.length && !(nativeLoaded && s.playing)) {
        adopt(e.state, false);
      }
      break;
    }
    case "devices":
    case "ping": {
      const st = useLink.getState().state;
      if (e.active && e.active !== deviceId) lastRemoteState = st;
      if (!e.active && lastRemoteState && !(nativeLoaded && get().playing)) {
        // The playing device vanished: take its last state, paused.
        const last = st ?? lastRemoteState;
        lastRemoteState = null;
        if (last?.queue?.length) adopt({ ...last, playing: false }, false);
      }
      break;
    }
    case "state":
      lastRemoteState = useLink.getState().state;
      break;
    case "command":
      applyCommand(e.command);
      break;
    case "transfer":
      lastRemoteState = null;
      if (e.state?.queue?.length) {
        adopt(e.state, e.play);
        queueAcked = queueDirty; // we just loaded the server's queue
        scheduleReport(true);
      }
      break;
    case "release":
      lastRemoteState = useLink.getState().state;
      autoplayGen++; // anything autoplay was fetching is no longer ours to play
      if (nativeLoaded) {
        // Stop rather than pause, so a stray play (headset, car, notification) can't quietly take playback back.
        pendingPosition = livePosition();
        Native.stop();
        nativeLoaded = false;
      }
      set({ playing: false, buffering: false });
      break;
  }
});

// Reconnect + resync on resume; flush listens queued while offline.
AppState.addEventListener("change", (st) => {
  if (st === "active") flushPendingListens();
});

onTick(() => {
  // keep autoplay honest if the queue was edited elsewhere
});

signOutHooks.push(async () => {
  link.disconnect();
  lastRemoteState = null;
  await player.clear();
  kv.remove("listens.pending");
});

/** One place for UI to read "what's playing", local or remote. */
export interface PlaybackView {
  remote: boolean;
  queue: QueueSong[];
  index: number;
  song: QueueSong | null;
  playing: boolean;
  buffering: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  durationMs: number | null;
  error: string | null;
}
