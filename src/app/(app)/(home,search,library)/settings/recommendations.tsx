import { View } from "react-native";

import { Api } from "@/api/endpoints";
import { Group, OffHere, Row, SettingsPage } from "@/settings/parts";
import { useSession } from "@/state/session";
import { SmallButton, Switch } from "@/ui/bits";
import { Icon, type IconName } from "@/ui/Icon";
import { confirm, toast } from "@/ui/overlays";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";

const USES: [IconName, string][] = [
  ["music", "Songs you finish, skip or replay"],
  ["heart", "Your likes, playlists and most-played artists"],
  ["lock", "Stays on this server and is only used for you"],
];

export default function RecommendationsSettings() {
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const available = me?.server.features.superProcessing !== false;
  const on = !!me?.superProcessing;

  const turn = async (v: boolean) => {
    if (!me) return;
    setMe({ ...me, superProcessing: v });
    try {
      setMe(await Api.updateMe({ superProcessing: v }));
    } catch {
      setMe({ ...me, superProcessing: !v });
      toast("Couldn't change Super Processing.", "error");
    }
  };

  const reset = async () => {
    const sure = await confirm({
      title: "Reset recommendations?",
      note: "Your listening history is cleared and Home starts fresh. Likes and playlists are kept.",
      confirm: "Reset",
      danger: true,
    });
    if (!sure) return;
    try {
      await Api.forgetListening();
      toast("Recommendations reset");
    } catch {
      toast("Couldn't reset recommendations.", "error");
    }
  };

  return (
    <SettingsPage title="Recommendations" description="Super Processing personalises Home, your Spices and Autoplay based on how you listen.">
      <Group title="Super Processing">
        <Row first title="Personalise with Super Processing">
          {available ? <Switch value={on} onChange={turn} /> : <OffHere />}
        </Row>
        {on ? (
          <Row title="Reset recommendations" note="Clear your listening history and start fresh.">
            <SmallButton label="Reset" icon="refresh" onPress={reset} />
          </Row>
        ) : null}
      </Group>
      {available ? (
        <Group title="What it uses">
          <View style={{ padding: 16, gap: 14 }}>
            {USES.map(([icon, text]) => (
              <View key={text} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Icon name={icon} size={18} color={colors.text2} />
                <Text variant="subhead" color={colors.text2} style={{ flex: 1 }}>
                  {text}
                </Text>
              </View>
            ))}
          </View>
        </Group>
      ) : null}
    </SettingsPage>
  );
}
