import { describe, expect, test } from "bun:test";

import { sized } from "./art";

describe("sized", () => {
  const art = "https://music.example.com/api/art/k3Jd9sQ2/aHR0cHM6Ly9saDM";
  test("asks Harmoni for the next width up", () => {
    expect(sized(art, 144)).toBe(`${art}?w=256`);
    expect(sized(art, 64)).toBe(`${art}?w=64`);
    expect(sized(art, 900)).toBe(`${art}?w=1024`);
  });
  test("past the largest width, the original", () => {
    expect(sized(art, 2000)).toBe(art);
  });
  test("replaces a width that's already there", () => {
    expect(sized(`${art}?w=64`, 400)).toBe(`${art}?w=512`);
  });
  test("song artwork and artist photos by id", () => {
    expect(sized("https://h/api/songs/abc/artwork", 100)).toBe("https://h/api/songs/abc/artwork?w=128");
    expect(sized("https://h/api/artists/abc/image?x=1", 100)).toBe("https://h/api/artists/abc/image?x=1&w=128");
  });
  test("YouTube Music URLs carry their size", () => {
    expect(sized("https://lh3.googleusercontent.com/a=w120-h120", 544)).toBe("https://lh3.googleusercontent.com/a=w544-h544");
  });
  test("anything else is left alone", () => {
    expect(sized("https://cdn.example.com/a.jpg", 300)).toBe("https://cdn.example.com/a.jpg");
    expect(sized(undefined, 300)).toBeUndefined();
  });
});
