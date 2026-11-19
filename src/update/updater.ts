import * as Application from "expo-application";
import Native, { type UpdateEvent } from "harmoni-player";
import { AppState, Platform } from "react-native";
import { create } from "zustand";

import { kv } from "@/lib/storage";
import { toast } from "@/ui/overlays";
import { isNewer, parseRelease, type Release } from "./release";

/**
 * Harmoni updates itself from the GitHub Releases CI publishes (one per push to main),
 * so testers don't need a store or Obtainium. It looks at most once an hour, when the
 * app comes to the front; on Wi-Fi it downloads the APK in the background, then asks
 * once a day whether to install it. Android's own installer does the rest.
 */
const REPO = process.env.EXPO_PUBLIC_UPDATE_REPO || "ejaz4/harmoni-rn";
const HOUR = 3_600_000;

export const currentVersion = Application.nativeApplicationVersion ?? "0";
export const currentBuild = Application.nativeBuildVersion ?? "";

export type UpdatePhase =
  | "idle" // haven't looked yet
  | "checking"
  | "current"
  | "available" // newer release, not downloaded
  | "downloading"
  | "verifying"
  | "ready" // downloaded and checked
  | "installing"
  | "failed";

interface UpdateState {
  phase: UpdatePhase;
  release: Release | null;
  received: number;
  total: number;
  path: string | null;
  error: string | null;
  checkedAt: number;
  /** Tried to install, but Android needs "Install unknown apps" turned on for Harmoni first. */
  needsPermission: boolean;
}

export const useUpdate = create<UpdateState>(() => ({
  phase: "idle",
  release: null,
  received: 0,
  total: 0,
  path: null,
  error: null,
  checkedAt: kv.get("update.checkedAt", 0),
  needsPermission: false,
}));

const set = (s: Partial<UpdateState>) => useUpdate.setState(s);

/** Whether this copy updates itself: Android, not installed by a store, not turned off for this build. */
export function updatesHere(): boolean {
  if (Platform.OS !== "android" || process.env.EXPO_PUBLIC_UPDATES === "0") return false;
  return Native.installer() !== "com.android.vending";
}

export const autoDownloadOn = () => kv.get("settings.autoUpdate", true);

// ---------- checking ----------

interface Cached {
  etag: string;
  release: Release | null;
}

/** GitHub's latest release. Conditional (ETag), so a check with nothing new doesn't count against its limit. */
async function latestRelease(): Promise<Release | null> {
  const cached = kv.get<Cached | null>("update.latest", null);
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
    },
  });
  if (res.status === 304 && cached) return cached.release;
  if (res.status === 404) return null; // no releases yet
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  const release = parseRelease(await res.json());
  const etag = res.headers.get("etag");
  kv.set("update.latest", etag ? { etag, release } : undefined);
  return release;
}

let checking: Promise<void> | null = null;

/** Looks for a newer release. `manual`: they asked, so say if it fails, and download even if automatic downloads are off. */
export function checkForUpdate({ manual = false } = {}): Promise<void> {
  if (!updatesHere()) return Promise.resolve();
  if (checking) return checking;
  const { phase } = useUpdate.getState();
  if (phase === "downloading" || phase === "verifying" || phase === "installing") return Promise.resolve();
  if (manual) set({ phase: "checking", error: null });
  checking = (async () => {
    try {
      const release = await latestRelease();
      const now = Date.now();
      kv.set("update.checkedAt", now);
      set({ checkedAt: now });
      if (release && isNewer(release.version, currentVersion)) found(release, manual);
      else set({ phase: "current", release: null, path: null, error: null });
    } catch {
      if (manual) set({ phase: "failed", release: null, error: "Couldn't reach GitHub to check. Try again in a bit." });
    } finally {
      checking = null;
    }
  })();
  return checking;
}

function found(release: Release, manual: boolean) {
  const prev = useUpdate.getState();
  const same = prev.release?.version === release.version;
  const path = Native.updateReady(release.version);
  if (path) {
    set({ release, phase: "ready", path, error: null });
    return prompt();
  }
  if (same && (prev.phase === "downloading" || prev.phase === "verifying")) return;
  set({ release, phase: "available", path: null, error: null, received: 0, total: release.size });
  if ((manual || autoDownloadOn()) && !Native.networkMetered()) downloadUpdate();
  else prompt();
}

