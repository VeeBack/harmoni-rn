import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, TextInput, View } from "react-native";
import Animated, { FadeIn, LinearTransition, ZoomIn, ZoomOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Api } from "@/api/endpoints";
import type { Song, Spice } from "@/api/types";
import { haptic } from "@/lib/haptics";
import { streamSearch } from "@/search/stream";
import { useDockHeight } from "@/shell/layout";
import { libraryChanged } from "@/state/collections";
import { Artwork } from "@/ui/Artwork";
import { ExplicitBadge, SongRowsSkeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { toast } from "@/ui/overlays";
import { Press } from "@/ui/Press";
import { Screen } from "@/ui/Screen";
import { Spinner } from "@/ui/Spinner";
import { Text } from "@/ui/Text";
import { colors, fonts } from "@/ui/theme";
import { autoName, useSpiceDraft } from "./draft";
import { SpiceArt } from "./SpiceArt";

/** New Spice (no `spice`) or Change seeds (with one). */
export function SeedPicker({ spice }: { spice?: Spice }) {
  const insets = useSafeAreaInsets();
  const dock = useDockHeight();
  const [picked, setPicked] = useState<Song[]>(() => (spice ? spice.seeds : useSpiceDraft.getState().seeds));
  const [name, setName] = useState(spice && !spice.autoNamed ? spice.name : "");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Song[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nameFocus, setNameFocus] = useState(false);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const suggestions = useQuery({ queryKey: ["spice-suggestions"], queryFn: Api.spiceSuggestions });

  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    if (!query) {
      setResults(null);
      return;
    }
    const abort = new AbortController();
    setSearching(true);
    streamSearch(
      query,
      (s) => {
        if (abort.signal.aborted) return;
        if (s.results.length || s.done) setResults(s.results);
        if (s.done) setSearching(false);
      },
      abort.signal,
    ).catch(() => !abort.signal.aborted && setSearching(false));
    return () => abort.abort();
  }, [query]);

  const isPicked = (s: Song) => picked.some((p) => p.id === s.id);
  const toggle = (s: Song) => {
    if (isPicked(s)) {
      haptic.toggleOff();
      setPicked((p) => p.filter((x) => x.id !== s.id));
    } else {
      if (picked.length >= 50) return toast("That's plenty: 50 songs at most.");
      haptic.toggleOn();
      setPicked((p) => [...p, s]);
    }
  };

  const auto = autoName(picked);
  const shownName = name.trim() || (picked.length ? auto : "Your Spice");
  const list = query ? results : (suggestions.data ?? null);

  const done = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    Keyboard.dismiss();
    try {
      if (!spice) {
        const s = await Api.createSpice(
          picked.map((p) => p.id),
          name.trim() || undefined,
        );
        useSpiceDraft.setState({ seeds: [] });
        libraryChanged();
        router.replace(`/spice/${s.id}`);
      } else {
        await Api.setSeeds(
          spice.id,
          picked.map((p) => p.id),
        );
        const wanted = name.trim() || null;
        const had = spice.autoNamed ? null : spice.name;
        if (wanted !== had) await Api.renameSpice(spice.id, wanted);
        libraryChanged();
        router.back();
      }
    } catch {
      toast(spice ? "Couldn't save that. Try again?" : "Couldn't create the Spice.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
      <Screen back keyboardShouldPersistTaps="handled">
        <View style={{ paddingTop: 8, marginBottom: 24 }}>
          <Text size={13} weight={500} color={colors.text2}>
            {spice ? spice.name : "New Spice"}
          </Text>
          <Text size={32} weight={700} style={{ letterSpacing: -0.96, lineHeight: 34, marginTop: 6, marginBottom: 10 }}>
            {spice ? "Change what it grows from" : "What should it taste like?"}
          </Text>
          <Text color={colors.text2} style={{ lineHeight: 21 }}>
            {spice ? "Add songs or take some away. It remakes itself from them the next time you open it." : "Pick a few songs you love. Harmoni grows a mix from them, and makes it fresh every day."}
          </Text>
        </View>

        {picked.length ? (
          <Animated.View layout={LinearTransition.duration(200)} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {picked.map((s) => (
              <Animated.View key={s.id} entering={ZoomIn.duration(240).withInitialValues({ transform: [{ scale: 0.92 }] } as never)} exiting={ZoomOut.duration(160)} layout={LinearTransition.duration(200)} style={{ height: 40, borderRadius: 999, backgroundColor: colors.surface2, paddingLeft: 6, paddingRight: 4, flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "100%" }}>
                <Artwork url={s.artworkUrl} size={28} round />
                <Text size={13} weight={500} numberOfLines={1} style={{ maxWidth: 170 }}>
                  {s.title}
                </Text>
                <Press onPress={() => toggle(s)} feedback={false} scaleTo={0.85} accessibilityLabel={`Remove ${s.title}`} style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="close" size={14} color={colors.text2} />
                </Press>
              </Animated.View>
            ))}
          </Animated.View>
        ) : null}

        <View style={{ height: 48, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", flexDirection: "row", alignItems: "center", paddingLeft: 17, paddingRight: 6, gap: 10, marginBottom: 28 }}>
          <Icon name="search" size={18} color={colors.text2} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            placeholder="Search for a song to add"
            placeholderTextColor={colors.text3}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            returnKeyType="search"
            autoCorrect={false}
            onSubmitEditing={() => Keyboard.dismiss()}
            style={{ flex: 1, color: colors.text, fontFamily: fonts[400], fontSize: 16, paddingVertical: 0 }}
          />
          {searching ? <Spinner size={18} color={colors.text2} /> : null}
          {text ? (
            <Press onPress={() => setText("")} accessibilityLabel="Clear" scaleTo={0.85} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
              <Icon name="close" size={18} color={colors.text2} />
            </Press>
          ) : null}
        </View>

        <Text size={18} weight={600} style={{ marginBottom: 12 }}>
          {query ? "Songs" : "From your listening"}
        </Text>
        {!list ? (
          <SongRowsSkeleton n={6} />
        ) : !list.length ? (
          <Text color={colors.text2} style={{ paddingVertical: 24, lineHeight: 21 }}>
            {query ? `Nothing turned up for “${query}”. Try the artist's name on its own.` : "Start by searching for a song you love. Once you've been listening a while, your favourites show up here to pick from."}
          </Text>
        ) : (
          <Animated.View entering={FadeIn.duration(200)}>
            {list.map((s) => (
              <PickRow key={s.id} song={s} picked={isPicked(s)} onPress={() => toggle(s)} />
            ))}
          </Animated.View>
        )}
        <View style={{ height: 120 }} />
      </Screen>

      <View style={{ position: "absolute", left: 16, right: 16, bottom: dock + 12 - insets.bottom + insets.bottom, borderRadius: 16, backgroundColor: "rgba(36,36,36,0.97)", padding: 10, flexDirection: "row", alignItems: "center", gap: 12, elevation: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
        <View style={{ width: 48, height: 48, borderRadius: 8, overflow: "hidden" }}>
          <SpiceArt name={shownName} covers={picked.map((p) => p.artworkUrl).filter(Boolean) as string[]} label={false} />
        </View>
        <View style={{ flex: 1 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder={picked.length ? auto : "Your Spice"}
            placeholderTextColor={nameFocus ? colors.text3 : colors.text}
            onFocus={() => setNameFocus(true)}
            onBlur={() => setNameFocus(false)}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            accessibilityLabel="Name (optional)"
            style={{ color: colors.text, fontFamily: fonts[600], fontSize: 16, paddingVertical: 0, borderBottomWidth: nameFocus ? 1 : 0, borderColor: colors.borderStrong }}
          />
          <Text size={13} color={colors.text2}>
            {!picked.length ? "Pick a song to start" : picked.length < 3 ? "Add a couple more" : "Ready when you are"}
          </Text>
        </View>
        <Press
          onPress={done}
          disabled={!picked.length || busy}
          feedback="confirm"
          scaleTo={0.95}
          style={{ height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", gap: 8, opacity: !picked.length || busy ? 0.4 : 1 }}
        >
          {busy ? <Spinner size={18} color={colors.accentInk} /> : <Icon name="spice" size={18} color={colors.accentInk} />}
          <Text weight={600} color={colors.accentInk}>
            {spice ? "Save" : "Make it"}
          </Text>
        </Press>
      </View>
    </KeyboardAvoidingView>
  );
}

function PickRow({ song, picked, onPress }: { song: Song; picked: boolean; onPress: () => void }) {
  return (
    <Press onPress={onPress} feedback={false} scaleTo={0.985} ripple style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8, paddingHorizontal: 12, marginHorizontal: -12, borderRadius: 12, overflow: "hidden" }}>
      <Artwork url={song.artworkUrl} size={44} radius={8} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text weight={500} numberOfLines={1} style={{ flexShrink: 1 }}>
            {song.title}
          </Text>
          {song.explicit ? <ExplicitBadge /> : null}
        </View>
        <Text size={13} color={colors.text2} numberOfLines={1}>
          {song.artists.map((a) => a.name).join(", ")}
        </Text>
      </View>
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: picked ? colors.accent : "transparent", borderWidth: picked ? 0 : 1.5, borderColor: colors.borderStrong }}>
        <Icon name={picked ? "check" : "plus"} size={16} color={picked ? colors.accentInk : colors.text2} />
      </View>
    </Press>
  );
}
