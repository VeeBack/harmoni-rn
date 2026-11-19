import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { Api } from "@/api/endpoints";
import { plural } from "@/lib/format";
import { Collection } from "@/song/Collection";
import { SongList } from "@/song/SongList";
import { SpiceArt } from "@/spice/SpiceArt";
import { GrindingNote, SpiceGrinder } from "@/spice/SpiceGrinder";
import type { SpiceCard } from "@/api/types";
import { useWindowDimensions } from "react-native";
import { libraryChanged } from "@/state/collections";
import { queryClient } from "@/state/query";
import { Section, SmallButton } from "@/ui/bits";
import { confirm, prompt, toast, type MenuItem } from "@/ui/overlays";
import { Text } from "@/ui/Text";
import { colors } from "@/ui/theme";

function made(iso?: string) {
  if (!iso) return undefined;
  const h = (Date.now() - Date.parse(iso)) / 3600_000;
  return h < 1 ? "Made just now" : h < 24 ? "Made today" : "Made yesterday";
}

export default function SpiceScreen() {
  const { id, preview } = useLocalSearchParams<{ id: string; preview?: string }>();
  const q = useQuery({ queryKey: ["spice", id], queryFn: () => Api.spice(id) });
  // Dev only: ?preview=grind shows the page as if the Spice were still being made.
  const grinding = __DEV__ && preview === "grind";
  // Known from the library list before the Spice itself loads, so the grinder can wear its colours.
  const cached = (queryClient.getQueryData<SpiceCard[]>(["spices"]) ?? []).find((x) => x.id === id);
  const { width } = useWindowDimensions();
  const artSize = Math.round(Math.min(width * 0.66, 280));
  const s = grinding ? undefined : q.data;
  const reload = () => {
    libraryChanged();
    q.refetch();
  };

  const menu = (): MenuItem[] => {
    if (!s) return [];
    const items: MenuItem[] = [
      {
        label: "Save as playlist",
        icon: "snapshot",
        onPress: async () => {
          try {
            const p = await Api.snapshotSpice(s.id);
            libraryChanged();
            toast(`Saved as ${p.name}`);
          } catch {
            toast("Couldn't save it as a playlist.", "error");
          }
        },
      },
    ];
    if (s.kind === "custom" && s.owned) {
      items.push(
        { label: "Change its songs", icon: "spice", onPress: () => router.push(`/spice/${s.id}/seeds`) },
        {
          label: "Rename",
          icon: "edit",
          onPress: async () => {
            const name = await prompt({ title: "Rename Spice", label: "Name", defaultValue: s.name, confirm: "Save" });
            if (!name) return;
            try {
              await Api.renameSpice(s.id, name);
              reload();
            } catch {
              toast("Couldn't rename it.", "error");
            }
          },
        },
        {
          label: "Delete Spice",
          icon: "trash",
          danger: true,
          onPress: async () => {
            if (!(await confirm({ title: `Delete “${s.name}”?`, note: "This can't be undone.", confirm: "Delete", danger: true }))) return;
            try {
              await Api.deleteSpice(s.id);
              toast(`Deleted ${s.name}`);
              queryClient.removeQueries({ queryKey: ["spice", id] });
              libraryChanged();
              router.back();
            } catch {
              toast("Couldn't delete it.", "error");
            }
          },
        },
      );
    }
    return items;
  };

  const custom = s?.kind === "custom";
  return (
    <Collection
      kind="Spice"
      title={s?.name ?? ""}
      description={s ? (custom ? `Grown from ${plural(s.seeds.length || s.seedCount || 0, "seed song")}, and different every day.` : "Picked for you from what you listen to, and different every day.") : undefined}
      meta={made(s?.generatedAt)}
      art={s ? <SpiceArt name={s.name} covers={s.covers} /> : <SpiceGrinder size={artSize} seed={cached?.name ?? id} />}
      artUrl={s?.covers[0]}
      songs={s?.songs}
      numbered
      sortKey={`spice:${id}`}
      orderLabel="Spice order"
      orderIcon="spice"
      findLabel="Find in Spice"
      menu={menu}
      menuLabel="Spice options"
      loadingNote={<GrindingNote />}
      error={q.isError ? { title: "Spice not found", body: "It may have been deleted, or it belongs to someone else." } : null}
      noMatch={(x) => `Nothing in this Spice matches “${x}”.`}
      empty={
        custom
          ? { title: "Plant a seed", body: "Pick a few songs you love and Harmoni grows the rest from there.", action: "Pick songs", onAction: () => router.push(`/spice/${id}/seeds`) }
          : { title: "Nothing in this one yet", body: "Its sources didn't come back with anything. Try again in a little while." }
      }
      below={
        custom && s?.owned && s.seeds.length ? (
          <Section title="Grown from" action={<SmallButton label="Change" onPress={() => router.push(`/spice/${id}/seeds`)} />}>
            <Text size={13} color={colors.text2} style={{ marginTop: -6, marginBottom: 14, lineHeight: 19 }}>
              The songs this Spice grows from. Change them and it remakes itself next time you open it.
            </Text>
            <SongList
              songs={s.seeds}
              extras={(song) => [
                {
                  label: "Remove from seeds",
                  icon: "trash",
                  onPress: async () => {
                    try {
                      await Api.removeSeed(s.id, song.id);
                      reload();
                    } catch {
                      toast("Couldn't remove that seed.", "error");
                    }
                  },
                },
              ]}
            />
          </Section>
        ) : (
          <View />
        )
      }
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
    />
  );
}
