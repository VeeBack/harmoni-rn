// Finding a Harmoni server from what someone typed. No Expo imports, so it can be tested with `bun test`.
import type { ServerSetup } from "../api/types";

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

