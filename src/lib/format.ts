import type { Song } from "@/api/types";

/** "A, B feat. C": featured artists after " feat. ". */
export function artistLine(song: Pick<Song, "artists">): string {
  const primary = song.artists.filter((a) => a.role !== "featured").map((a) => a.name);
  const featured = song.artists.filter((a) => a.role === "featured").map((a) => a.name);
  const p = (primary.length ? primary : song.artists.map((a) => a.name)).join(", ");
  return featured.length && primary.length ? `${p} feat. ${featured.join(", ")}` : p;
}

export function firstArtist(song: Pick<Song, "artists">) {
  return song.artists.find((a) => a.role !== "featured") ?? song.artists[0];
}

export function time(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms) || ms < 0) return "–:––";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function total(songs: Pick<Song, "durationMs">[]): string {
  const ms = songs.reduce((a, s) => a + (s.durationMs ?? 0), 0);
  const min = Math.round(ms / 60000);
  if (min <= 0) return "";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} hr ${min % 60} min`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function greeting(name?: string | null): string {
  const h = new Date().getHours();
  const g = h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${g}, ${first}` : g;
}

/** The web's text normaliser for find-in-list and search ranking. */
export function normalize(s: string): string {
  return s
    .replace(/([a-z])\$([a-z])/gi, "$1s$2")
    .replace(/([a-z])!([a-z])/gi, "$1i$2")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9\u00c0-\uffff]+/g, " ")
    .trim();
}

export function matches(song: Song, query: string): boolean {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const hay = normalize([song.title, ...song.artists.map((a) => a.name), song.album?.title ?? ""].join(" "));
  return words.every((w) => hay.includes(w));
}

export function sameList(a: Pick<Song, "id">[], b: Pick<Song, "id">[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].id !== b[i].id) return false;
  return true;
}

export function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(0, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
