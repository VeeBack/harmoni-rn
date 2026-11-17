import { LinearGradient } from "expo-linear-gradient";
import { router, useNavigation } from "expo-router";
import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from "react";
import { RefreshControl, StyleSheet, View, type ScrollViewProps } from "react-native";
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { registerScrollToTop } from "@/shell/state";
import { TOPBAR, useContentBottom } from "@/shell/layout";
import { useSession } from "@/state/session";
import { Icon } from "./Icon";
import { IconButton, Press } from "./Press";
import { Text } from "./Text";
import { colors } from "./theme";

/** The phone top bar: wordmark (or back) on the left, avatar on the right, over a soft fade. */
export function TopBar({
  back,
  title,
  scrollY,
  titleAt = 160,
  center,
  right,
}: {
  back?: boolean;
  title?: string;
  scrollY?: SharedValue<number>;
  titleAt?: number;
  center?: ReactNode;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const titleStyle = useAnimatedStyle(() => {
    if (!scrollY || !title) return { opacity: 0 };
    return {
      opacity: interpolate(scrollY.value, [titleAt - 40, titleAt], [0, 1], "clamp"),
      transform: [{ translateY: interpolate(scrollY.value, [titleAt - 40, titleAt], [6, 0], "clamp") }],
    };
  });
  const wordStyle = useAnimatedStyle(() => {
    if (!scrollY || !title) return { opacity: 1 };
    return { opacity: interpolate(scrollY.value, [titleAt - 60, titleAt - 20], [1, 0], "clamp") };
  });
  return (
    <View pointerEvents="box-none" style={[styles.bar, { paddingTop: insets.top, height: TOPBAR + insets.top }]}>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(18,18,18,0.97)", "rgba(18,18,18,0.88)", "rgba(18,18,18,0)"]}
        locations={[0, 0.62, 1]}
        style={[StyleSheet.absoluteFill, { bottom: -28 }]}
      />
      {back ? (
        <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.navigate("/"))} size={40} style={{ marginLeft: -8 }}>
          <Icon name="arrow-left" size={24} />
        </IconButton>
      ) : null}
      {center ?? (
        <View style={{ flex: 1, alignSelf: "stretch", justifyContent: "center" }}>
          {back && title ? null : (
            <Animated.View style={wordStyle}>
              <Press feedback="tap" scaleTo={0.97} onPress={() => router.navigate("/")} style={{ alignSelf: "flex-start" }} accessibilityLabel="Harmoni, home">
                <Text size={18} weight={600} style={{ letterSpacing: -0.2 }}>
                  Harmoni
                </Text>
              </Press>
            </Animated.View>
          )}
          {title ? (
            <Animated.View style={[StyleSheet.absoluteFill, { justifyContent: "center" }, titleStyle]} pointerEvents="none">
              <Text size={17} weight={600} numberOfLines={1}>
                {title}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      )}
      {right}
      <Press
        onPress={() => router.navigate("/settings")}
        accessibilityLabel="Settings"
        scaleTo={0.9}
        style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}
      >
        <Text weight={600} color={colors.accentInk}>
          {me?.name?.trim()?.[0]?.toUpperCase() ?? "·"}
        </Text>
      </Press>
    </View>
  );
}

export interface ScreenHandle {
  scrollToTop: () => void;
}

/** A scrolling page under the top bar and over the dock. */
export const Screen = forwardRef<
  ScreenHandle,
  {
    children: ReactNode;
    back?: boolean;
    title?: string;
    titleAt?: number;
    tab?: string;
    refreshing?: boolean;
    onRefresh?: () => void;
    padded?: boolean;
    bleedTop?: boolean;
    topBar?: ReactNode;
    scrollY?: SharedValue<number>;
  } & Pick<ScrollViewProps, "keyboardShouldPersistTaps" | "onScrollBeginDrag">
>(function Screen({ children, back, title, titleAt, tab, refreshing, onRefresh, padded = true, bleedTop, topBar, scrollY: externalY, ...rest }, ref) {
  const insets = useSafeAreaInsets();
  const bottom = useContentBottom();
  const scroll = useRef<Animated.ScrollView>(null);
  const ownY = useSharedValue(0);
  const y = externalY ?? ownY;
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const nav = useNavigation();
  const toTop = () => scroll.current?.scrollTo({ y: 0, animated: true });
  useImperativeHandle(ref, () => ({ scrollToTop: toTop }));
  useEffect(() => {
    if (!tab) return;
    const off = registerScrollToTop(tab, toTop);
    return off;
  }, [tab]);
  void nav;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Animated.ScrollView
        ref={scroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} progressViewOffset={insets.top + TOPBAR} tintColor={colors.accent} colors={[colors.accentInk]} progressBackgroundColor={colors.accent} />
          ) : undefined
        }
        contentContainerStyle={{
          paddingTop: bleedTop ? 0 : insets.top + TOPBAR + 4,
          paddingBottom: bottom,
          paddingHorizontal: padded ? 16 : 0,
        }}
        {...rest}
      >
        {children}
      </Animated.ScrollView>
      {topBar ?? <TopBar back={back} title={title} scrollY={y} titleAt={titleAt} />}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 },
});

export function PageTitle({ children, subtitle }: { children: string; subtitle?: string }) {
  return (
    <View style={{ marginTop: 12, marginBottom: subtitle ? 20 : 4 }}>
      <Text size={32} weight={700} style={{ letterSpacing: -0.64, lineHeight: 38 }}>
        {children}
      </Text>
      {subtitle ? (
        <Text color={colors.text2} style={{ marginTop: 4 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
