import { useState } from "react";
import { View } from "react-native";

import { deviceId, deviceName, onlineDevices, setDeviceName, setLinkPref, useLink, useLinkPref } from "@/link/link";
import { Group, Row, SettingsPage } from "@/settings/parts";
import { SmallButton, Switch } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { prompt } from "@/ui/overlays";
import { Text } from "@/ui/Text";
import { colors, radius } from "@/ui/theme";

function Badge({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: accent ? colors.accent : colors.surface3 }}>
      <Text variant="caption2" weight={600} color={accent ? colors.accentInk : colors.text2}>
        {label}
      </Text>
    </View>
  );
}

export default function LinkSettings() {
  const on = useLinkPref((p) => p.on);
  const connected = useLink((l) => l.connected);
  const active = useLink((l) => l.active);
  useLink((l) => l.devices); // re-render as devices come and go
  const [name, setName] = useState(deviceName());
  // This phone first, then the rest by name.
  const devices = onlineDevices().sort((a, b) => (a.id === deviceId ? -1 : b.id === deviceId ? 1 : a.name.localeCompare(b.name)));

  const rename = async () => {
    const v = await prompt({ title: "Rename this device", note: "Leave empty to use the default name.", label: "Name", defaultValue: name, confirm: "Save" });
    if (v === undefined) return;
    setDeviceName(v);
    setName(deviceName());
  };

  return (
    <SettingsPage title="Harmoni Link" description="Play on one device and control it from another. Switch devices with the link button in the player.">
      <Group title="This phone" note={on ? undefined : "Off: this phone plays on its own and doesn't show up on your other devices."}>
        <Row first title="Use Harmoni Link" note="Show up on your other devices, and control them from here.">
          <Switch value={on} onChange={setLinkPref} />
        </Row>
        <Row title={name} note="How this phone appears on your others.">
          <SmallButton label="Rename" icon="edit" onPress={rename} />
        </Row>
      </Group>

      {on ? (
        <Group title="Online now" note={devices.length === 1 ? "Open Harmoni on another device to see it here." : undefined}>
          {!connected || !devices.length ? (
            <Row first title="Connecting…" />
          ) : (
            devices.map((d, i) => (
              <Row
                key={d.id}
                first={i === 0}
                title={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {d.name}
                    </Text>
                    {d.id === deviceId ? <Badge label="This phone" /> : null}
                    {d.id === active ? <Badge label="Playing" accent /> : null}
                  </View>
                }
              >
                <Icon name={d.kind === "computer" ? "computer" : "phone"} size={20} color={colors.text3} />
              </Row>
            ))
          )}
        </Group>
      ) : null}
    </SettingsPage>
  );
}
