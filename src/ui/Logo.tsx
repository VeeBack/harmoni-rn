import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

/** Harmoni's app icon: three rounded bars in warm cream on near-black. */
export function Logo({ size = 48, bare }: { size?: number; bare?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient id="ink" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#fbf1e1" />
          <Stop offset="1" stopColor="#e9b99a" />
        </LinearGradient>
        <RadialGradient id="glow" cx="0.3" cy="0.2" r="1">
          <Stop offset="0" stopColor="#2a2522" />
          <Stop offset="1" stopColor="#121212" />
        </RadialGradient>
      </Defs>
      {bare ? null : <Rect width="512" height="512" rx="116" fill="url(#glow)" />}
      <Rect x="146" y="196" width="44" height="120" rx="22" fill="url(#ink)" />
      <Rect x="234" y="136" width="44" height="240" rx="22" fill="url(#ink)" />
      <Rect x="322" y="176" width="44" height="160" rx="22" fill="url(#ink)" />
    </Svg>
  );
}
