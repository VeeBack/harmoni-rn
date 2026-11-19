/** A release on GitHub that this phone could update to. */
export interface Release {
  /** "1.0.12", the version name the build carries. */
  version: string;
  /** What changed, a line each, plain text. */
  notes: string[];
  publishedAt: string;
  /** The APK. */
  url: string;
  size: number;
  /** Hex SHA-256 GitHub publishes for the APK, to check the download against. */
  sha256: string | null;
  /** The release's page on GitHub. */
  page: string;
}

/** "v1.0.12" or "1.0.12" → [1, 0, 12]; null if it isn't a version. */
export function versionParts(v: string | null | undefined): number[] | null {
  const m = /^v?(\d+(?:\.\d+)*)$/.exec((v ?? "").trim());
  return m ? m[1].split(".").map(Number) : null;
}

/** Whether version `a` comes after `b`. Anything unparseable is never newer. */
export function isNewer(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = versionParts(a);
  const y = versionParts(b);
  if (!x || !y) return false;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

/** Markdown to a plain line: links to their text, no emphasis, code ticks or GitHub attributions. */
function plain(line: string): string {
  return line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/\s+by @[\w-]+ in https?:\/\/\S+$/, "")
    .replace(/\s+\(?#\d+\)?$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The release notes as a list of what changed (bullets, or else paragraphs), without the changelog link. */
export function releaseNotes(body: string | null | undefined): string[] {
  const lines = (body ?? "").split(/\r?\n/).map((l) => l.trim());
  const keep = (l: string) => l && !/^#+\s/.test(l) && !/full changelog/i.test(l) && !/^-{3,}$/.test(l);
  const bullets = lines.filter((l) => /^[-*•]\s+/.test(l)).map((l) => plain(l.replace(/^[-*•]\s+/, "")));
  const out = bullets.length ? bullets : lines.filter(keep).map(plain);
  return out.filter(Boolean);
}

/** GitHub's `releases/latest` JSON → a Release, or null if it has no APK or no version. */
export function parseRelease(json: unknown): Release | null {
  if (!json || typeof json !== "object") return null;
  const r = json as {
    tag_name?: string;
    body?: string | null;
    published_at?: string;
    html_url?: string;
    draft?: boolean;
    prerelease?: boolean;
    assets?: { name?: string; size?: number; browser_download_url?: string; digest?: string | null }[];
  };
  if (r.draft || r.prerelease) return null;
  const parts = versionParts(r.tag_name);
  const apk = r.assets?.find((a) => /\.apk$/i.test(a.name ?? "") && a.browser_download_url);
  if (!parts || !apk?.browser_download_url) return null;
  const digest = /^sha256:([0-9a-f]{64})$/i.exec(apk.digest ?? "");
  return {
    version: parts.join("."),
    notes: releaseNotes(r.body),
    publishedAt: r.published_at ?? "",
    url: apk.browser_download_url,
    size: apk.size ?? 0,
    sha256: digest ? digest[1].toLowerCase() : null,
    page: r.html_url ?? "",
  };
}
