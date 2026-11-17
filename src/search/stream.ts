import { serverOrigin } from "@/api/client";
import type { ProviderStatus, Song, SpiceCard } from "@/api/types";
import { readLines } from "@/lib/stream";
import Native from "harmoni-player";

export interface SearchState {
  query: string;
  results: Song[];
  providers: ProviderStatus[];
  spice: SpiceCard | null;
  done: boolean;
  error: string | null;
}

/** Streams /api/search?stream=1 (NDJSON). Each provider event replaces the list. */
export async function streamSearch(query: string, onUpdate: (s: SearchState) => void, signal: AbortSignal): Promise<void> {
  const state: SearchState = { query, results: [], providers: [], spice: null, done: false, error: null };
  const origin = serverOrigin();
  if (!origin) return;
  let token = await Native.getAccessToken();
  let res = await fetch(`${origin}/api/search?stream=1&q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/x-ndjson" }, signal });
  if (res.status === 401) {
    token = await Native.refreshAccessToken(token);
    res = await fetch(`${origin}/api/search?stream=1&q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` }, signal });
  }
  if (!res.ok) {
    state.error = "Search failed";
    state.done = true;
    onUpdate({ ...state });
    return;
  }
  await readLines(
    res,
    (line) => {
      if (!line.trim()) return;
      let e: { type: string; [k: string]: unknown };
      try {
        e = JSON.parse(line);
      } catch {
        return;
      }
      switch (e.type) {
        case "start":
          state.providers = (e.providers as ProviderStatus[]) ?? [];
          break;
        case "provider": {
          const st = e.status as ProviderStatus;
          state.providers = state.providers.map((p) => (p.prefix === st.prefix ? { ...p, ...st } : p));
          state.results = (e.results as Song[]) ?? state.results;
          break;
        }
        case "spice":
          state.spice = e.spice as SpiceCard;
          break;
        case "done":
          state.done = true;
          break;
        case "error":
          state.error = String(e.error ?? "Search failed");
          state.done = true;
          break;
      }
      onUpdate({ ...state, results: state.results, providers: [...state.providers] });
    },
    signal,
  );
  if (!state.done) {
    state.done = true;
    onUpdate({ ...state });
  }
}
