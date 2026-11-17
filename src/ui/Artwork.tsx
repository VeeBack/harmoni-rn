import { Image } from "expo-image";
import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Icon, type IconName } from "./Icon";
import { colors, radius as r } from "./theme";

/** Bigger artwork for YouTube Music URLs, which carry their size in the URL. */
export function sized(url: string | undefined, px: number): string | undefined {
  if (!url) return url;
  const m = url.match(/=w(\d+)-h(\d+)/);
  if (m && Number(m[1]) < px) return url.replace(/=w\d+-h\d+/, `=w${px}-h${px}`);
  return url;
}

export const Artwork = memo(function Artwork({
  url,
  size,
  radius = r.sm,
  round,
  style,
  fallback = "music",
  px,
  priority,
}: {
  url?: string;
  size?: number;
  radius?: number;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
  fallback?: IconName;
  px?: number;
  priority?: "low" | "normal" | "high";
}) {
  const br = round ? 9999 : radius;
  const dim = size != null ? { width: size, height: size } : { width: "100%" as const, aspectRatio: 1 };
  return (
    <View style={[dim, { borderRadius: br, backgroundColor: colors.surface2, overflow: "hidden" }, style]}>
      {url ? (
        <Image
          source={{ uri: sized(url, px ?? (size ? Math.round(size * 3) : 544)) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={160}
          cachePolicy="memory-disk"
          recyclingKey={url}
          priority={priority}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <Icon name={fallback} size={size ? Math.max(16, size * 0.38) : 40} color={colors.text3} />
        </View>
      )}
    </View>
  );
});
