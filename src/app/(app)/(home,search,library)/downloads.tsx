import Native from "harmoni-player";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { removeAllDownloads, removeDownload, useDownloads } from "@/downloads/downloads";
import { bytes, plural } from "@/lib/format";
import { Collection } from "@/song/Collection";
import { Icon } from "@/ui/Icon";
import { confirm } from "@/ui/overlays";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";

function DownloadsArt() {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" }]}>
      <Icon name="download-solid" size={72} color={colors.accent} />
    </View>
  );
}

export default function Downloads() {
  const items = useDownloads((s) => s.items);
  const [size, setSize] = useState(0);
  const done = useMemo(
    () =>
      Object.values(items)
        .filter((d) => d.state === "done" && d.song)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((d) => d.song!),
    [items],
  );
  const saving = Object.values(items).filter((d) => d.state === "queued" || d.state === "downloading");
  const failed = Object.values(items).filter((d) => d.state === "failed");
  useEffect(() => {
    Native.getDownloadSize().then(setSize);
  }, [done.length]);
  return (
    <Collection
      kind="On this phone"
      title="Downloads"
      art={<DownloadsArt />}
      artUrl={done[0]?.artworkUrl}
      songs={done}
      meta={size ? bytes(size) : undefined}
      numbered
      sortKey="downloads"
      orderLabel="Date saved"
      defaultSort={{ field: "order", descending: false }}
      findLabel="Find in Downloads"
      hideDownload
      rowExtras={(song) => [{ label: "Remove download", icon: "trash", onPress: () => removeDownload(song.id) }]}
      menu={() => [
        {
          label: "Remove all downloads",
          icon: "trash",
          danger: true,
          onPress: async () => {
            if (await confirm({ title: "Remove all downloads?", note: `${plural(done.length, "song")} saved on this phone will be removed. Your likes and playlists stay.`, confirm: "Remove all", danger: true })) removeAllDownloads();
          },
        },
      ]}
      menuLabel="Downloads options"
      empty={{ title: "Nothing saved yet", body: "Tap the download button on a playlist, album or Spice, or choose Download from any song's menu, and it'll play here without a connection." }}
      below={
        saving.length || failed.length ? (
          <View style={{ marginTop: 24, gap: 6 }}>
            {saving.length ? (
              <Text size={13} color={colors.text2}>
                Saving {plural(saving.length, "song")}… {Math.round(saving.reduce((a, d) => a + (d.percent || 0), 0) / saving.length)}%
              </Text>
            ) : null}
            {failed.length ? (
              <Text size={13} color={colors.danger}>
                {plural(failed.length, "song")} couldn't be saved. They'll try again when you download them.
              </Text>
            ) : null}
          </View>
        ) : null
      }
    />
  );
}
