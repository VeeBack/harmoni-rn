import { Group, Row, SettingsPage, WebRow } from "@/settings/parts";
import { isPrivate, PRIVATE_HOURS, setPref, usePrefs } from "@/settings/prefs";
import { Switch } from "@/ui/bits";

const until = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export default function PrivacySettings() {
  const privateUntil = usePrefs((s) => s.privateUntil);
  const on = usePrefs(isPrivate);
  return (
    <SettingsPage title="Privacy & security">
      <Group title="Listening" here>
        <Row
          first
          title="Private listening"
          note={
            on
              ? `What you play stays out of your history and recommendations until ${until(privateUntil)}.`
              : `What you play stays out of your history and recommendations. Turns itself off after ${PRIVATE_HOURS} hours.`
          }
        >
          <Switch value={on} onChange={(v) => setPref("privateUntil", v ? Date.now() + PRIVATE_HOURS * 3600_000 : 0)} />
        </Row>
      </Group>

      <Group title="Your account" note="Apps can't see or change these, so they're on the web.">
        <WebRow first icon="computer" title="Signed-in devices" note="See where you're signed in, and sign them out." path="/settings/privacy" />
        <WebRow icon="link" title="Connected apps" note="Apps you've allowed to use your account, like this one." path="/settings/privacy" />
      </Group>
    </SettingsPage>
  );
}
