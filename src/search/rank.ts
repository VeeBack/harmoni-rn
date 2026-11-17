import { normalize } from "@/lib/format";
import { jaroWinkler, levenshteinRatio, tokenSortRatio } from "./similarity";

// The web app's top-result rule (src/lib/search-rank.ts there).
export const ARTIST_CONFIDENCE = 0.72;

const bare = (s: string) => normalize(s).replace(/^the /, "");

export function nameConfidence(query: string, target: string): number {
  const q = bare(query);
  const t = bare(target);
  if (!q || !t) return 0;
  if (q === t) return 1;
  const prefix = q.length >= 3 && t.startsWith(q) ? 0.75 + 0.25 * (q.length / t.length) : 0;
  return Math.max(levenshteinRatio(q, t), tokenSortRatio(q, t), jaroWinkler(q, t) * 0.9, prefix);
}

export interface RankedArtist {
  id: string;
  name: string;
  songs: number;
}

export function pickTopArtist<A extends RankedArtist>(query: string, artists: A[], topSong?: { title: string; artists: { name: string }[] }): A | undefined {
  let best: { artist: A; score: number } | undefined;
  for (const artist of artists) {
    const score = nameConfidence(query, artist.name);
    if (!best || score > best.score || (score === best.score && artist.songs > best.artist.songs)) best = { artist, score };
  }
  if (!best || best.score < ARTIST_CONFIDENCE) return undefined;
  if (!topSong) return best.artist;
  const by = topSong.artists[0]?.name ?? "";
  const songScore = Math.max(nameConfidence(query, topSong.title), nameConfidence(query, `${topSong.title} ${by}`), nameConfidence(query, `${by} ${topSong.title}`));
  return best.score >= songScore ? best.artist : undefined;
}
