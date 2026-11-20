import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "./Icon";
import { Press } from "./Press";
import { Text } from "./Text";
import { colors } from "./theme";

/** A row that opens a page (Library, Downloads): an icon where a cover would be, a label, a count and a chevron. */
export function NavRow({
  icon,
  leading,
  label,
  detail,
  onPress,
  last,
}: {
  icon?: IconName;
  leading?: ReactNode;
  label: string;
  detail?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Press
      onPress={onPress}
      feedback={false}
      scaleTo={1}
      highlight="rgba(255,255,255,0.06)"
      style={styles.row}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
    >
      <View style={{ width: 48, alignItems: "center" }}>
        {leading ?? (icon ? <Icon name={icon} size={22} color={colors.text2} /> : null)}
      </View>
      <View style={styles.rowBody}>
        <Text variant="callout" weight={600} numberOfLines={1} style={{ flex: 1 }}>
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
  art: { width: 48, height: 48, borderRadius: 8, overflow: "hidden", backgroundColor: colors.surface2 },
  line: { position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});

/**
 * One of the lists that's always there (Library's Liked Songs, Recently
 * Played, your Spice): its cover, its name and what it is, and a chevron.
 */
export function PinnedRow({
  art,
  label,
  detail,
  onPress,
  onLongPress,
  last,
}: {
  art: ReactNode;
  label: string;
  detail?: string;
  onPress: () => void;
  onLongPress?: () => void;
  last?: boolean;
}) {
  return (
    <Press
      onPress={onPress}
      onLongPress={onLongPress}
      feedback={false}
      scaleTo={1}
      highlight={colors.hover}
      style={[styles.row, { minHeight: 64 }]}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
    >
      <View style={styles.art}>{art}</View>
      <View style={styles.rowBody}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="callout" weight={600} numberOfLines={1}>
            {label}
          </Text>
          {detail ? (
            <Text variant="footnote" color={colors.text3} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-right" size={17} color={colors.text3} />
        {last ? null : <View style={styles.line} />}
      </View>
    </Press>
  );
}
