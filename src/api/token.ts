import Native from "harmoni-player";
import { useEffect, useState } from "react";

import { serverOrigin } from "./client";

// A cached access token for things that need headers synchronously (images).
let token: string | null = null;
let fetchedAt = 0;
const listeners = new Set<(t: string | null) => void>();

async function refresh() {
  token = await Native.getAccessToken();
  fetchedAt = Date.now();
  listeners.forEach((l) => l(token));
}

export function useToken(): string | null {
  const [t, setT] = useState(token);
  useEffect(() => {
    listeners.add(setT);
    if (!token || Date.now() - fetchedAt > 40 * 60_000) refresh();
    return () => {
      listeners.delete(setT);
    };
  }, []);
  return t;
}

/** The server's artist photo proxy, with auth, for expo-image. */
export function useArtistImage(id: string | undefined): { uri: string; headers: Record<string, string> } | undefined {
  const t = useToken();
  const origin = serverOrigin();
  if (!id || !t || !origin) return undefined;
  return { uri: `${origin}/api/artists/${encodeURIComponent(id)}/image`, headers: { Authorization: `Bearer ${t}` } };
}
