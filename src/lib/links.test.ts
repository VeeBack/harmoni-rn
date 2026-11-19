import { expect, test } from "bun:test";

import { routeForLink } from "./links";

test("web links become routes", () => {
  const o = "https://music.example.com";
  expect(routeForLink("https://music.example.com/u/ejaz", o)).toBe("/u/ejaz");
  expect(routeForLink("https://music.example.com/u/ejaz/followers", o)).toBe("/u/ejaz/followers");
  expect(routeForLink("https://music.example.com/song/abc", o)).toBe("/song/abc");
  expect(routeForLink("https://music.example.com/playlist/p1?key=k%2B1", o)).toBe("/playlist/p1?key=k%2B1");
  expect(routeForLink("https://music.example.com/playlist/p1/", o)).toBe("/playlist/p1");
  expect(routeForLink("https://music.example.com/settings", o)).toBe(null);
  expect(routeForLink("/u/someone", o)).toBe("/u/someone");
  expect(routeForLink("/spice/daily", null)).toBe("/spice/daily");
});
