import { NativeModule, requireNativeModule } from "expo";

export type RepeatMode = "off" | "all" | "one";

export interface NativePlayerState {
  index: number;
  count: number;
  songId: string | null;
  playing: boolean;
  playWhenReady: boolean;
  buffering: boolean;
  ended: boolean;
  idle: boolean;
  positionMs: number;
  durationMs: number | null;
  repeat: RepeatMode;
  volume: number;
}

export interface TickEvent {
  now: number;
  positionMs?: number;
  bufferedMs?: number;
  durationMs?: number | null;
  playing?: boolean;
  index?: number;
  downloads?: { id: string; percent: number; state: string }[];
}

export interface ListenEvent {
  songId: string;
  song: string | null; // the queue entry, as JSON
  playedMs: number;
  positionMs: number;
  durationMs: number | null;
  reason: "ended" | "skip" | "back" | "close" | "error";
  heard: number;
  replays: number;
}

export interface DownloadEvent {
  id: string;
  state: "queued" | "downloading" | "done" | "failed" | "removing" | "stopped" | "removed";
  percent?: number;
  bytes?: number;
  updatedAt?: number;
  song?: string | null;
}

export interface ArtworkColors {
  color: string;
  deep: string;
  light: boolean;
  dominant: string | null;
  vibrant: string | null;
  darkVibrant: string | null;
  lightVibrant: string | null;
  muted: string | null;
  darkMuted: string | null;
  lightMuted: string | null;
}

type Events = {
  onState: (s: NativePlayerState) => void;
  onTick: (t: TickEvent) => void;
  onTransition: (e: { index: number; reason: "auto" | "repeat" | "seek" | "queue"; songId: string | null }) => void;
  onTimeline: (e: { count: number }) => void;
  onListen: (e: ListenEvent) => void;
  onPlayed: (e: { songId: string; song: string | null }) => void;
  onError: (e: { message: string; songId: string | null }) => void;
  onRemoteLike: (e: { songId: string; liked: boolean }) => void;
  onDownload: (e: DownloadEvent) => void;
  onSignedOut: (e: Record<string, never>) => void;
  onRemoteCommand: (e: {
    type: "toggle" | "next" | "prev" | "seek" | "jumpTo" | "repeat" | "shuffle" | "volume" | "mute";
    positionMs?: number;
    index?: number;
    mode?: "off" | "all" | "one";
    on?: boolean;
    volume?: number;
    muted?: boolean;
  }) => void;
  onSystemTransfer: (e: { to: string | null }) => void;
  onUpdate: (e: UpdateEvent) => void;
};

/** Where downloading or installing an app update has got to (see Updater.kt). */
export interface UpdateEvent {
  state: "idle" | "downloading" | "verifying" | "ready" | "installing" | "confirming" | "installed" | "failed";
  version?: string;
  path?: string;
  received?: number;
  total?: number;
  message?: string;
  detail?: string | null;
  /** Ready again because they cancelled Android's install prompt. */
  cancelled?: boolean;
}

declare class HarmoniPlayerModule extends NativeModule<Events> {
  getSession(): { server: string; issuer: string; apiBase: string; clientId: string } | null;
  setSession(json: string): Promise<void>;
  getAccessToken(): Promise<string | null>;
  refreshAccessToken(failed: string | null): Promise<string | null>;
  signOut(): Promise<void>;

  getState(): NativePlayerState | Record<string, never>;
  getQueue(): Promise<{ queue: string; index: number; positionMs: number; live: boolean } | null>;
  setQueue(json: string, index: number, positionMs: number, play: boolean): Promise<void>;
  replaceAround(json: string, index: number): Promise<void>;
  insert(index: number, json: string): Promise<void>;
  removeAt(index: number): Promise<void>;
  removeRange(from: number, to: number): Promise<void>;
  move(from: number, to: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(ms: number): Promise<void>;
  skipTo(index: number, positionMs: number): Promise<void>;
  next(): Promise<void>;
  prev(restartAfterMs: number): Promise<void>;
  setRepeat(mode: RepeatMode): Promise<void>;
  setVolume(volume: number): Promise<void>;
  stop(): Promise<void>;
  retry(): Promise<void>;
  pauseAtEndOfSong(on: boolean): Promise<void>;
  setSmooth(on: boolean): void;
  setCrossfade(seconds: number): void;
  /** 0..1: how hard the bass is hitting in what is coming out of the speaker now (0 when paused). */
  bass(): number;
  /** The next `n` frames of bass (1/60 s apart) from now; -1 past what's decoded yet. */
  bassWindow(n: number): number[];
  /** Whether Android opens this server's web links in the app (always true before Android 12). */
  linksEnabled(): boolean;
  /** Opens the app's "Open by default" settings, where links can be turned on. */
  openLinkSettings(): boolean;
  /** The latest update event (to catch up after a screen opens mid-download). */
  updateState(): UpdateEvent;
  /** The checked APK for `version`, if it has been downloaded. */
  updateReady(version: string): string | null;
  /** Downloads in the background (resuming), checks the SHA-256, then sends `ready`. Once per version at a time. */
  downloadUpdate(url: string, version: string, sha256: string | null, size: number): void;
  cancelUpdate(): void;
  /** Whether Android lets Harmoni install apps ("Install unknown apps"). */
  canInstallUpdates(): boolean;
  /** Opens the "Install unknown apps" switch for Harmoni. */
  openInstallPermission(): boolean;
  /** Hands the APK to Android's installer, which closes and replaces the app. */
  installUpdate(path: string, version: string): Promise<"started" | "permission" | "missing" | "failed">;
  /** The version this app just updated itself to, once; null otherwise. */
  takeUpdated(): string | null;
  /** Whether the connection costs money (mobile data, a hotspot). */
  networkMetered(): boolean;
  /** The package that installed Harmoni (a store, Obtainium, the package installer), if Android says. */
  installer(): string | null;
  setRemote(json: string | null): Promise<void>;
  setLinkDevices(json: string, active: string | null, volume: number): void;

  setLikedIds(json: string): void;
  setLiked(id: string, liked: boolean): void;

  download(json: string): Promise<void>;
  removeDownload(id: string): Promise<void>;
  removeDownloads(json: string): Promise<void>;
  removeAllDownloads(): Promise<void>;
  getDownloads(): Promise<string>;
  getDownloadSize(): Promise<number>;

  getArtworkColors(url: string): Promise<ArtworkColors | null>;

  hasEqualizer(): boolean;
  openEqualizer(): Promise<boolean>;

  canPinWidget(): boolean;
  hasWidget(): boolean;
  pinWidget(): Promise<boolean>;
}

export default requireNativeModule<HarmoniPlayerModule>("HarmoniPlayer");
