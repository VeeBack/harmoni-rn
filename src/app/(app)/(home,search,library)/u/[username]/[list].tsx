import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { Api } from "@/api/endpoints";
import { profilePath } from "@/lib/share";
import { UserList } from "@/profile/people";
import { profileKey } from "@/profile/ProfileScreen";
import { EmptyState, Skeleton } from "@/ui/bits";
import { Press } from "@/ui/Press";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";

/** Someone's followers, or who they follow. */
export default function FollowList() {
  const { username: raw, list } = useLocalSearchParams<{ username: string; list: string }>();
  const username = decodeURIComponent(raw);
  const which = list === "following" ? "following" : list === "followers" ? "followers" : null;
  const profile = useQuery({ queryKey: profileKey(username), queryFn: () => Api.profile(username), enabled: !!which });
  const users = useQuery({
    queryKey: ["profile", username.toLowerCase(), which],
    queryFn: () => (which === "following" ? Api.following(username) : Api.followers(username)),
    enabled: !!which,
  });
  const title = which === "following" ? "Following" : "Followers";
  const isMe = profile.data?.isMe;
  return (
    <Screen back title={title} large refreshing={users.isRefetching} onRefresh={() => users.refetch()}>
      <Press
        onPress={() => router.navigate(profilePath(username) as never)}
        feedback="tap"
        scaleTo={1}
        dim
        style={{ alignSelf: "flex-start", marginTop: -6, marginBottom: 10 }}
      >
        <Text variant="subhead" color={colors.tint}>
          {profile.data?.user.name ?? `@${username}`}
        </Text>
      </Press>
      {!which || users.isError ? (
        <EmptyState title="Nothing here" body="That page doesn't exist." />
      ) : !users.data ? (
        <View style={{ gap: 14, marginTop: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Skeleton width={46} height={46} round />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width="50%" height={14} />
                <Skeleton width="30%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ) : users.data.length ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <UserList users={users.data} />
        </Animated.View>
      ) : (
        <EmptyState
          icon="users"
          title={which === "followers" ? "No followers yet" : "Not following anyone yet"}
          body={
            isMe
              ? which === "followers"
                ? "Share your profile and people can follow you."
                : "Search for people you know and follow them."
              : undefined
          }
        />
      )}
    </Screen>
  );
}
