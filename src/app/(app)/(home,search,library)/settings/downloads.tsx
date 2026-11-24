import Native from "harmoni-player";
import { useEffect, useState } from "react";

import { removeAllDownloads, useDownloads } from "@/downloads/downloads";
import { bytes, plural } from "@/lib/format";
import { Group, Row, SettingsPage } from "@/settings/parts";
import { setPref, useNativePref, usePrefs } from "@/settings/prefs";
import { SmallButton, Switch } from "@/ui/bits";
import { confirm } from "@/ui/overlays";

export default function DownloadSettings() {
  const items = useDownloads((s) => s.items);
  const all = Object.values(items);
  const done = all.filter((d) => d.state === "done").length;
  const waiting = all.filter((d) => d.state === "queued" || d.state === "downloading").length;
  const [size, setSize] = useState(0);
  const [wifiOnly, setWifiOnly] = useNativePref("wifiOnlyDownloads");
  const autoLikes = usePrefs((s) => s.autoDownloadLikes);
  const dataSaver = usePrefs((s) => s.dataSaver);
  useEffect(() => {
    Native.getDownloadSize().then(setSize);
  }, [done]);
  const onMobile = Native.networkMetered();

  return (
    <SettingsPage title="Downloads & data" description="Downloaded songs play without a connection, from this phone's storage.">
      <Group title="Saved on this phone">
        <Row
          first
          title={done ? `${plural(done, "song")} saved` : "Nothing saved yet"}
          note={done ? `${bytes(size)} on this phone` : "Download a playlist, album, Spice or song to listen offline."}
        >
          {done ? (
            <SmallButton
              label="Remove all"
              icon="trash"
              onPress={async () => {
                const yes = await confirm({
                  title: "Remove all downloads?",
                  note: `${plural(done, "song")} saved on this phone will be removed.`,
                  confirm: "Remove all",
                  danger: true,
                });
                if (yes) removeAllDownloads();
              }}
            />
          ) : null}
        </Row>
      </Group>

      <Group title="Downloading" here>
        <Row
          first
          title="Download on Wi‑Fi only"
          note={
            wifiOnly && onMobile && waiting
              ? `${plural(waiting, "song")} waiting for Wi‑Fi.`
              : wifiOnly
                ? "On mobile data, downloads wait until you're on Wi‑Fi."
                : "Downloads use mobile data too."
          }
        >
          <Switch value={wifiOnly} onChange={setWifiOnly} />
        </Row>
        <Row title="Download new likes" note="Songs you like are saved for offline too.">
          <Switch value={autoLikes} onChange={(v) => setPref("autoDownloadLikes", v)} />
        </Row>
      </Group>

      <Group title="Mobile data" here>
        <Row first title="Data saver" note="Load smaller artwork while you're on mobile data.">
          <Switch value={dataSaver} onChange={(v) => setPref("dataSaver", v)} />
        </Row>
      </Group>
    </SettingsPage>
  );
}
