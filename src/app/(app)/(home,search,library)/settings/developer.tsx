import { serverOrigin } from "@/api/client";
import { Group, Row, SettingsPage, WebRow } from "@/settings/parts";
import { useSession } from "@/state/session";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";
import { currentBuild, currentVersion } from "@/update/updater";

function Value({ children }: { children: string }) {
  return (
    <Text variant="subhead" color={colors.text2} numberOfLines={1} style={{ maxWidth: "55%" }}>
      {children}
    </Text>
  );
}

export default function DeveloperSettings() {
  const me = useSession((s) => s.me);
  return (
    <SettingsPage title="Developer">
      <Group title="API">
        <WebRow first icon="info" title="API documentation" note="Build your own apps on Harmoni." path="/developers" />
      </Group>
      <Group title="About">
        <Row first title="Server">
          <Value>{me?.server.name ?? "…"}</Value>
        </Row>
        <Row title="Address">
          <Value>{serverOrigin()?.replace(/^https?:\/\//, "") ?? "…"}</Value>
        </Row>
        <Row title="App">
          <Value>{`${currentVersion}${currentBuild ? ` (${currentBuild})` : ""}`}</Value>
        </Row>
      </Group>
    </SettingsPage>
  );
}
