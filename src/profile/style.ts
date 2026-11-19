// How a profile can look, as the web app's profile-style.ts: the presets to
// pick from, and helpers to draw them. Pure, for bun test.
import type { ProfileBanner, ProfileFont } from "@/api/types";

export const ACCENTS = [
  "#efe6d6", // Harmoni cream
  "#ff8a7a", // coral
  "#ffb86b", // tangerine
  "#ffe27a", // lemon
  "#9be38f", // mint
  "#6fd6c8", // teal
  "#7ab8ff", // sky
  "#a59bff", // periwinkle
  "#e2a3ff", // lilac
  "#ff8fc7", // bubblegum
] as const;

export const DEFAULT_ACCENT = ACCENTS[0];

/** Each font is embedded in the app (app.json, expo-font) under this family name. */
export const FONTS: { key: ProfileFont; label: string; family?: string; scale?: number }[] = [
  { key: "default", label: "Harmoni" },
  { key: "serif", label: "Fraunces", family: "Fraunces_700Bold" },
  { key: "elegant", label: "Playfair", family: "PlayfairDisplay_700Bold" },
  { key: "grotesk", label: "Space Grotesk", family: "SpaceGrotesk_700Bold" },
  { key: "display", label: "Bricolage", family: "BricolageGrotesque_700Bold" },
  { key: "rounded", label: "Nunito", family: "Nunito_800ExtraBold" },
  { key: "mono", label: "Mono", family: "JetBrainsMono_700Bold", scale: 0.9 },
  { key: "condensed", label: "Bebas", family: "BebasNeue_400Regular", scale: 1.15 },
  { key: "script", label: "Caveat", family: "Caveat_700Bold", scale: 1.2 },
  { key: "pixel", label: "Pixel", family: "Silkscreen_400Regular", scale: 0.8 },
];

export const fontFor = (key: string | undefined) => FONTS.find((f) => f.key === key) ?? FONTS[0];

export const BANNERS: { key: Exclude<ProfileBanner, "image">; label: string }[] = [
  { key: "glow", label: "Glow" },
  { key: "aurora", label: "Aurora" },
  { key: "sunset", label: "Sunset" },
  { key: "tide", label: "Tide" },
  { key: "stripes", label: "Stripes" },
  { key: "dots", label: "Dots" },
  { key: "grid", label: "Grid" },
  { key: "plain", label: "Plain" },
];

export const BIO_MAX = 300;
export const PINNED_MAX = 10;

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** The colour turned round the colour wheel by `degrees`, for a second tone. */
export function shift(hex: string, degrees: number): string {
  const [h, s, l] = toHsl(hex);
  return fromHsl((h + degrees + 360) % 360, s, l);
}

/** "#rrggbb" with an alpha byte, as CSS's `${a}cc`. */
export const alpha = (hex: string, a: number) =>
  `${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, "0")}`;

export function toHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)]
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Dark text on light accents, light on dark ones. */
export function inkFor(hex: string): string {
  const [, , l] = toHsl(hex);
  return l > 0.6 ? "#1b1813" : "#f4f3f1";
}
