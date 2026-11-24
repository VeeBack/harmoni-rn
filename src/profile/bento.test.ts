import { describe, expect, test } from "bun:test";

import { bentoLayout, pack, spread } from "./bento";

describe("pack", () => {
  test("dense: small tiles fill the holes bigger ones leave", () => {
    // big(2×2), small, tall(1×2), small in 4 columns:
    // row 0: B B s T
    // row 1: B B s T  <- the second small backfills under the first
    const { tiles, rows } = pack(4, 4);
    expect(tiles.map((t) => [t.col, t.row])).toEqual([
      [0, 0],
      [2, 0],
      [3, 0],
      [2, 1],
    ]);
    expect(rows).toBe(2);
  });

  test("never overlaps", () => {
    const { tiles } = pack(72, 19);
    const seen = new Set<string>();
    for (const t of tiles)
      for (let r = 0; r < t.rows; r++)
        for (let c = 0; c < t.cols; c++) {
          const k = `${t.row + r}:${t.col + c}`;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
  });
});

describe("bentoLayout", () => {
  test("a phone banner shows a handful of tiles, not all 72", () => {
    const { tiles, box } = bentoLayout({ width: 412, height: 230, tile: 84, gap: 7 });
    expect(box).toEqual({ w: 1800, h: 1300 });
    expect(tiles.length).toBeGreaterThan(6);
    expect(tiles.length).toBeLessThan(40);
  });
});

describe("spread", () => {
  test("evens first, then odds", () => {
    expect(spread([1, 2, 3, 4, 5])).toEqual([1, 3, 5, 2, 4]);
    expect(spread([1, 2])).toEqual([1, 2]);
  });
});
