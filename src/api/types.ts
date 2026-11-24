// Shapes from the Harmoni API reference (docs/api/reference.md on any server).

export interface Source {
  uri: string;
  provider: string;
  playable: boolean;
  confidence: number;
  matchedBy: "origin" | "isrc" | "fuzzy" | "manual";
  rawTitle: string;
}

export interface SongArtist {
  id?: string;
  name: string;
  role: "primary" | "featured";
}

export interface Song {
  id: string;
  title: string;
  artists: SongArtist[];
  album?: { id?: string; title: string };
  durationMs?: number;
  isrc?: string;
  explicit: boolean;
  artworkUrl?: string;
  sources: Source[];
}

export type QueueSong = Song & { autoplay?: true };

export interface AlbumCard {
  id: string;
  title: string;
  artworkUrl?: string;
  releaseDate?: string;
  kind?: "album" | "ep" | "single" | "compilation";
  trackCount?: number;
}

export interface ArtistCard {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface Album extends AlbumCard {
  artists: ArtistCard[];
  label?: string;
  genres: string[];
  songs: Song[];
}

export interface Artist extends ArtistCard {
  bannerUrl?: string;
  bio?: string;
  fans?: number;
  popular: Song[];
  latest?: AlbumCard;
  albums: AlbumCard[];
  singles: AlbumCard[];
  compilations: AlbumCard[];
  related: ArtistCard[];
  yours: Song[];
}

export interface PlaylistSummary {
  id: string;
  name: string;
  description?: string;
  count: number;
  artworks: string[];
  updatedAt: string;
}

export interface PlaylistItem {
  itemId: string;
  addedAt: string;
  song: Song;
}

export type Visibility = "private" | "link" | "users" | "public";

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
  items: PlaylistItem[];
  /** Who made it (missing on older servers). */
  owner?: UserCard;
  /** false: someone else's, shared with you (open and play only). Missing on older servers: yours. */
  owned?: boolean;
  visibility?: Visibility;
  /** Owner only, while visibility is "link": the path to send, with its key. */
  shareUrl?: string;
  /** Owner only: who it's shared with. */
  sharedWith?: UserCard[];
}

export type SharedPlaylist = PlaylistSummary & { owner: UserCard };

export interface SpiceCard {
  id: string;
  name: string;
  kind: "search" | "custom";
  /** Daily Spice only: the part of the day ("Morning") and when it changes next. */
  daily?: { part: string; endsAt: string };
  covers: string[];
  seedCount?: number;
  autoNamed?: boolean;
  updatedAt: string;
}

export interface Spice extends SpiceCard {
  owned: boolean;
  songs: Song[];
  seeds: Song[];
  generatedAt?: string;
  /** When opening it next makes a new mix. */
  expiresAt?: string;
  daily?: {
    part: string;
    endsAt: string;
    /** The search Spice mixed in right now. */
    source?: { id: string; name: string };
    /** Super Processing is off, so it's empty. */
    needsSuperProcessing?: boolean;
  };
}

export interface LyricWord {
  startMs: number;
  endMs?: number;
  text: string;
}

export interface LyricLine {
  startMs?: number;
  endMs?: number;
  text: string;
  words?: LyricWord[];
  romanized?: string;
}

export interface Lyrics {
  songId: string;
  found: boolean;
  provider?: string;
  sync?: "word" | "line" | "none";
  language?: "ja" | "ko" | "zh";
  instrumental?: boolean;
  lines?: LyricLine[];
}

export type Shelf =
  | { kind: "mix" | "repeat" | "rediscover"; songs: Song[] }
  | { kind: "because"; seed: Song; songs: Song[] }
  | { kind: "artists" | "top-artists"; artists: ArtistCard[] };

export interface Home {
  recent: Song[];
  liked: Song[];
  playlists: PlaylistSummary[];
  shelves?: Shelf[];
}

export interface Me {
  id: string;
  username: string;
  name: string;
  role: "admin" | "user";
  superProcessing: boolean;
  autoplay: boolean;
  app?: { id: string; name: string };
  /** Their profile picture (a public path on the server). */
  avatarUrl?: string;
  /** Their profile colour, "#a59bff". */
  accent?: string;
  /** Song ids on display on their profile, in order. */
  pinned?: string[];
  server: {
    name: string;
    features: { superProcessing: boolean; autoplay: boolean; link: boolean; lyrics: boolean };
    canInvite: boolean;
    inviteDays: number;
  };
}

