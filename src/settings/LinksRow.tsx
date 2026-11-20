import Native from "harmoni-player";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { serverOrigin } from "@/api/client";
import { SmallButton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { colors } from "@/ui/theme";
import { Row } from "./parts";

/** Whether links to this server's songs, playlists and profiles open here (Android asks the person). */
export function LinksRow({ first }: { first?: boolean }) {
  const [on, setOn] = useState(() => Native.linksEnabled());
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => st === "active" && setOn(Native.linksEnabled()));
    return () => sub.remove();
  }, []);
  const host = serverOrigin()?.replace(/^https?:\/\//, "") ?? "your server";
  return (
    <Row
      first={first}
      title="Open Harmoni links here"
      note={
        on
          ? `Links to songs, playlists and profiles on ${host} open in this app.`
          : `Links people send you open in the browser. Turn on links for ${host} so they open here.`
      }
    >
      {on ? <Icon name="check" size={20} color={colors.accent} /> : <SmallButton label="Turn on" onPress={() => Native.openLinkSettings()} />}
    </Row>
  );
}

