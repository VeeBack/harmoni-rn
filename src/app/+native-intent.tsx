import { routeForLink } from "@/lib/links";

// The OAuth redirect (com.ceccun.harmoni:/oauth?code=…) is for the sign-in
// screen's auth session, not a page. Links to the web app
// (https://music.example.com/u/…, /song/…, /playlist/…?key=…) open the
// matching screen. Everything else goes through as is.
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  if (/(^|:\/*)oauth(\?|$)/.test(path) || path.startsWith("com.ceccun.harmoni:/oauth")) return initial ? "/" : null;
  if (/^https?:\/\//.test(path)) return routeForLink(path, null) ?? "/";
  return path;
}