// --- People and profiles ---

export interface UserCard {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string;
  accent: string;
  /** Missing when it's you. */
  youFollow?: boolean;
  followsYou?: boolean;
}

export type ProfileFont = "default" | "serif" | "elegant" | "grotesk" | "display" | "rounded" | "mono" | "condensed" | "script" | "pixel";
export type ProfileBanner = "glow" | "aurora" | "sunset" | "tide" | "stripes" | "dots" | "grid" | "plain" | "artists" | "image";

/** One of someone's favourite artists, for the "artists" banner. */
export interface BannerArtist {
  id: string;
  name: string;
  imageUrl: string;
}

export interface Profile {
  user: UserCard;
  isMe: boolean;
  bio?: string;
  accent: string;
  font: ProfileFont;
  banner: ProfileBanner;
  bannerUrl?: string;
  /** When banner is "artists" (always on your own): up to 12, favourite first. */
  topArtists?: BannerArtist[];
  followers: number;
  following: number;
  pinned: Song[];
  likes?: { count: number; songs: Song[] };
  playlists?: PlaylistSummary[];
  showLikes: boolean;
  showPlaylists: boolean;
  joinedAt: string;
}

export interface ServerSetup {
  needsAdmin: boolean;
  name: string;
  welcome: string;
  signups: "open" | "invite" | "closed";
}

export interface ProviderStatus {
  prefix: string;
  name: string;
  ok?: boolean;
  error?: string;
  count?: number;
  ms?: number;
}

export interface Invite {
  code: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  usedBy: string | null;
  createdBy: string | null;
}

export interface ImportProgress {
  id: string;
  /** Missing on imports from before Spotify: Apple. */
  source?: "apple" | "spotify";
  status: "adding" | "improving" | "done" | "failed" | "cancelled";
  total: number;
  done: number;
  known: number;
  toImprove: number;
  improved: number;
  found: number;
  summary?: {
    liked: number;
    playlists: { name: string; songs: number }[];
    listening: number;
    /** Spotify: plays brought in, one by one, from their history. */
    listens?: number;
    appliedAt: string;
    missing?: { title: string; artist: string }[];
  };
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

export interface AppleLibrary {
  tracks: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    durationMs?: number;
    explicit: boolean;
    inLibrary: boolean;
    loved: boolean;
    addedAt?: string;
    plays: number;
    playedAt?: string;
    skips: number;
    skippedAt?: string;
  }[];
  playlists: { id: string; name: string; description?: string; trackIds: string[] }[];
}

// --- Harmoni Link ---

export type DeviceKind = "phone" | "tablet" | "computer";

export interface LinkDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  until: number;
}

export type RepeatMode = "off" | "all" | "one";

export interface LinkState {
  queue: QueueSong[];
  unshuffled?: QueueSong[] | null;
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  playing: boolean;
  buffering: boolean;
  error?: string | null;
  volume: number;
  muted: boolean;
  positionMs: number;
  durationMs?: number | null;
  at: number;
  rev?: number;
}

export type LinkCommand =
  | { type: "play"; songs: Song[]; startIndex: number; shuffle?: boolean }
  | { type: "playNext"; song: Song }
  | { type: "addToQueue"; song: Song }
  | { type: "removeFromQueue"; index: number; songId: string }
  | { type: "jumpTo"; index: number; songId: string }
  | { type: "moveInQueue"; from: number; to: number; songId: string }
  | { type: "toggle" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "cycleRepeat" }
  | { type: "seek"; seconds: number }
  | { type: "setShuffle"; on: boolean }
  | { type: "setVolume"; volume: number }
  | { type: "setMuted"; muted: boolean };

export type LinkEvent =
  | { type: "hello"; self: string; now: number; devices: LinkDevice[]; active: string | null; state: LinkState | null }
  | { type: "devices"; now: number; devices: LinkDevice[]; active: string | null }
  | { type: "ping"; now: number; devices: LinkDevice[]; active: string | null; rev?: number }
  | { type: "state"; from: string; state: Partial<LinkState> }
  | { type: "command"; command: LinkCommand }
  | { type: "transfer"; state: LinkState | null; play: boolean }
  | { type: "release" };
