import { describe, expect, test } from "bun:test";

import { activeIndex, buildTimeline } from "./timeline";

describe("buildTimeline", () => {
  test("adds an intro gap and estimates word timings", () => {
    const t = buildTimeline([
      { startMs: 6000, text: "Hello there world " },
      { startMs: 9000, text: "second line" },
    ]);
    expect(t[0]).toMatchObject({ kind: "gap", start: 0, end: 6000 });
    const line = t[1];
    expect(line.kind).toBe("line");
    if (line.kind === "line") {
      expect(line.words.map((w) => w.text).join("")).toBe("Hello there world ");
      expect(line.words[0].start).toBe(6000);
    }
  });

  test("splits CJK per character", () => {
    const t = buildTimeline([{ startMs: 0, text: "夜明けの街を" }]);
    const line = t.find((e) => e.kind === "line");
    expect(line && line.kind === "line" ? line.words.length : 0).toBe(6);
  });

  test("activeIndex finds the last started entry", () => {
    const t = buildTimeline([
      { startMs: 1000, text: "a" },
      { startMs: 2000, text: "b" },
    ]);
    expect(activeIndex(t, 500)).toBe(-1);
    expect(activeIndex(t, 1500)).toBe(0);
    expect(activeIndex(t, 2500)).toBe(1);
  });
});
