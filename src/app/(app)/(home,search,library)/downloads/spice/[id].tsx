import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

import type { Spice } from "@/api/types";
import { DownloadedList, useSavedSongs } from "@/downloads/DownloadedList";
import { listKey, useMembers } from "@/downloads/members";
import { SpiceArt } from "@/spice/SpiceArt";
import { useSpices } from "@/state/collections";
import { queryClient } from "@/state/query";

/** A Spice as Downloads shows it: the songs from its last mix saved on this phone. */
export default function DownloadedSpice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const members = useMembers((s) => s.lists[listKey("spice", id)]);
  const spices = useSpices();
  const saved = useSavedSongs();
  const card = spices.data?.find((s) => s.id === id);
  const name = card?.name ?? queryClient.getQueryData<Spice>(["spice", id])?.name ?? "Spice";
  const covers = useMemo(
    () => card?.covers ?? [...new Set((members?.ids ?? []).map((i) => saved.get(i)?.artworkUrl).filter(Boolean) as string[])],
    [card, members, saved],
  );
  return (
    <DownloadedList
      kind="Spice"
      title={name}
      art={<SpiceArt name={name} covers={covers} />}
      ids={members?.ids ?? []}
      sortKey={`downloads:spice:${id}`}
      open={{ label: "Open the Spice", href: `/spice/${id}` }}
      emptyBody="None of this Spice's songs are saved on this phone. Open it and tap download."
    />
  );
}
