import * as WebBrowser from "expo-web-browser";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { serverOrigin } from "@/api/client";
import { kv } from "@/lib/storage";
import { Switch } from "@/ui/bits";
import { Icon, type IconName } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";

// The pieces every page of Settings is built from (the web's settings/parts.tsx).

/** A page of settings: its title, an optional line about it, then its groups. */
export function SettingsPage({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Screen back title={title} large>
      {description ? (
        <Text variant="subhead" color={colors.text2} style={{ marginTop: 2, marginHorizontal: 4 }}>
          {description}
        </Text>
      ) : null}
      {children}
      <View style={{ height: 8 }} />
    </Screen>
  );
}

/**
 * Settings that belong together: a short heading (and "This phone" opposite
 * it for the ones saved here), the rows in a rounded card, a footnote under it.
 */
export function Group({ title, here, note, children }: { title?: ReactNode; here?: boolean; note?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ marginTop: 28 }}>
      {title || here ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginHorizontal: 4, marginBottom: 10 }}>
          {title ? (
            <Text variant="headline" weight={600}>
              {title}
            </Text>
          ) : (
            <View />
          )}
          {here ? (
            <Text variant="footnote" color={colors.text3}>
              This phone
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.card}>{children}</View>
      {note ? (
        <Text variant="footnote" color={colors.text2} style={{ marginHorizontal: 16, marginTop: 8 }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/** A setting: what it is on the left, its control on the right. Rows after the first get a hairline above. */
export function Row({
  title,
  note,
  children,
  first,
  onPress,
  icon,
}: {
  title: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
  first?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingLeft: 16, minHeight: 52 }}>
      {icon ? <IconTile name={icon} /> : null}
      <View style={styles.rowBody}>
        {first ? null : <View style={styles.hairline} />}
        <View style={{ flex: 1, gap: 2 }}>
          {typeof title === "string" ? <Text variant="body">{title}</Text> : title}
          {typeof note === "string" ? (
            <Text variant="footnote" color={colors.text2}>
              {note}
            </Text>
          ) : (
            (note ?? null)
          )}
        </View>
        {children}
        {onPress ? <Icon name="chevron-right" size={17} color={colors.text3} /> : null}
      </View>
    </View>
  );
  return onPress ? (
    <Press onPress={onPress} feedback={false} scaleTo={1} highlight={colors.hover}>
      {body}
    </Press>
  ) : (
    body
  );
}

/** The small rounded icon at the start of a row that opens something. */
export function IconTile({ name }: { name: IconName }) {
  return (
    <View style={styles.tile}>
      <Icon name={name} size={18} color={colors.text} />
    </View>
  );
}

/** Opens a page of the web app (what only the web can do: sessions, connected apps, the server's settings). */
export function openWeb(path: string) {
  const origin = serverOrigin();
  if (origin)
    WebBrowser.openBrowserAsync(`${origin}${path}`, { showTitle: true, toolbarColor: colors.bg, enableBarCollapsing: true }).catch(() => {});
}

/** A row that opens a page of the web app, marked so. */
export function WebRow({ title, note, path, first, icon }: { title: string; note?: string; path: string; first?: boolean; icon?: IconName }) {
  return (
    <Row first={first} icon={icon} title={title} note={note ? `${note} Opens on the web.` : "Opens on the web."} onPress={() => openWeb(path)} />
  );
}

export function OffHere() {
  return (
    <Text variant="footnote" color={colors.text3}>
      Off on this server
    </Text>
  );
}

export function useKvSwitch(key: string, fallback: boolean) {
  const [v, setV] = useState(() => kv.get(key, fallback));
  return [v, (x: boolean) => (kv.set(key, x), setV(x))] as const;
}

export function KvSwitch({ k, initial }: { k: string; initial: boolean }) {
  const [on, setOn] = useKvSwitch(k, initial);
  return <Switch value={on} onChange={setOn} />;
}

/** One of a few, as a row of pills under a setting. */
export function Choice<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 14 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press
            key={o.value}
            onPress={() => !on && onChange(o.value)}
            feedback={on ? false : "select"}
            scaleTo={0.95}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[styles.pill, on && { backgroundColor: colors.accent }]}
          >
            <Text variant="footnote" weight={600} color={on ? colors.accentInk : colors.text}>
              {o.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

export const settingsStyles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 18, overflow: "hidden" },
});

const styles = StyleSheet.create({
  card: settingsStyles.card,
  rowBody: { flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 12, paddingRight: 16, paddingVertical: 11 },
  hairline: { position: "absolute", left: 0, right: 0, top: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  tile: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  pill: { height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface2, justifyContent: "center" },
});
