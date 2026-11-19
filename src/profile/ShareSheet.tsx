import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

import { errorMessage } from "@/api/client";
import { Api } from "@/api/endpoints";
import type { UserCard, Visibility } from "@/api/types";
import { absolute, copyLink, shareLink } from "@/lib/share";
import { useSession } from "@/state/session";
import { Icon, type IconName } from "@/ui/Icon";
import { openSheet, toast } from "@/ui/overlays";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { colors, fonts } from "@/ui/theme";
import { Avatar } from "./Avatar";

const OPTIONS: { key: Visibility; icon: IconName; title: string; note: string }[] = [
  { key: "private", icon: "lock", title: "Private", note: "Only you" },
  { key: "users", icon: "users", title: "Shared with people", note: "Only the people you pick" },
  { key: "link", icon: "link", title: "Anyone with the link", note: "Anyone here who has the link" },
  { key: "public", icon: "globe", title: "Public", note: "Everyone here, and it's on your profile" },
];

export interface Sharing {
  visibility: Visibility;
  shareUrl?: string;
  sharedWith: UserCard[];
}

/** What to send someone: the link with its key, or (shared or public) the plain link. */
export function linkFor(id: string, s: Sharing): string | undefined {
  if (s.visibility === "link") return s.shareUrl;
  if (s.visibility === "users" || s.visibility === "public") return `/playlist/${id}`;
  return undefined;
}

export function openShareSheet(playlist: { id: string; name: string }, sharing: Sharing, onChange: (s: Sharing) => void) {
  openSheet({ title: `Share “${playlist.name}”`, render: () => <ShareSheet playlist={playlist} initial={sharing} onChange={onChange} /> });
}

/** Who can open a playlist. Each change saves as it's made. */
function ShareSheet({
  playlist,
  initial,
  onChange,
}: {
  playlist: { id: string; name: string };
  initial: Sharing;
  onChange: (s: Sharing) => void;
}) {
  const [sharing, setSharingState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (s: Sharing) => {
    setSharingState(s);
    onChange(s);
  };

  async function patch(body: { visibility?: Visibility; resetLink?: boolean }) {
    const before = sharing;
    if (body.visibility) set({ ...sharing, visibility: body.visibility });
    setBusy(true);
    try {
      const r = await Api.updatePlaylist(playlist.id, body);
      set({ ...sharing, visibility: r.visibility ?? body.visibility ?? sharing.visibility, shareUrl: r.shareUrl });
      if (body.resetLink) toast("New link made. The old one no longer works.");
    } catch (e) {
      set(before);
      toast(errorMessage(e) || "Couldn't change who can see it.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function setPeople(people: UserCard[]) {
    const before = sharing;
    set({ ...sharing, sharedWith: people });
    try {
      const saved = await Api.sharePlaylist(
        playlist.id,
        people.map((p) => p.username),
      );
      set({ ...sharing, sharedWith: saved });
    } catch {
      set(before);
      toast("Couldn't change who it's shared with.", "error");
    }
  }

  const link = linkFor(playlist.id, sharing);
  return (
    <Animated.View layout={LinearTransition.springify().damping(24)} style={{ gap: 14, paddingTop: 6 }}>
      <View style={styles.group}>
        {OPTIONS.map((o, i) => {
          const on = sharing.visibility === o.key;
          return (
            <Press
              key={o.key}
              onPress={() => !on && patch({ visibility: o.key })}
              disabled={busy}
              feedback="select"
              scaleTo={1}
              highlight="rgba(255,255,255,0.06)"
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={styles.option}
            >
              <View style={[styles.optionIcon, on ? { backgroundColor: colors.accent } : null]}>
                <Icon name={o.icon} size={18} color={on ? colors.accentInk : colors.text} />
              </View>
              <View style={[styles.optionBody, i === OPTIONS.length - 1 ? null : styles.line]}>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{o.title}</Text>
                  <Text variant="footnote" color={colors.text2}>
                    {o.note}
                  </Text>
                </View>
                <View style={[styles.radio, on ? styles.radioOn : null]}>{on ? <View style={styles.radioDot} /> : null}</View>
              </View>
            </Press>
          );
        })}
      </View>

      {sharing.visibility === "users" ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)}>
          <PeoplePicker people={sharing.sharedWith} onChange={setPeople} />
        </Animated.View>
      ) : null}

      {link ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={{ gap: 10 }}>
          <View style={styles.linkField}>
            <Text variant="subhead" color={colors.text2} numberOfLines={1} ellipsizeMode="middle" style={{ flex: 1 }} selectable>
              {absolute(link)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <PillButton icon="share" label="Share…" primary onPress={() => shareLink(link, playlist.name)} />
            <PillButton
              icon="copy"
              label="Copy link"
              onPress={() => copyLink(link).then((ok) => toast(ok ? "Link copied" : "Couldn't copy the link.", ok ? "info" : "error"))}
            />
          </View>
          {sharing.visibility === "link" ? (
            <Press
              onPress={() => patch({ resetLink: true })}
              disabled={busy}
              feedback="tap"
              scaleTo={1}
              dim
              style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}
            >
              <Icon name="refresh" size={16} color={colors.tint} />
              <Text variant="footnote" color={colors.tint}>
                Make a new link (the old one stops working)
              </Text>
            </Press>
          ) : null}
        </Animated.View>
      ) : null}
      {sharing.visibility === "users" && sharing.sharedWith.length > 0 ? (
        <Text variant="footnote" color={colors.text2}>
          They&apos;ll find it in their library, under Shared with you.
        </Text>
      ) : null}
    </Animated.View>
  );
}

