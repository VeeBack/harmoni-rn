import { describe, expect, test } from "bun:test";

import { findServer, normalizeServer, ServerError } from "./server";

describe("normalizeServer", () => {
  test.each([
    ["music.example.com", "https://music.example.com"],
    ["https://music.example.com/", "https://music.example.com"],
    ["https://music.example.com/some/path?x=1", "https://music.example.com"],
    ["192.168.1.20:3000", "https://192.168.1.20:3000"],
    ["http://192.168.1.20:3000/", "http://192.168.1.20:3000"],
    ["  MUSIC.example.com  ", "https://music.example.com"],
  ])("%p → %p", (input, out) => expect(normalizeServer(input)).toBe(out));

  test("rejects junk", () => {
    expect(normalizeServer("")).toBeNull();
    expect(normalizeServer("ftp://x.com")).toBeNull();
  });
});

// Talks to a live server (public endpoints only). Set HARMONI_TEST_SERVER to run.
const live = process.env.HARMONI_TEST_SERVER;
describe.skipIf(!live)("findServer (live)", () => {
  test("finds the server's endpoints and name", async () => {
    const s = await findServer(live!);
    expect(s.meta.authorization_endpoint).toContain("/oauth/authorize");
    expect(s.meta.token_endpoint).toContain("/api/oauth/token");
    expect(typeof s.setup.name).toBe("string");
  });

  test("says when a site isn't Harmoni", async () => {
    await expect(findServer("example.com")).rejects.toBeInstanceOf(ServerError);
  });
});
