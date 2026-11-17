import { memo, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

import { Api } from "@/api/endpoints";
import type { QueueSong } from "@/api/types";
import { artistLine } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { usePlayback } from "@/player/hooks";
import { dropAutoplaySongs, player } from "@/player/player";
import { useSession } from "@/state/session";
import { Artwork } from "@/ui/Artwork";
import { Switch } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { toast } from "@/ui/overlays";

const ROW = 64;
const W = (a: number) => `rgba(255,255,255,${a})`;
const PAGE = 40;

interface Item {
  key: string;
  song: QueueSong;
  at: number; // index in the queue
}

export function QueueView() {
  const pb = usePlayback();
  const [limit, setLimit] = useState(PAGE);
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const { yours, suggested } = useMemo(() => {
    const y: Item[] = [];
    const s: Item[] = [];
    pb.queue.forEach((song, i) => {
      if (i <= pb.index) return;
      const item = { key: `${song.id}:${i}`, song, at: i };
      if (song.autoplay) s.push(item);
      else y.push(item);
    });
    return { yours: y, suggested: s };
  }, [pb.queue, pb.index]);
  const yoursShown = yours.slice(0, limit);

  const autoplay = !!me?.autoplay;
  const serverAutoplay = me?.server.features.autoplay ?? true;
  const toggleAutoplay = async (on: boolean) => {
    if (!me) return;
    setMe({ ...me, autoplay: on });
    if (!on) dropAutoplaySongs();
    try {
      setMe(await Api.updateMe({ autoplay: on }));
    } catch {
      setMe({ ...me, autoplay: !on });
      toast("Couldn't change autoplay.", "error");
    }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
      <Text size={18} weight={600} style={{ marginBottom: 12 }}>
        {yours.length ? "Up next" : "Nothing queued after this one."}
      </Text>
      {yours.length ? <Reorderable items={yoursShown} /> : null}
      {yours.length > limit ? (
        <Press onPress={() => setLimit((l) => l + PAGE)} feedback="tap" scaleTo={0.97} style={{ alignSelf: "flex-start", paddingVertical: 10, paddingHorizontal: 10 }}>
          <Text size={13} weight={600} color={W(0.8)}>
            Show more ({(yours.length - limit).toLocaleString()} left)
          </Text>
        </Press>
      ) : null}
      {serverAutoplay ? (
        <View style={{ marginTop: 28, marginBottom: 12, paddingTop: yours.length ? 24 : 0, borderTopWidth: yours.length ? 1 : 0, borderColor: W(0.12), flexDirection: "row", alignItems: "center", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text size={18} weight={600}>
              Autoplay
            </Text>
            <Text size={13} color={W(0.65)} style={{ lineHeight: 18 }}>
              {autoplay ? "Similar songs keep playing when your queue ends." : "Turn on to keep playing similar songs when your queue ends."}
            </Text>
          </View>
          <Switch value={autoplay} onChange={toggleAutoplay} light />
        </View>
      ) : null}
      {autoplay && suggested.length ? <Reorderable items={suggested.slice(0, PAGE)} /> : null}
    </ScrollView>
  );
}

function Reorderable({ items }: { items: Item[] }) {
  const dragging = useSharedValue(-1);
  const dy = useSharedValue(0);
  const commit = (from: number, to: number) => {
    if (from === to) return;
    const a = items[from];
    const b = items[to];
    if (!a || !b) return;
    haptic.gestureEnd();
    player.moveInQueue(a.at, b.at);
  };
  return (
    <View style={{ height: items.length * ROW }}>
      {items.map((item, i) => (
        <Row key={item.key} item={item} i={i} count={items.length} dragging={dragging} dy={dy} onCommit={commit} />
      ))}
    </View>
  );
}

const Row = memo(function Row({ item, i, count, dragging, dy, onCommit }: { item: Item; i: number; count: number; dragging: SharedValue<number>; dy: SharedValue<number>; onCommit: (from: number, to: number) => void }) {
  const lift = useSharedValue(0);
  const grip = Gesture.Pan()
    .minDistance(0)
    .onBegin(() => {
      dragging.value = i;
      dy.value = 0;
      lift.value = withTiming(1, { duration: 140 });
      runOnJS(haptic.dragStart)();
    })
    .onUpdate((e) => {
      dy.value = e.translationY;
    })
    .onFinalize(() => {
      const target = Math.max(0, Math.min(count - 1, Math.round((i * ROW + dy.value) / ROW)));
      lift.value = withTiming(0, { duration: 160 });
      if (dragging.value === i) {
        runOnJS(onCommit)(i, target);
        dy.value = withTiming((target - i) * ROW, { duration: 160 }, () => {
          dragging.value = -1;
          dy.value = 0;
        });
      }
    });

  const style = useAnimatedStyle(() => {
    const d = dragging.value;
    if (d === i) return { transform: [{ translateY: dy.value }], zIndex: 2, backgroundColor: `rgba(255,255,255,${0.16 * lift.value})` };
    if (d < 0) return { transform: [{ translateY: 0 }], zIndex: 0, backgroundColor: "transparent" };
    const target = Math.max(0, Math.min(count - 1, Math.round((d * ROW + dy.value) / ROW)));
    let shift = 0;
    if (d < i && i <= target) shift = -ROW;
    else if (target <= i && i < d) shift = ROW;
    return { transform: [{ translateY: withTiming(shift, { duration: 220 }) }], zIndex: 0, backgroundColor: "transparent" };
  });

  return (
    <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: i * ROW, height: ROW, borderRadius: 12 }, style]}>
      <Press
        onPress={() => player.jumpTo(item.at)}
        feedback="tap"
        scaleTo={0.985}
        ripple="rgba(255,255,255,0.1)"
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 10, borderRadius: 12, overflow: "hidden" }}
      >
        <Artwork url={item.song.artworkUrl} size={48} radius={8} />
        <View style={{ flex: 1 }}>
          <Text weight={500} numberOfLines={1} color="#fff">
            {item.song.title}
          </Text>
          <Text size={13} color={W(0.65)} numberOfLines={1}>
            {artistLine(item.song)}
          </Text>
        </View>
        <Press onPress={() => player.removeFromQueue(item.at)} feedback="tap" scaleTo={0.85} accessibilityLabel={`Remove ${item.song.title} from queue`} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", opacity: 0.7 }}>
          <Icon name="close" size={20} color="#fff" />
        </Press>
        <GestureDetector gesture={grip}>
          <View accessibilityLabel={`Move ${item.song.title}`} style={{ width: 36, height: 44, alignItems: "center", justifyContent: "center", opacity: 0.7 }}>
            <Icon name="grip" size={20} color="#fff" />
          </View>
        </GestureDetector>
      </Press>
    </Animated.View>
  );
});
