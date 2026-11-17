import { View } from "react-native";

import { deviceId, onlineDevices, useLink } from "@/link/link";
import { player } from "@/player/player";
import { openMenu, toast, type MenuItem } from "@/ui/overlays";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";

const KIND = { phone: "Phone", tablet: "Tablet", computer: "Computer" } as const;

/** Harmoni Link's device picker. */
export function openLinkPicker() {
  openMenu({
    label: "Harmoni Link",
    header: (
      <View>
        <Text size={18} weight={600} style={{ letterSpacing: -0.18 }}>
          Harmoni{" "}
          <Text size={18} weight={500} style={{ fontStyle: "italic" }}>
            Link
          </Text>
        </Text>
        <Text size={13} color={colors.text2} style={{ marginTop: 2, lineHeight: 18 }}>
          Play on any of your devices, and control it from all of them.
        </Text>
      </View>
    ),
    items: () => {
      const l = useLink.getState();
      const devices = onlineDevices();
      const me = devices.find((d) => d.id === deviceId);
      const others = devices.filter((d) => d.id !== deviceId).sort((a, b) => a.name.localeCompare(b.name));
      const where = l.active ?? deviceId;
      const rows: MenuItem[] = [];
      for (const d of [...(me ? [me] : []), ...others]) {
        const here = d.id === deviceId;
        const playing = d.id === l.active;
        const detail = here ? (playing ? "This device · Playing" : "This device") : playing ? "Playing" : KIND[d.kind];
        rows.push({
          label: d.name,
          icon: d.kind === "computer" ? "computer" : "phone",
          detail,
          checked: d.id === where,
          onPress: () => {
            if (d.id === where) return;
            player.transferTo(d.id).catch(() => toast("Couldn't reach that device.", "error"));
          },
        });
      }
      if (!others.length) rows.push({ label: "No other devices yet", icon: "link", detail: "Open Harmoni on another device to see it here", disabled: true });
      return rows;
    },
  });
}
