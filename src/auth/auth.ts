import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as WebBrowser from "expo-web-browser";
import Native from "harmoni-player";

import type { ServerSetup } from "@/api/types";
import { kv } from "@/lib/storage";

export const REDIRECT_URI = "com.ceccun.harmoni:/oauth";
const CLIENT_NAME = "Harmoni for Android";

export interface ServerMeta {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string;
  harmoni_api?: string;
}

export interface FoundServer {
  origin: string;
  meta: ServerMeta;
  setup: ServerSetup;
}

/** Tidies what people type: add https://, drop paths and trailing slashes, keep the port. */
export function normalizeServer(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function looksLocal(origin: string) {
  const host = origin.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
  return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|.*\.local$)/.test(host);
}

async function getJson(url: string, timeoutMs = 12_000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { Accept: "application/json" }, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

export class ServerError extends Error {}

/** Finds a Harmoni server at what someone typed, or explains why not. */
export async function findServer(input: string): Promise<FoundServer> {
  const origin = normalizeServer(input);
  if (!origin) throw new ServerError("That doesn't look like a server address.");
  const candidates = [origin];
  if (origin.startsWith("https://") && looksLocal(origin) && !/^https:\/\/[^/]+:\d+$/.test(input.trim()))
    candidates.push(origin.replace("https://", "http://"));

  let lastError: Error = new ServerError("Couldn't reach that server.");
  for (const o of candidates) {
    let res: Response;
    try {
      res = await getJson(`${o}/.well-known/oauth-authorization-server`);
    } catch {
      lastError = new ServerError("Couldn't reach that server. Check the address and your connection.");
      continue;
    }
    if (res.status === 404) throw new ServerError("That isn't a Harmoni server, or it's a version from before apps could sign in.");
    if (!res.ok) throw new ServerError(`The server answered with an error (${res.status}).`);
    let meta: ServerMeta;
    try {
      meta = await res.json();
    } catch {
      throw new ServerError("That isn't a Harmoni server.");
    }
    if (!meta.authorization_endpoint || !meta.token_endpoint || !meta.registration_endpoint)
      throw new ServerError("That server doesn't support signing in from apps.");
    let setup: ServerSetup = { needsAdmin: false, name: "Harmoni", welcome: "", signups: "closed" };
    try {
      const r = await getJson(`${o}/api/setup`);
      if (r.ok) setup = await r.json();
    } catch {}
    return { origin: o, meta, setup };
  }
  throw lastError;
}

function b64url(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkce() {
  const verifier = b64url(Crypto.getRandomBytes(32));
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  const challenge = digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { verifier, challenge };
}

const clientKey = (issuer: string) => `oauth.client.${issuer}`;

async function register(meta: ServerMeta): Promise<string> {
  const res = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: CLIENT_NAME,
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
    }),
  });
  if (res.status === 429) throw new ServerError("Too many sign-in attempts from this network. Try again in a while.");
  if (!res.ok) throw new ServerError(`The server wouldn't register the app (${res.status}).`);
  const j = await res.json();
  return j.client_id as string;
}

export class SignInCancelled extends Error {}

/**
 * The whole OAuth dance: register (or reuse) a client, open Harmoni in a Custom
 * Tab, check state and iss, swap the code (with the PKCE verifier) for tokens,
 * and hand the session to the native side, which keeps and refreshes it.
 */
export async function signIn(server: FoundServer): Promise<void> {
  const { meta } = server;
  let clientId = kv.get<string | null>(clientKey(meta.issuer), null);
  let fresh = false;
  if (!clientId) {
    clientId = await register(meta);
    fresh = true;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const { verifier, challenge } = await pkce();
    const state = b64url(Crypto.getRandomBytes(16));
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      scope: "harmoni",
    });
    const result = await WebBrowser.openAuthSessionAsync(`${meta.authorization_endpoint}?${params}`, REDIRECT_URI, {
      showInRecents: false,
      createTask: false,
    });
    if (result.type !== "success") throw new SignInCancelled();

    const back = new URL(result.url);
    const q = back.searchParams;
    if (q.get("state") !== state) throw new ServerError("The sign-in didn't match. Try again.");
    if (q.get("iss") && q.get("iss") !== meta.issuer) throw new ServerError("The sign-in came back from a different server.");
    const error = q.get("error");
    if (error === "access_denied") throw new SignInCancelled();
    if (error) throw new ServerError(q.get("error_description") || `Sign-in failed (${error}).`);
    const code = q.get("code");
    if (!code) throw new ServerError("The server didn't send a sign-in code.");

    const res = await fetch(meta.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
        device_name: (Device.modelName || "Android").slice(0, 60),
      }).toString(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if ((body.error === "invalid_client" || body.error === "invalid_grant") && !fresh) {
        // The server forgot this app. Register again and start over.
        clientId = await register(meta);
        fresh = true;
        continue;
      }
      throw new ServerError(body.error_description || "The server wouldn't finish the sign-in.");
    }

    kv.set(clientKey(meta.issuer), clientId);
    await Native.setSession(
      JSON.stringify({
        server: server.origin,
        issuer: meta.issuer,
        apiBase: meta.harmoni_api ?? `${server.origin}/api`,
        tokenEndpoint: meta.token_endpoint,
        revocationEndpoint: meta.revocation_endpoint ?? "",
        clientId,
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
      }),
    );
    kv.set("server.last", { origin: server.origin, name: server.setup.name });
    return;
  }
  throw new ServerError("Couldn't sign in. Try again.");
}
