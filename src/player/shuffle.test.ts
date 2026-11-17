import { describe, expect, test } from "bun:test";

import type { QueueSong } from "../api/types";
import { shuffleQueue, unshuffleQueue, windowed, type Entry } from "./shuffle";

const song = (id: string, autoplay = false): Entry => ({ id, title: id, artists: [], explicit: false, sources: [], ...(autoplay ? { autoplay: true as const } : {}) });
const ids = (q: Entry[]) => q.map((s) => s.id);

describe("shuffleQueue", () => {
  test("keeps played and current songs, shuffles upcoming, keeps autoplay last", () => {
    const q = [song("a"), song("b"), song("c"), song("d"), song("e"), song("x", true), song("y", true)];
    const r = shuffleQueue(q, 1);
    expect(ids(r.queue).slice(0, 2)).toEqual(["a", "b"]);
    expect(new Set(ids(r.queue).slice(2, 5))).toEqual(new Set(["c", "d", "e"]));
    expect(ids(r.queue).slice(5)).toEqual(["x", "y"]);
    expect(r.index).toBe(1);
    expect(ids(r.unshuffled)).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("shuffle play puts the chosen song first", () => {
    const q = [song("a"), song("b"), song("c"), song("d")];
    const r = shuffleQueue(q, 0, 2);
    expect(r.queue[0].id).toBe("c");
    expect(r.index).toBe(0);
    expect(new Set(ids(r.queue))).toEqual(new Set(["a", "b", "c", "d"]));
  });
});

describe("unshuffleQueue", () => {
  test("restores the original order after the current song", () => {
    const q = [song("a"), song("b"), song("c"), song("d"), song("e")];
    const s = shuffleQueue(q, 0);
    // Pretend we're on the original "c" wherever it landed.
    const at = s.queue.findIndex((x) => x.id === "c");
    const back = unshuffleQueue(s.queue, at, s.unshuffled);
    expect(ids(back).slice(at + 1).filter((id) => ["d", "e"].includes(id))).toEqual(["d", "e"].filter((id) => ids(s.queue).indexOf(id) > at));
    expect(back.every((x) => x.pos === undefined)).toBe(true);
  });

  test("keeps songs queued by hand while shuffled ahead of the rest", () => {
    const q = [song("a"), song("b"), song("c")];
    const s = shuffleQueue(q, 0);
    const withHand = [...s.queue.slice(0, 1), song("h"), ...s.queue.slice(1)];
    const back = unshuffleQueue(withHand, 0, s.unshuffled);
    expect(back[1].id).toBe("h");
  });
});

describe("windowed", () => {
  const many = Array.from({ length: 800 }, (_, i) => song(String(i))) as QueueSong[];
  test("caps at 500 with up to 20 before the start", () => {
    const w = windowed(many, 300, false);
    expect(w.songs.length).toBe(500);
    expect(w.songs[w.start].id).toBe("300");
    expect(w.start).toBe(20);
  });
  test("shuffled windows keep the start song", () => {
    const w = windowed(many, 700, true);
    expect(w.songs.length).toBe(500);
    expect(w.songs[w.start].id).toBe("700");
  });
});
