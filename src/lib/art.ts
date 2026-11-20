const WIDTHS = [64, 128, 256, 512, 1024];

/**
 * Artwork at the size it's shown. Harmoni serves every cover from its own
 * cache (`/api/art/…`, also song artwork and artist photos by id) and resizes
 * it with `?w=` to 64, 128, 256, 512 or 1024 wide; past that, the original.
 * Older servers handed out YouTube Music URLs, which carry their size inside.
 */
export function sized(url: string | undefined, px: number): string | undefined {
  if (!url) return url;
  if (/\/api\/(art\/|songs\/[^/]+\/artwork|artists\/[^/]+\/image)/.test(url)) {
    const w = WIDTHS.find((n) => n >= px);
    const bare = url.replace(/([?&])w=\d+&?/, "$1").replace(/[?&]$/, "");
    return w ? `${bare}${bare.includes("?") ? "&" : "?"}w=${w}` : bare;
  }
  const m = url.match(/=w(\d+)-h(\d+)/);
  if (m && Number(m[1]) < px) return url.replace(/=w\d+-h\d+/, `=w${px}-h${px}`);
  return url;
}
