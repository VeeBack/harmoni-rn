import Native, { type TickEvent } from "harmoni-player";

/**
 * React Native pauses JS timers while the app is in the background, but native
 * events still arrive. The player module ticks (every 0.5 s while playing, 1 s
 * in the foreground, 5 s otherwise), and everything periodic in the app (Link
 * reports, silence checks, reconnect backoff, autoplay retries) runs off it.
 */
type Listener = (t: TickEvent) => void;
const listeners = new Set<Listener>();
let last: TickEvent | null = null;

Native.addListener("onTick", (t) => {
  last = t;
  for (const l of listeners) {
    try {
      l(t);
    } catch (e) {
      console.warn("tick listener failed", e);
    }
  }
});

export function onTick(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function lastTick() {
  return last;
}

/** Runs `fn` once at or after `ms` from now, even in the background (to tick precision). */
export function after(ms: number, fn: () => void): () => void {
  const at = Date.now() + ms;
  let done = false;
  const jsTimer = setTimeout(() => fire(), ms);
  const off = onTick(() => {
    if (Date.now() >= at) fire();
  });
  function fire() {
    if (done) return;
    done = true;
    clearTimeout(jsTimer);
    off();
    fn();
  }
  return () => {
    done = true;
    clearTimeout(jsTimer);
    off();
  };
}
