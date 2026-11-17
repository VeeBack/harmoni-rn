import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/** Fades content out at the top and bottom edges (like CSS mask-image). Stops are [position, opacity]. */
export function FadeMask({ children, stops }: { children: ReactNode; stops: [number, number][] }) {
  return (
    <MaskedView
      style={{ flex: 1 }}
      maskElement={
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient colors={stops.map(([, a]) => `rgba(0,0,0,${a})`) as [string, string, ...string[]]} locations={stops.map(([p]) => p) as [number, number, ...number[]]} style={StyleSheet.absoluteFill} />
        </View>
      }
    >
      {children}
    </MaskedView>
  );
}
