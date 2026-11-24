import type { ImportLibrary } from "@/lib/import-library";

import { api } from "./client";
import type {
  Album,
  AppleLibrary,
  Artist,
  Home,
  ImportProgress,
  Invite,
  Lyrics,
  Me,
  Playlist,
  PlaylistSummary,
  Profile,
  SharedPlaylist,
  Song,
  Spice,
  SpiceCard,
  UserCard,
  Visibility,
} from "./types";

const enc = encodeURIComponent;

export const Api = {
  me: () => api<Me>("/api/me"),
  updateMe: (patch: Partial<Pick<Me, "name" | "superProcessing" | "autoplay">>) => api<Me>("/api/me", { method: "PATCH", body: patch }),
  forgetListening: () => api<void>("/api/me/listening", { method: "DELETE" }),

  home: () => api<Home>("/api/home", { timeoutMs: 60_000 }),

  song: (id: string) => api<Song>(`/api/songs/${id}`),
  album: (id: string) => api<Album>(`/api/albums/${enc(id)}`, { timeoutMs: 60_000 }),
  artist: (id: string) => api<Artist>(`/api/artists/${enc(id)}`, { timeoutMs: 60_000 }),
  lyrics: (id: string) => api<Lyrics>(`/api/lyrics/${id}`, { timeoutMs: 60_000 }),

  recordPlay: (songId: string) => api<void>("/api/plays", { method: "POST", body: { songId } }),
  recent: (limit = 50) => api<Song[]>(`/api/plays?limit=${limit}`),
  listen: (body: {
    songId: string;
    playedMs: number;
    positionMs: number;
    durationMs?: number;
    reason: "ended" | "skip" | "back" | "close" | "error";
    heard?: number;
    replays?: number;
    context?: "autoplay";
  }) => api<void>("/api/listens", { method: "POST", body }),

  likes: () => api<Song[]>("/api/likes"),
  likedIds: () => api<string[]>("/api/likes?ids=1"),
  like: (songId: string) => api<{ songId: string; liked: true }>(`/api/likes/${songId}`, { method: "PUT" }),
  unlike: (songId: string) => api<{ songId: string; liked: false }>(`/api/likes/${songId}`, { method: "DELETE" }),

  playlists: () => api<PlaylistSummary[]>("/api/playlists"),
  createPlaylist: (name: string, description?: string) =>
    api<{ id: string; name: string }>("/api/playlists", { method: "POST", body: { name, description } }),
  sharedPlaylists: () => api<SharedPlaylist[]>("/api/playlists/shared"),
  playlist: (id: string, key?: string | null) => api<Playlist>(`/api/playlists/${enc(id)}${key ? `?key=${enc(key)}` : ""}`),
  updatePlaylist: (id: string, patch: { name?: string; description?: string | null; visibility?: Visibility; resetLink?: boolean }) =>
    api<{ id: string; name: string; description: string | null; visibility?: Visibility; shareUrl?: string }>(`/api/playlists/${enc(id)}`, {
      method: "PATCH",
      body: patch,
    }),
  sharePlaylist: (id: string, usernames: string[]) =>
    api<UserCard[]>(`/api/playlists/${enc(id)}/shares`, { method: "PUT", body: { usernames } }),
  deletePlaylist: (id: string) => api<void>(`/api/playlists/${enc(id)}`, { method: "DELETE" }),
  addToPlaylist: (id: string, songId: string) =>
    api<{ itemId: string }>(`/api/playlists/${enc(id)}/items`, { method: "POST", body: { songId } }),
  removeFromPlaylist: (id: string, itemId: string) => api<void>(`/api/playlists/${enc(id)}/items/${enc(itemId)}`, { method: "DELETE" }),

  /** Your custom Spices, without the Daily Spice (the library shows that on its own). */
  spices: () => api<SpiceCard[]>("/api/spices?daily=false"),
  /** With the Daily Spice first (and its covers), for Home's hero. */
  spicesWithDaily: () => api<SpiceCard[]>("/api/spices"),
  createSpice: (seedIds: string[], name?: string) =>
    api<SpiceCard>("/api/spices", { method: "POST", body: { seedIds, name }, timeoutMs: 60_000 }),
  spiceSuggestions: () => api<Song[]>("/api/spices/suggestions"),
  /** `tz` keeps the Daily Spice's parts of the day in this phone's time zone. */
  spice: (id: string, tz?: string) => api<Spice>(`/api/spices/${enc(id)}${tz ? `?tz=${enc(tz)}` : ""}`, { timeoutMs: 60_000 }),
  renameSpice: (id: string, name: string | null) => api<void>(`/api/spices/${enc(id)}`, { method: "PATCH", body: { name } }),
  deleteSpice: (id: string) => api<void>(`/api/spices/${enc(id)}`, { method: "DELETE" }),
  addSeed: (id: string, songId: string) => api<void>(`/api/spices/${enc(id)}/seeds`, { method: "POST", body: { songId } }),
  setSeeds: (id: string, songIds: string[]) => api<void>(`/api/spices/${enc(id)}/seeds`, { method: "PUT", body: { songIds } }),
  removeSeed: (id: string, songId: string) => api<void>(`/api/spices/${enc(id)}/seeds/${songId}`, { method: "DELETE" }),
  snapshotSpice: (id: string) => api<{ id: string; name: string }>(`/api/spices/${enc(id)}/snapshot`, { method: "POST" }),

  autoplay: (seeds: string[], exclude: string[]) =>
    api<Song[]>("/api/autoplay", { method: "POST", body: { seeds, exclude }, timeoutMs: 30_000 }),

  startImport: (library: AppleLibrary | ImportLibrary) => api<ImportProgress>("/api/import", { method: "POST", body: library, timeoutMs: 120_000 }),
  importProgress: () => api<ImportProgress | null>("/api/import"),
  stopImport: () => api<ImportProgress | null>("/api/import", { method: "DELETE" }),

  users: (q: string) => api<UserCard[]>(`/api/users?q=${enc(q)}`),
  profile: (username: string) => api<Profile>(`/api/users/${enc(username)}`),
  userLikes: (username: string) => api<Song[]>(`/api/users/${enc(username)}/likes`),
  followers: (username: string) => api<UserCard[]>(`/api/users/${enc(username)}/followers`),
  following: (username: string) => api<UserCard[]>(`/api/users/${enc(username)}/following`),
  follow: (username: string, on: boolean) => api<UserCard>(`/api/users/${enc(username)}/follow`, { method: on ? "PUT" : "DELETE" }),
  myProfile: () => api<Profile>("/api/me/profile"),
  updateProfile: (patch: {
    name?: string;
    bio?: string | null;
    accent?: string | null;
    font?: string | null;
    banner?: string | null;
    pinnedSongs?: string[];
    showLikes?: boolean;
    showPlaylists?: boolean;
  }) => api<Profile>("/api/me/profile", { method: "PATCH", body: patch }),
  removePicture: (kind: "avatar" | "banner") => api<void>(`/api/me/profile/${kind}`, { method: "DELETE" }),
  pin: (songId: string, on: boolean) => api<{ pinned: string[] }>(`/api/me/profile/pins/${songId}`, { method: on ? "PUT" : "DELETE" }),

  invites: () => api<Invite[]>("/api/invites"),
  createInvite: () => api<{ code: string; expiresAt: string | null }>("/api/invites", { method: "POST" }),
  deleteInvite: (code: string) => api<{ deleted: boolean }>(`/api/invites?code=${enc(code)}`, { method: "DELETE" }),
};
