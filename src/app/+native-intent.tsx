// The OAuth redirect (com.ceccun.harmoni:/oauth?code=…) is for the sign-in
// screen's auth session, not a page. Everything else goes through as is.
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  if (/(^|:\/*)oauth(\?|$)/.test(path) || path.startsWith("com.ceccun.harmoni:/oauth")) return initial ? "/" : null;
  return path;
}
