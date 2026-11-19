import { expect, test } from "bun:test";

import { isNewer, parseRelease, releaseNotes, versionParts } from "./release";

test("versions", () => {
  expect(versionParts("v1.0.12")).toEqual([1, 0, 12]);
  expect(versionParts("1.0")).toEqual([1, 0]);
  expect(versionParts("nightly")).toBeNull();
  expect(isNewer("1.0.10", "1.0.9")).toBe(true);
  expect(isNewer("v1.0.9", "1.0.9")).toBe(false);
  expect(isNewer("1.0.9", "1.0.10")).toBe(false);
  expect(isNewer("1.1", "1.0.99")).toBe(true);
  expect(isNewer("1.0.0.1", "1.0")).toBe(true);
  expect(isNewer("1.0.9", null)).toBe(false);
  expect(isNewer("garbage", "1.0.0")).toBe(false);
});

test("release notes", () => {
  expect(releaseNotes("**Full Changelog**: https://github.com/a/b/compare/v1.0.6...v1.0.9")).toEqual([]);
  expect(
    releaseNotes(
      "## What's Changed\n* Add profiles by @someone in https://github.com/a/b/pull/12\n* Fix `lyrics` scroll (#13)\n\n**Full Changelog**: https://x",
    ),
  ).toEqual(["Add profiles", "Fix lyrics scroll"]);
  expect(releaseNotes("- Profiles, sharing and links\n- A [link](https://x) here")).toEqual(["Profiles, sharing and links", "A link here"]);
  expect(releaseNotes("Just a paragraph.\n\nAnd another.")).toEqual(["Just a paragraph.", "And another."]);
  expect(releaseNotes(null)).toEqual([]);
});

test("a GitHub release", () => {
  const r = parseRelease({
    tag_name: "v1.0.9",
    body: "- Swipe down closes Now Playing",
    published_at: "2026-11-19T07:36:13Z",
    html_url: "https://github.com/ejaz4/harmoni-rn/releases/tag/v1.0.9",
    assets: [
      { name: "notes.txt", size: 10, browser_download_url: "https://x/notes.txt" },
      {
        name: "harmoni-1.0.9.apk",
        size: 56148627,
        browser_download_url: "https://github.com/ejaz4/harmoni-rn/releases/download/v1.0.9/harmoni-1.0.9.apk",
        digest: "sha256:B865F5A9E33767B7C5AF871CEEDED133039F02D8D6FACDB5BB40C2438BFB0980",
      },
    ],
  });
  expect(r).toEqual({
    version: "1.0.9",
    notes: ["Swipe down closes Now Playing"],
    publishedAt: "2026-11-19T07:36:13Z",
    url: "https://github.com/ejaz4/harmoni-rn/releases/download/v1.0.9/harmoni-1.0.9.apk",
    size: 56148627,
    sha256: "b865f5a9e33767b7c5af871ceeded133039f02d8d6facdb5bb40c2438bfb0980",
    page: "https://github.com/ejaz4/harmoni-rn/releases/tag/v1.0.9",
  });
  expect(parseRelease({ tag_name: "v1.0.9", assets: [] })).toBeNull();
  expect(parseRelease({ tag_name: "v1.0.9", prerelease: true, assets: [{ name: "a.apk", browser_download_url: "u" }] })).toBeNull();
  expect(parseRelease({ tag_name: "v1.0.9", assets: [{ name: "a.apk", browser_download_url: "u" }] })?.sha256).toBeNull();
});