// ---------- downloading and installing ----------

export function downloadUpdate() {
  const r = useUpdate.getState().release;
  if (!r) return;
  set({ phase: "downloading", received: 0, total: r.size, error: null });
  Native.downloadUpdate(r.url, r.version, r.sha256, r.size);
}

let waitingForPermission = false;

export async function installUpdate() {
  const { release, path } = useUpdate.getState();
  if (!release || !path) return;
  if (!Native.canInstallUpdates()) return set({ needsPermission: true });
  set({ phase: "installing", needsPermission: false, error: null });
  const result = await Native.installUpdate(path, release.version);
  if (result === "permission") set({ phase: "ready", needsPermission: true });
  else if (result === "missing") downloadUpdate();
}

/** Opens Android's "Install unknown apps" switch; coming back with it on carries on installing. */
export function allowInstalls() {
  waitingForPermission = true;
  Native.openInstallPermission();
}

/** The button under an error: whichever step didn't work, again. */
export function retryUpdate() {
  const { release, path } = useUpdate.getState();
  if (release && path) installUpdate();
  else if (release) downloadUpdate();
  else checkForUpdate({ manual: true });
}

Native.addListener("onUpdate", (e: UpdateEvent) => {
  const s = useUpdate.getState();
  if (e.version && s.release && e.version !== s.release.version) return;
  switch (e.state) {
    case "downloading":
      return set({ phase: "downloading", received: e.received ?? 0, total: e.total || s.total });
    case "verifying":
      return set({ phase: "verifying" });
    case "ready":
      set({ phase: "ready", path: e.path ?? s.path, error: null });
      // Back from Android's prompt with Cancel: leave it be.
      return e.cancelled ? undefined : prompt();
    case "installing":
    case "confirming":
      return set({ phase: "installing" });
    case "failed":
      return set({ phase: "failed", error: e.message ?? "Something went wrong.", path: e.path ?? null });
    case "idle":
      if (s.phase === "downloading" || s.phase === "verifying") set({ phase: s.release ? "available" : "idle" });
      return;
  }
});

// ---------- asking ----------

let showPrompt: (() => void) | null = null;

/** Offers the update in a sheet, at most once a day for each version. */
function prompt() {
  const { release, phase } = useUpdate.getState();
  if (!release || !showPrompt || AppState.currentState !== "active") return;
  if (phase !== "ready" && phase !== "available") return;
  const snoozed = kv.get<{ version: string; until: number } | null>("update.snoozed", null);
  if (snoozed?.version === release.version && Date.now() < snoozed.until) return;
  kv.set("update.snoozed", { version: release.version, until: Date.now() + 24 * HOUR });
  showPrompt();
}

let started = false;

/** Call once, at the root. `ask` shows the update sheet. */
export function startUpdater(ask: () => void) {
  showPrompt = ask;
  if (started) return;
  started = true;
  const updated = Platform.OS === "android" ? Native.takeUpdated() : null;
  if (updated) setTimeout(() => toast(`You're on Harmoni ${updated}.`), 1200);
  if (!updatesHere()) return;

  // What the last check found, so a restart doesn't need the network to know.
  const known = kv.get<Cached | null>("update.latest", null)?.release;
  if (known && isNewer(known.version, currentVersion)) found(known, false);
  else if (useUpdate.getState().checkedAt) set({ phase: "current" });

  // Development builds only look when asked (Settings), unless EXPO_PUBLIC_UPDATE_CHECKS=1.
  const auto = !__DEV__ || process.env.EXPO_PUBLIC_UPDATE_CHECKS === "1";
  const due = () => {
    if (auto && Date.now() - useUpdate.getState().checkedAt > HOUR) checkForUpdate();
    else prompt();
  };
  due();
  AppState.addEventListener("change", (st) => {
    if (st !== "active") return;
    if (waitingForPermission && Native.canInstallUpdates()) {
      waitingForPermission = false;
      if (useUpdate.getState().needsPermission) installUpdate();
      return;
    }
    due();
  });
}
