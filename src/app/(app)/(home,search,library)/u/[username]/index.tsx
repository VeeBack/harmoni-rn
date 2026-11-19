import { useLocalSearchParams } from "expo-router";

import { ProfileScreen } from "@/profile/ProfileScreen";

export default function ProfileRoute() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <ProfileScreen username={decodeURIComponent(username)} />;
}
