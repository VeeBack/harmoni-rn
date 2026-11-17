import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";

import { Api } from "@/api/endpoints";
import { SeedPicker } from "@/spice/SeedPicker";
import { CenterSpinner, EmptyState } from "@/ui/bits";
import { Screen } from "@/ui/Screen";

export default function ChangeSeeds() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["spice", id], queryFn: () => Api.spice(id) });
  if (!q.data)
    return (
      <Screen back>
        {q.isError ? <EmptyState title="Spice not found" body="It may have been deleted, or it belongs to someone else." /> : <CenterSpinner />}
      </Screen>
    );
  if (q.data.kind !== "custom" || !q.data.owned)
    return (
      <Screen back>
        <EmptyState title="Spice not found" body="It may have been deleted, or it belongs to someone else." />
      </Screen>
    );
  return <SeedPicker spice={q.data} />;
}
