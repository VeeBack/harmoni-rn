import { router } from "expo-router";
import { memo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Api } from "@/api/endpoints";
import type { UserCard } from "@/api/types";
import { haptic } from "@/lib/haptics";
import { profilePath } from "@/lib/share";
import { Icon } from "@/ui/Icon";
import { toast } from "@/ui/overlays";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";
import { Avatar } from "./Avatar";
import { inkFor } from "./style";

export const openProfile = (username: string) => router.push(profilePath(username) as never);

/**
 * Follow, Follow back, or Following (which unfollows). Changes straight away and
 * goes back if saving fails. Nothing for yourself.
 */
export function FollowButton({
  user,
  onChange,
  small,
  accent,
}: {
  user: UserCard;
  onChange?: (u: UserCard) => void;
  small?: boolean;
  accent?: string;
}) {
  const [following, setFollowing] = useState(!!user.youFollow);
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState(user.id);
  if (lastId !== user.id) {
    setLastId(user.id);
    setFollowing(!!user.youFollow);
  }
  if (user.youFollow === undefined) return null;

  async function toggle() {
    const next = !following;
    setFollowing(next);
    setBusy(true);
    try {
      const updated = await Api.follow(user.username, next);
      onChange?.(updated);
    } catch {
      setFollowing(!next);
      toast(next ? `Couldn't follow ${user.name}.` : `Couldn't unfollow ${user.name}.`, "error");
    } finally {
      setBusy(false);
    }
  }

  const bg = accent ?? colors.accent;
  const h = small ? 32 : 40;
  return (
    <Press
      onPress={toggle}
      disabled={busy}
      feedback={following ? "toggleOff" : "confirm"}
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityState={{ selected: following }}
      accessibilityLabel={
        following ? `Following ${user.name}. Tap to unfollow` : user.followsYou ? `Follow ${user.name} back` : `Follow ${user.name}`
      }
      style={[
        styles.follow,
        { height: h, paddingHorizontal: small ? 14 : 18 },
        following ? { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.borderStrong } : { backgroundColor: bg },
      ]}
    >
      <Icon name={following ? "check" : "user-plus"} size={small ? 15 : 18} color={following ? colors.text : inkFor(bg)} />
      <Text variant={small ? "footnote" : "subhead"} weight={600} color={following ? colors.text : inkFor(bg)}>
        {following ? "Following" : user.followsYou ? "Follow back" : "Follow"}
      </Text>
    </Press>
  );
}

export function FollowsYou({ user }: { user: UserCard }) {
  if (!user.followsYou) return null;
  return (
    <View style={styles.followsYou}>
      <Text variant="caption" weight={500} color={colors.text2}>
        Follows you
      </Text>
    </View>
  );
}

/** A person in a list: followers, search, who a playlist is shared with. */
export const UserRow = memo(function UserRow({
  user,
  action,
  last,
  onPress,
}: {
  user: UserCard;
  action?: React.ReactNode;
  last?: boolean;
  onPress?: () => void;
}) {
  return (
    <Press
      onPress={onPress ?? (() => openProfile(user.username))}
      feedback={false}
      scaleTo={1}
      highlight="rgba(255,255,255,0.06)"
      style={styles.row}
      accessibilityLabel={`${user.name}, @${user.username}`}
    >
      <Avatar name={user.name} url={user.avatarUrl} accent={user.accent} size={46} />
      <View style={styles.rowBody}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="callout" weight={500} numberOfLines={1}>
            {user.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text variant="subhead" color={colors.text2} numberOfLines={1} style={{ flexShrink: 1 }}>
              @{user.username}
            </Text>
            <FollowsYou user={user} />
          </View>
        </View>
        {action === undefined ? <FollowButton user={user} small /> : action}
        {last ? null : <View style={styles.line} />}
      </View>
    </Press>
  );
});

export function UserList({ users }: { users: UserCard[] }) {
  return (
    <View>
      {users.map((u, i) => (
        <UserRow key={u.id} user={u} last={i === users.length - 1} />
      ))}
    </View>
  );
}

/** People as round cards in a row, for search. */
export function PeopleRow({ users }: { users: UserCard[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -20 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingBottom: 6 }}
    >
      {users.map((u) => (
        <Press
          key={u.id}
          onPress={() => openProfile(u.username)}
          feedback="tap"
          scaleTo={0.95}
          style={{ width: 104, alignItems: "center", gap: 2 }}
          accessibilityLabel={`${u.name}, @${u.username}`}
        >
          <Avatar name={u.name} url={u.avatarUrl} accent={u.accent} size={104} style={{ marginBottom: 8 }} />
          <Text variant="subhead" weight={500} numberOfLines={1} align="center" style={{ width: 104 }}>
            {u.name}
          </Text>
          <Text variant="footnote" color={colors.text2} numberOfLines={1} align="center" style={{ width: 104 }}>
            @{u.username}
          </Text>
        </Press>
      ))}
    </ScrollView>
  );
}

export const tick = () => haptic.tick();

const styles = StyleSheet.create({
  follow: { borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  followsYou: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.surface3 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: -20, paddingLeft: 20, minHeight: 66 },
  rowBody: { flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 20 },
  line: { position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
