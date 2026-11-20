import { useState } from "react";

import { hapticsEnabled, setHapticsEnabled } from "@/lib/haptics";
import { Choice, Group, KvSwitch, Row, SettingsPage } from "@/settings/parts";
import { setPref, usePrefs, type OpenOn } from "@/settings/prefs";
import { Switch } from "@/ui/bits";

const OPEN_ON: { value: OpenOn; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "search", label: "Search" },
  { value: "library", label: "Library" },
  { value: "last", label: "Where I left off" },
];

export default function FeelSettings() {
  const [haptics, setHaptics] = useState(hapticsEnabled());
  const reduceMotion = usePrefs((s) => s.reduceMotion);
  const hideNumbers = usePrefs((s) => s.hideNumbers);
  const openOn = usePrefs((s) => s.openOn);
  return (
    <SettingsPage title="Look & feel">
      <Group title="Feel" here>
        <Row first title="Haptics" note="Little taps under your finger as you play, skip and pick.">
          <Switch
            value={haptics}
            onChange={(v) => {
              setHapticsEnabled(v);
              setHaptics(v);
            }}
          />
        </Row>
        <Row title="Move with the music" note="In Now Playing, the background swells and glows with the bass.">
          <KvSwitch k="settings.bassBackdrop" initial />
        </Row>
        <Row title="Reduce motion" note="Calmer animations. Android's Remove animations setting does this too.">
          <Switch value={reduceMotion} onChange={(v) => setPref("reduceMotion", v)} />
        </Row>
      </Group>

      <Group title="Lists" here>
        <Row first title="Hide song numbers" note="Albums and playlists without the number beside each song.">
          <Switch value={hideNumbers} onChange={(v) => setPref("hideNumbers", v)} />
        </Row>
      </Group>

      <Group title="Open on" here>
        <Row first title="When Harmoni starts" note="The tab it opens on." />
        <Choice value={openOn} options={OPEN_ON} onChange={(v) => setPref("openOn", v)} />
      </Group>
    </SettingsPage>
  );
}
