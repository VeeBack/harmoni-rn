import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "./Icon";
import { Press } from "./Press";
import { Text } from "./Text";
import { colors } from "./theme";

/** A row that opens a page (Library, Downloads): an icon in the tint, a big label, a count and a chevron. */
export function NavRow({
  icon,
  leading,
  label,
  detail,
  onPress,
  onLongPress,
  last,
}: {
  icon?: IconName;
  leading?: ReactNode;
  label: string;
  detail?: string;
  onPress: () => void;
  /** A menu for what it opens (Liked Songs: Play, Shuffle…). */
  onLongPress?: () => void;
  last?: boolean;
}) {
  return (
    <Press
      onPress={onPress}
      onLongPress={onLongPress}
      feedback={false}
      scaleTo={1}
      highlight="rgba(255,255,255,0.06)"
      style={styles.row}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
    >
      <View style={{ width: 26, alignItems: "center" }}>
        {leading ?? (icon ? <Icon name={icon} size={22} color={colors.tint} /> : null)}
      </View>
      <View style={styles.rowBody}>
        <Text variant="title3" weight={400} numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
        {detail ? (
          <Text variant="subhead" color={colors.text3}>
            {detail}
          </Text>
        ) : null}
        <Icon name="chevron-right" size={17} color={colors.text3} />
        {last ? null : <View style={styles.line} />}
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 16, marginHorizontal: -20, paddingLeft: 20 },
  rowBody: { flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 20 },
  line: { position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
