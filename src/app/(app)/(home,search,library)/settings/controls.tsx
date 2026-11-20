import Native from "harmoni-player";

import { LinksRow } from "@/settings/LinksRow";
import { Group, Row, SettingsPage } from "@/settings/parts";
import { useNativePref } from "@/settings/prefs";
import { SmallButton, Switch } from "@/ui/bits";

export default function ControlSettings() {
  const [heart, setHeart] = useNativePref("mediaHeart");
  return (
    <SettingsPage title="Controls & widget">
      <Group title="Media controls" here>
        <Row first title="Like button" note="A heart beside play and skip in the notification, on the lock screen and in the car.">
          <Switch value={heart} onChange={setHeart} />
        </Row>
      </Group>

      <Group title="Home screen" here>
        {Native.canPinWidget() ? (
          <Row first title="Widget" note="What's playing, with play, skip and back, right on your home screen.">
            <SmallButton label="Add" icon="plus" onPress={() => Native.pinWidget()} />
          </Row>
        ) : null}
        <LinksRow first={!Native.canPinWidget()} />
      </Group>
    </SettingsPage>
  );
}
