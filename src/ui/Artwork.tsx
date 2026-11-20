import { Image } from "expo-image";
import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { sized } from "@/lib/art";
import { Icon, type IconName } from "./Icon";
import { colors, radius as r } from "./theme";

export { sized };

export const Artwork = memo(function Artwork({
  url,
  size,
  radius = r.sm,
  round,
  style,
  fallback = "music",
  px,
  priority,
  source,
}: {
  url?: string;
  size?: number;
  radius?: number;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
  fallback?: IconName;
  px?: number;
  priority?: "low" | "normal" | "high";
  /** Overrides `url`, e.g. an authenticated proxy image; `url` is the fallback while it loads or if it fails. */
  source?: { uri: string; headers?: Record<string, string> };
}) {
  const br = round ? 9999 : radius;
  const dim = size != null ? { width: size, height: size } : { width: "100%" as const, aspectRatio: 1 };
  return (
    <View style={[dim, { borderRadius: br, backgroundColor: colors.surface2, overflow: "hidden" }, style]}>
      {url || source ? (
        <Image
          source={source ? [source] : { uri: sized(url, px ?? (size ? Math.round(size * 3) : 544)) }}
          placeholder={source && url ? { uri: sized(url, 200) } : undefined}
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
