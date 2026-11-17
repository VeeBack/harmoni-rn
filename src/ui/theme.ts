// Harmoni's design tokens (src/app/globals.css in the web app): warm near-black,
// soft radii, Outfit, few colours. The artwork brings the colour.

export const colors = {
  bg: "#121212",
  surface: "#1b1b1b",
  surface2: "#242424",
  surface3: "#2e2e2e",
  border: "#2a2a2a",
  borderStrong: "#3a3a3a",
  text: "#f4f3f1",
  text2: "#b8b6b1",
  text3: "#8e8c87",
  accent: "#efe6d6",
  accentInk: "#1b1813",
  danger: "#ff8a7a",
  scrim: "rgba(0,0,0,0.6)",
} as const;

export const radius = { xl: 24, lg: 16, md: 12, sm: 8, pill: 999 } as const;

export const type = {
  m1: 13, // metadata
  b0: 15, // body
  s1: 18,
  s2: 24, // section titles
  s3: 32, // page titles
  s4: 48, // heroes
} as const;

export const space = { gutter: 16, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const fonts = {
  400: "Outfit_400Regular",
  500: "Outfit_500Medium",
  600: "Outfit_600SemiBold",
  700: "Outfit_700Bold",
  800: "Outfit_800ExtraBold",
} as const;

export type Weight = keyof typeof fonts;

export const motion = {
  fast: 140,
  medium: 240,
  // cubic-bezier(0.2, 0.7, 0.2, 1)
  ease: [0.2, 0.7, 0.2, 1] as const,
};

export const layout = {
  tabBar: 60,
  miniPlayer: 64,
};
