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
};

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

  setLikedIds(json: string): void;
  setLiked(id: string, liked: boolean): void;

  download(json: string): Promise<void>;
  removeDownload(id: string): Promise<void>;
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
