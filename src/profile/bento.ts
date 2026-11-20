// The "Top artists" banner's layout, as the web's CSS grid draws it: tiles
// big (2×2), wide (2×1), tall (1×2) and small, packed with
// `grid-auto-flow: dense` into as many columns as fit, centred, then the
// whole grid turned 30° about its middle. Pure, for bun test.

export type TileSize = "big" | "wide" | "tall" | "";

/** Tile sizes, repeated down the grid (the web's BENTO). */
export const BENTO: TileSize[] = ["big", "", "tall", "", "wide", "", "", "big", "wide", "", "tall", "", "", "wide", ""];

const SPAN: Record<TileSize, [number, number]> = { big: [2, 2], wide: [2, 1], tall: [1, 2], "": [1, 1] };

export interface Placed {
  /** Which tile (its index in the grid, for its artist and shade). */
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** CSS grid's dense auto-placement: each tile goes in the first cell, from the top left, where it fits. */
export function pack(count: number, columns: number): { tiles: { i: number; col: number; row: number; cols: number; rows: number }[]; rows: number } {
  const taken: boolean[][] = [];
  const free = (r: number, c: number) => !taken[r]?.[c];
  const tiles = [];
  let rows = 0;
  for (let i = 0; i < count; i++) {
    const [cols, rs] = SPAN[BENTO[i % BENTO.length]];
    const w = Math.min(cols, columns);
    let placed = false;
    for (let r = 0; !placed; r++) {
      for (let c = 0; c + w <= columns && !placed; c++) {
        let fits = true;
        for (let dr = 0; dr < rs && fits; dr++) for (let dc = 0; dc < w && fits; dc++) fits = free(r + dr, c + dc);
        if (!fits) continue;
        for (let dr = 0; dr < rs; dr++) {
          taken[r + dr] ??= [];
          for (let dc = 0; dc < w; dc++) taken[r + dr][c + dc] = true;
        }
        tiles.push({ i, col: c, row: r, cols: w, rows: rs });
        rows = Math.max(rows, r + rs);
        placed = true;
      }
    }
  }
  return { tiles, rows };
}

/**
 * The tiles that show in a `width`×`height` banner, positioned in the grid's
 * own frame: a box of `box.w`×`box.h` centred on the banner, which the caller
 * rotates by `angle` degrees about its middle.
 */
export function bentoLayout({
  width,
  height,
  tile,
  gap,
  count = 72,
  angle = 30,
  box,
}: {
  width: number;
  height: number;
  tile: number;
  gap: number;
  count?: number;
  angle?: number;
  /** The grid's box; by default big enough that its corners never show once it's turned. */
  box?: { w: number; h: number };
}): { box: { w: number; h: number }; tiles: Placed[] } {
  // The web's max(1800px, 130vw) × max(1300px, 90vw).
  const boxW = box?.w ?? Math.max(1800, width * 1.3);
  const boxH = box?.h ?? Math.max(1300, width * 0.9);
  const columns = Math.max(1, Math.floor((boxW + gap) / (tile + gap)));
  const { tiles, rows } = pack(count, columns);
  const gridW = columns * tile + (columns - 1) * gap;
  const gridH = rows * tile + (rows - 1) * gap;
  const ox = (boxW - gridW) / 2;
  const oy = (boxH - gridH) / 2;
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const out: Placed[] = [];
  for (const t of tiles) {
    const x = ox + t.col * (tile + gap);
    const y = oy + t.row * (tile + gap);
    const w = t.cols * tile + (t.cols - 1) * gap;
    const h = t.rows * tile + (t.rows - 1) * gap;
    // Where its centre lands on the banner once the box is turned about its middle.
    const cx = x + w / 2 - boxW / 2;
    const cy = y + h / 2 - boxH / 2;
    const sx = cx * cos - cy * sin;
    const sy = cx * sin + cy * cos;
    const reach = Math.hypot(w, h) / 2;
    if (Math.abs(sx) - reach > width / 2 || Math.abs(sy) - reach > height / 2) continue;
    out.push({ i: t.i, x, y, w, h });
  }
  return { box: { w: boxW, h: boxH }, tiles: out };
}

/** The web's interleave: favourites spread out instead of side by side. */
export function spread<T>(items: T[]): T[] {
  return items.length > 2 ? [...items.filter((_, i) => i % 2 === 0), ...items.filter((_, i) => i % 2 === 1)] : items;
}
