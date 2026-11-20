import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

import { Artwork } from "@/ui/Artwork";
import { Icon } from "@/ui/Icon";
import { colors } from "@/ui/theme";

/** Liked Songs' cover: a heart on a soft gradient. */
export function LikedArt({ size = 72 }: { size?: number }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["#f2d5c4", "#c9a7d8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}
      >
        <Icon name="heart-solid" size={size} color="#2b1d2e" />
      </LinearGradient>
    </View>
  );
}

/** Recently Played's cover: the clock on a dark slate. */
export function RecentArt({ size = 72 }: { size?: number }) {
  return (
    <LinearGradient
      colors={["#3d3c40", "#26262a"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}
    >
      <Icon name="history" size={size} color={colors.text} />
    </LinearGradient>
  );
}

/** A playlist's cover from its first four different covers. */
export function Collage({ urls, px = 400 }: { urls: string[]; px?: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { flexDirection: "row", flexWrap: "wrap" }]}>
      {urls.slice(0, 4).map((u, i) => (
        <View key={i} style={{ width: "50%", height: "50%" }}>
          <Artwork url={u} radius={0} px={px} />
        </View>
      ))}
    </View>
  );
}

/** Downloads' cover: the download mark on a quiet fill. */
export function DownloadsArt({ size = 72 }: { size?: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" }]}>
      <Icon name="download-solid" size={size} color={colors.accent} />
    </View>
  );
}
