// Dev only. Signs in to a Harmoni server the way an app does (OAuth + PKCE,
// loopback redirect) and saves the tokens to .dev/session-<label>.json
// (gitignored, mode 600). The person signs in and taps Allow in their own
// browser; nothing here sees a password.
//
//   bun scripts/dev-login.ts [server] [label ...]
//   bun scripts/dev-login.ts https://music.ceccun.com cli emulator
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

const server = (process.argv[2] ?? "https://music.ceccun.com").replace(/\/+$/, "");
const labels = process.argv.length > 3 ? process.argv.slice(3) : ["cli", "emulator"];
const b64url = (b: Buffer) => b.toString("base64url");

const meta = await (await fetch(`${server}/.well-known/oauth-authorization-server`)).json();
const reg = await fetch(meta.registration_endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ client_name: "Harmoni RN (dev)", redirect_uris: ["http://127.0.0.1/callback"] }),
});
if (!reg.ok) throw new Error(`register failed: ${reg.status} ${await reg.text()}`);
const { client_id } = await reg.json();
mkdirSync(".dev", { recursive: true });

for (const label of labels) {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));
  let done!: (u: URL) => void;
  const got = new Promise<URL>((r) => (done = r));
  const srv = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname !== "/callback") return new Response("not found", { status: 404 });
      done(u);
      return new Response(`<body style="font:18px system-ui;padding:40px">Signed in for <b>${label}</b>. You can close this tab.</body>`, {
        headers: { "content-type": "text/html" },
      });
    },
  });
  const redirect = `http://127.0.0.1:${srv.port}/callback`;
  const auth = new URL(meta.authorization_endpoint);
  for (const [k, v] of Object.entries({
    client_id, redirect_uri: redirect, response_type: "code", code_challenge: challenge,
    code_challenge_method: "S256", state, scope: "harmoni",
  })) auth.searchParams.set(k, v);
  console.log(`\n[${label}] Opening your browser. Sign in and tap Allow…`);
  Bun.spawn(["open", auth.toString()]);
  const u = await got;
  srv.stop();
  if (u.searchParams.get("state") !== state) throw new Error("state mismatch");
  if (u.searchParams.get("iss") !== meta.issuer) throw new Error("issuer mismatch");
  if (u.searchParams.get("error")) throw new Error(`${u.searchParams.get("error")}: ${u.searchParams.get("error_description")}`);
  const tok = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code: u.searchParams.get("code")!, client_id,
      redirect_uri: redirect, code_verifier: verifier, device_name: `Claude dev (${label})`,
    }),
  });
  if (!tok.ok) throw new Error(`token failed: ${tok.status} ${await tok.text()}`);
  const t = await tok.json();
  const file = `.dev/session-${label}.json`;
  writeFileSync(file, JSON.stringify({
    server, issuer: meta.issuer, apiBase: meta.harmoni_api, tokenEndpoint: meta.token_endpoint,
    revocationEndpoint: meta.revocation_endpoint, clientId: client_id,
    accessToken: t.access_token, refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
  }, null, 2));
  chmodSync(file, 0o600);
  console.log(`[${label}] Saved ${file}`);
}
console.log("\nAll done. Thanks!");