function PillButton({ icon, label, primary, onPress }: { icon: IconName; label: string; primary?: boolean; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      feedback="tap"
      scaleTo={0.95}
      accessibilityRole="button"
      style={{
        flex: 1,
        height: 46,
        borderRadius: 23,
        backgroundColor: primary ? colors.accent : "rgba(255,255,255,0.1)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <Icon name={icon} size={18} color={primary ? colors.accentInk : colors.text} />
      <Text variant="subhead" weight={600} color={primary ? colors.accentInk : colors.text}>
        {label}
      </Text>
    </Press>
  );
}

/** Search for people to share with; people you follow are suggested first. */
function PeoplePicker({ people, onChange }: { people: UserCard[]; onChange: (p: UserCard[]) => void }) {
  const me = useSession((s) => s.me);
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const found = useQuery({ queryKey: ["users", q], queryFn: () => Api.users(q), enabled: !!q });
  const following = useQuery({
    queryKey: ["profile", me?.username?.toLowerCase(), "following"],
    queryFn: () => Api.following(me!.username),
    enabled: !!me,
  });
  const chosen = new Set(people.map((p) => p.id));
  const options = ((q ? found.data : following.data) ?? []).filter((u) => u.id !== me?.id && !chosen.has(u.id)).slice(0, 6);

  return (
    <View style={{ gap: 10 }}>
      {people.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {people.map((p) => (
            <Animated.View key={p.id} entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.chip}>
              <Avatar name={p.name} url={p.avatarUrl} accent={p.accent} size={24} />
              <Text variant="subhead" numberOfLines={1} style={{ maxWidth: 140 }}>
                {p.name}
              </Text>
              <Press
                onPress={() => onChange(people.filter((x) => x.id !== p.id))}
                feedback="tap"
                scaleTo={0.85}
                hitSlop={8}
                accessibilityLabel={`Stop sharing with ${p.name}`}
              >
                <Icon name="close" size={14} color={colors.text2} />
              </Press>
            </Animated.View>
          ))}
        </View>
      ) : null}
      <View style={styles.search}>
        <Icon name="search" size={17} color={colors.text3} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Add people by name or username"
          placeholderTextColor={colors.text3}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Add people"
          style={{ flex: 1, color: colors.text, fontFamily: fonts[400], fontSize: 16, paddingVertical: 0 }}
        />
      </View>
      {options.length ? (
        <View>
          {!q ? (
            <Text variant="footnote" weight={600} color={colors.text2} style={{ marginBottom: 4, marginLeft: 4 }}>
              People you follow
            </Text>
          ) : null}
          {options.map((u) => (
            <Press
              key={u.id}
              onPress={() => {
                onChange([...people, u]);
                setQuery("");
              }}
              feedback="tap"
              scaleTo={1}
              highlight="rgba(255,255,255,0.06)"
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 12 }}
            >
              <Avatar name={u.name} url={u.avatarUrl} accent={u.accent} size={34} />
              <View style={{ flex: 1 }}>
                <Text variant="subhead" weight={500} numberOfLines={1}>
                  {u.name}
                </Text>
                <Text variant="footnote" color={colors.text2} numberOfLines={1}>
                  @{u.username}
                </Text>
              </View>
              <Icon name="plus" size={18} color={colors.tint} />
            </Press>
          ))}
        </View>
      ) : q && found.data ? (
        <Text variant="footnote" color={colors.text2} style={{ marginLeft: 4 }}>
          Nobody here matches “{q}”.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 12 },
  optionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  optionBody: { flex: 1, flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingRight: 14, gap: 10 },
  line: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)" },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  linkField: {
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    justifyContent: "center",
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 34,
    paddingLeft: 5,
    paddingRight: 12,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
  },
});
