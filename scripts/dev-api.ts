// Dev only. Calls the Harmoni API with the saved .dev/session-cli.json,
// refreshing (and saving the rotated refresh token first) when needed.
//   bun scripts/dev-api.ts GET /api/me
//   bun scripts/dev-api.ts POST /api/playlists '{"name":"[test] x"}'
import { readFileSync, writeFileSync } from "node:fs";
const file = process.env.SESSION ?? ".dev/session-cli.json";
const s = JSON.parse(readFileSync(file, "utf8"));
async function fresh() {
  if (s.expiresAt - Date.now() > 60_000) return;
  const r = await fetch(s.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: s.refreshToken, client_id: s.clientId }),
  });
  if (!r.ok) throw new Error(`refresh failed ${r.status} ${await r.text()}`);
  const t = await r.json();
  s.accessToken = t.access_token; s.refreshToken = t.refresh_token; s.expiresAt = Date.now() + t.expires_in * 1000;
  writeFileSync(file, JSON.stringify(s, null, 2), { mode: 0o600 });
}
const [method = "GET", path = "/api/me", body] = process.argv.slice(2);
await fresh();
const r = await fetch(s.server + path, {
  method,
  headers: { authorization: `Bearer ${s.accessToken}`, ...(body ? { "content-type": "application/json" } : {}) },
  body,
});
const ct = r.headers.get("content-type") ?? "";
console.error(`${r.status} ${ct}`);
if (ct.includes("json")) console.log(JSON.stringify(await r.json(), null, 2));
else if (ct.startsWith("text")) console.log((await r.text()).slice(0, 4000));
else console.log(`[${(await r.arrayBuffer()).byteLength} bytes]`);
