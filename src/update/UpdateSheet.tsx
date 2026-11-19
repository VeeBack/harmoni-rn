import { Image } from "expo-image";
import Native from "harmoni-player";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { bytes, shortDate } from "@/lib/format";
import { Button } from "@/ui/Button";
import { closeSheet, openSheet } from "@/ui/overlays";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";
import { allowInstalls, downloadUpdate, installUpdate, retryUpdate, useUpdate } from "./updater";

const ICON = require("../../assets/images/icon.png");
const NOTES_SHOWN = 6;

export function openUpdateSheet() {
  openSheet({ title: "Software Update", render: () => <UpdateSheet /> });
}

/** "Today", "Yesterday", or the date. */
export function releasedOn(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : shortDate(iso);
}

/** A thin bar that eases to each new value. */
export function ProgressBar({ value, style }: { value: number; style?: object }) {
  const v = useSharedValue(value);
  useEffect(() => {
    v.value = withTiming(Math.max(0, Math.min(1, value)), { duration: 260 });
  }, [v, value]);
  const fill = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));
  return (
    <View style={[styles.track, style]}>
      <Animated.View style={[styles.fill, fill]} />
    </View>
  );
}

/** The version, what's new, and one button for whatever comes next. */
function UpdateSheet() {
  const s = useUpdate();
  const r = s.release;
  if (!r) {
    return (
      <Text variant="body" color={colors.text2} style={{ paddingVertical: 12 }}>
        Harmoni is up to date.
      </Text>
    );
  }
  const notes = r.notes.slice(0, NOTES_SHOWN);
  const more = r.notes.length - notes.length;
  const working = s.phase === "downloading" || s.phase === "verifying";

  return (
    <View style={{ paddingTop: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Image source={ICON} style={styles.icon} contentFit="cover" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title3" weight={600}>
            Harmoni {r.version}
          </Text>
          <Text variant="subhead" color={colors.text2}>
            {[r.size ? bytes(r.size) : null, releasedOn(r.publishedAt)].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>

      {notes.length ? (
        <View style={{ marginTop: 22, gap: 10 }}>
          <Text variant="footnote" weight={600} color={colors.text3} style={{ letterSpacing: 0.4 }}>
            WHAT&apos;S NEW
          </Text>
          {notes.map((n, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 12 }}>
              <View style={styles.dot} />
              <Text variant="subhead" color={colors.text} style={{ flex: 1 }}>
                {n}
              </Text>
            </View>
          ))}
          {more > 0 ? (
            <Text variant="footnote" color={colors.text3} style={{ marginLeft: 17 }}>
              And {more} more {more === 1 ? "change" : "changes"}.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ marginTop: 26, gap: 10 }}>
        {working ? (
          <View style={{ gap: 10, paddingVertical: 4 }}>
            <ProgressBar value={s.total ? s.received / s.total : 0} />
            <Text variant="footnote" color={colors.text2} align="center">
              {s.phase === "verifying" ? "Checking the download…" : `Downloading… ${bytes(s.received)} of ${bytes(s.total || r.size)}`}
            </Text>
          </View>
        ) : s.phase === "failed" ? (
          <>
            <Text variant="footnote" color={colors.danger} align="center">
              {s.error}
            </Text>
            <Button label="Try again" size="lg" onPress={retryUpdate} />
          </>
        ) : s.needsPermission ? (
          <>
            <View style={styles.card}>
              <Text variant="subhead" weight={600}>
                One more step
              </Text>
              <Text variant="footnote" color={colors.text2}>
                Android asks before an app installs updates. Turn on Allow from this source for Harmoni, then come back and the update
                carries on.
              </Text>
            </View>
            <Button label="Open Settings" size="lg" onPress={allowInstalls} />
          </>
        ) : s.phase === "available" ? (
          <>
            <Button
              label={Native.networkMetered() ? `Download · ${bytes(r.size)}` : "Download and Update"}
              size="lg"
              onPress={downloadUpdate}
            />
            {Native.networkMetered() ? (
              <Text variant="footnote" color={colors.text3} align="center">
                You&apos;re on mobile data. On Wi‑Fi, updates download by themselves.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            {/* Still a button while Android has its say: if its prompt goes missing, tapping again starts over. */}
            <Button label={s.phase === "installing" ? "Updating…" : "Update Now"} size="lg" onPress={installUpdate} />
            <Text variant="footnote" color={colors.text3} align="center">
              Harmoni closes for a moment while it updates. Your sign-in, downloads and settings stay as they are.
            </Text>
          </>
        )}
        <Button label={working ? "Hide" : "Not Now"} variant="ghost" onPress={closeSheet} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 64, height: 64, borderRadius: 15, backgroundColor: colors.surface2 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.tint, marginTop: 8 },
  card: { backgroundColor: colors.surface2, borderRadius: 16, padding: 14, gap: 4 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
});
