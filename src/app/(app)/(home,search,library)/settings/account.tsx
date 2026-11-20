import { router } from "expo-router";
import { View } from "react-native";

import { Api } from "@/api/endpoints";
import { profilePath } from "@/lib/share";
import { Avatar } from "@/profile/Avatar";
import { Group, openWeb, Row, SettingsPage } from "@/settings/parts";
import { clearQueryCache } from "@/state/query";
import { useSession } from "@/state/session";
import { SmallButton } from "@/ui/bits";
import { confirm, prompt, toast } from "@/ui/overlays";
import { Text } from "@/ui/Text";
import { colors, radius } from "@/ui/theme";

export default function AccountSettings() {
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const signOut = useSession((s) => s.signOut);

  const rename = async () => {
    const name = await prompt({ title: "Change name", note: "Shown to other people on this server.", label: "Name", defaultValue: me?.name, confirm: "Save" });
    if (!name || name === me?.name) return;
    try {
      setMe(await Api.updateMe({ name }));
      toast("Name changed");
    } catch {
      toast("Couldn't change your name.", "error");
    }
  };

  return (
    <SettingsPage title="Account">
      <Group title="Profile">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}>
          <Avatar name={me?.name ?? ""} url={me?.avatarUrl} accent={me?.accent} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text variant="headline" numberOfLines={1} style={{ flexShrink: 1 }}>
                {me?.name ?? " "}
              </Text>
              {me?.role === "admin" ? (
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.accent }}>
                  <Text variant="caption2" weight={600} color={colors.accentInk}>
                    Admin
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="footnote" color={colors.text2}>
              {me ? `@${me.username}` : " "}
            </Text>
          </View>
          <SmallButton label="Change name" icon="edit" onPress={rename} />
        </View>
        {me?.username ? (
          <Row icon="palette" title="Edit profile" note="Picture, banner, colours and pinned songs" onPress={() => router.push(profilePath(me.username) as never)} />
        ) : null}
      </Group>

      <Group title="Sign-in">
        <Row first title="Password" note="Change it on the web." onPress={() => openWeb("/settings/account")} />
        <Row title="Sign out" note="Sign out of Harmoni on this phone. Downloads on it are removed.">
          <SmallButton
            label="Sign out"
            icon="logout"
            onPress={async () => {
              const yes = await confirm({
                title: "Sign out?",
                note: "You'll need to sign in again to listen on this phone. Songs downloaded to it are removed.",
                confirm: "Sign out",
              });
              if (!yes) return;
              await signOut();
              clearQueryCache();
            }}
          />
        </Row>
      </Group>
    </SettingsPage>
  );
}
