import Native from "harmoni-player";

/** An API failure with a message written for people (the server's own `error`). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

let origin: string | null = null;

/** The signed-in server's origin, e.g. https://music.example.com */
export function serverOrigin(): string | null {
  if (origin) return origin;
  const s = Native.getSession();
  origin = s ? s.server : null;
  return origin;
}

export function resetOrigin() {
  origin = null;
}

export async function authHeader(): Promise<Record<string, string>> {
  const token = await Native.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function send(path: string, opts: RequestOptions, token: string | null) {
  const base = serverOrigin();
  if (!base) throw new ApiError(401, "Sign in first.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(base + path, {
      method: opts.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

/** Calls the API with a fresh token; refreshes and retries once on 401. */
export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  let token = await Native.getAccessToken();
  let res: Response;
  try {
    res = await send(path, opts, token);
    if (res.status === 401) {
      token = await Native.refreshAccessToken(token);
      if (!token) throw new ApiError(401, "You've been signed out.");
      res = await send(path, opts, token);
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error)?.name === "AbortError" && opts.signal?.aborted) throw e;
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // 500s aren't JSON
  }
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : null) ?? (res.status >= 500 ? "Something went wrong on the server." : `Request failed (${res.status}).`);
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
