import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { Api } from "@/api/endpoints";
import { profileKey } from "@/profile/ProfileScreen";
import { Collection } from "@/song/Collection";
import { EmptyState } from "@/ui/bits";
import { Screen } from "@/ui/Screen";

/** Everything someone has liked, when they show it on their profile. */
export default function ProfileLikes() {
  const username = decodeURIComponent(useLocalSearchParams<{ username: string }>().username);
  const profile = useQuery({ queryKey: profileKey(username), queryFn: () => Api.profile(username) });
  const songs = useQuery({ queryKey: ["profile", username.toLowerCase(), "likes"], queryFn: () => Api.userLikes(username) });
  if (songs.isError)
    return (
      <Screen back title="Liked songs">
        <View style={{ paddingTop: 60 }}>
          <EmptyState title="Not shown" body="They keep their liked songs to themselves." icon="lock" />
        </View>
      </Screen>
    );
  return <Collection kind="Liked by" title={profile.data?.user.name ?? `@${username}`} songs={songs.data} loading={!songs.data} />;
}
