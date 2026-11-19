// Web links to a Harmoni server as routes in this app. Pure, for bun test and +native-intent.

/**
 * A link to this server's web app, as a route in this app: "/u/ejaz", "/playlist/x?key=…".
 * Null for anything else (another server, a page the app doesn't have).
 */
export function routeForLink(url: string, origin: string | null): string | null {
  let u: URL;
  try {
    u = new URL(url, origin ?? "https://x.invalid");
  } catch {
    return null;
  }
  const path = u.pathname.replace(/\/+$/, "");
  const ok = /^\/(u\/[^/]+(\/(followers|following|likes))?|song\/[^/]+|playlist\/[^/]+|spice\/[^/]+|album\/[^/]+|artist\/[^/]+)$/.test(
    path,
  );
  if (!ok) return null;
  const key = path.startsWith("/playlist/") ? u.searchParams.get("key") : null;
  return key ? `${path}?key=${encodeURIComponent(key)}` : path;
}
