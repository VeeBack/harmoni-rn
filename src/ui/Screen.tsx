import { BlurTargetView } from "expo-blur";
import { router } from "expo-router";
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from "react";
import { RefreshControl, StyleSheet, View, type ScrollViewProps } from "react-native";
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { profilePath } from "@/lib/share";
import { Avatar } from "@/profile/Avatar";
import { registerScrollToTop } from "@/shell/state";
import { TOPBAR, useContentBottom } from "@/shell/layout";
import { useSession } from "@/state/session";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { Material } from "./Material";
import { Press } from "./Press";
import { Text } from "./Text";
import { colors } from "./theme";

type Target = RefObject<ComponentRef<typeof View> | null>;
/** The content behind floating chrome (nav bar, tab bar), for materials to blur. */
export const BlurTargetContext = createContext<Target | null>(null);

/**
 * The navigation bar, iOS-style: clear at the top of the page; once content
 * scrolls under it, a blurred material and hairline fade in and the inline title
 * appears (the large title has scrolled away by then).
 */
export function TopBar({
  left,
  back,
  title,
  scrollY,
  titleAt = 44,
  center,
  right,
  avatar = !back && !left,
  target,
  alwaysSolid,
  fill,
}: {
  /** Fills the bar, left to right (a search field). */
  fill?: ReactNode;
  /** Instead of the back button (Cancel while editing). */
  left?: ReactNode;
  back?: boolean;
  title?: string;
  scrollY?: SharedValue<number>;
  /** Scroll offset at which the inline title appears. */
  titleAt?: number;
  center?: ReactNode;
  right?: ReactNode;
  avatar?: boolean;
  target?: Target | null;
  alwaysSolid?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const ctxTarget = useContext(BlurTargetContext);
  const blurTarget = target ?? ctxTarget;
  const me = useSession((s) => s.me);
  const barStyle = useAnimatedStyle(() => ({
    opacity: alwaysSolid ? 1 : scrollY ? interpolate(scrollY.value, [0, 14], [0, 1], "clamp") : 0,
  }));
  const titleStyle = useAnimatedStyle(() => {
    if (!scrollY || !title) return { opacity: 0 };
    return {
      opacity: interpolate(scrollY.value, [titleAt - 12, titleAt + 6], [0, 1], "clamp"),
      transform: [{ translateY: interpolate(scrollY.value, [titleAt - 12, titleAt + 6], [4, 0], "clamp") }],
    };
  });
  return (
    <View pointerEvents="box-none" style={[styles.bar, { paddingTop: insets.top, height: TOPBAR + insets.top }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, barStyle]}>
        <Material target={blurTarget ?? undefined} />
        <View style={styles.hairline} />
      </Animated.View>
      {fill ? (
        <View style={{ flex: 1 }}>{fill}</View>
      ) : (
        <View style={styles.side}>
          {left ??
            (back ? (
              <Press
                onPress={() => (router.canGoBack() ? router.back() : router.navigate("/"))}
                accessibilityRole="button"
                accessibilityLabel="Back"
                scaleTo={1}
                dim
                hitSlop={12}
                style={{ width: 44, height: 44, marginLeft: -12, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="chevron-left" size={26} color={colors.text} />
              </Press>
            ) : avatar ? (
              <Wordmark />
            ) : null)}
        </View>
      )}
      {fill ? null : (
        <View pointerEvents="box-none" style={styles.middle}>
          {center ??
            (title ? (
              <Animated.View style={titleStyle} pointerEvents="none">
                <Text variant="headline" numberOfLines={1} align="center">
                  {title}
                </Text>
              </Animated.View>
            ) : null)}
        </View>
      )}
      <View style={[styles.side, fill ? { minWidth: 0 } : null, { justifyContent: "flex-end", gap: 4 }]}>
        {right}
        {avatar ? (
          <Press
            onPress={() => (me?.username ? router.navigate(profilePath(me.username) as never) : router.navigate("/settings"))}
            accessibilityLabel="Your profile"
            scaleTo={0.9}
            style={{ marginLeft: 6 }}
          >
            <Avatar name={me?.name ?? ""} url={me?.avatarUrl} accent={me?.accent} size={32} />
          </Press>
        ) : null}
      </View>
    </View>
  );
}

/** Harmoni's bars and name, top left on the tab pages (the web's phone top bar). */
function Wordmark() {
  return (
    <View accessible accessibilityLabel="Harmoni" style={{ flexDirection: "row", alignItems: "center", gap: 5, marginLeft: -4 }}>
      <Logo size={24} bare />
      <Text variant="headline" weight={700} style={{ letterSpacing: -0.4 }}>
        Harmoni
      </Text>
    </View>
  );
}

export interface ScreenHandle {
  scrollToTop: () => void;
}

/** A scrolling page under the navigation bar and over the dock, with an optional large title. */
export const Screen = forwardRef<
  ScreenHandle,
  {
    children: ReactNode;
    back?: boolean;
    title?: string;
    /** Shows the title large at the top of the page (iOS large title); it moves into the bar on scroll. */
    large?: boolean;
    titleAt?: number;
    tab?: string;
    refreshing?: boolean;
    onRefresh?: () => void;
    padded?: boolean;
    bleedTop?: boolean;
    topBar?: ReactNode;
    right?: ReactNode;
    left?: ReactNode;
    scrollY?: SharedValue<number>;
  } & Pick<ScrollViewProps, "keyboardShouldPersistTaps" | "onScrollBeginDrag">
>(function Screen(
  {
    children,
    back,
    title,
    large,
    titleAt,
    tab,
    refreshing,
    onRefresh,
    padded = true,
    bleedTop,
    topBar,
    right,
    left,
    scrollY: externalY,
    ...rest
  },
  ref,
) {
  const insets = useSafeAreaInsets();
  const bottom = useContentBottom();
  const scroll = useRef<Animated.ScrollView>(null);
  const target = useRef<ComponentRef<typeof View>>(null);
  const ownY = useSharedValue(0);
  const y = externalY ?? ownY;
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const toTop = () => scroll.current?.scrollTo({ y: 0, animated: true });
  useImperativeHandle(ref, () => ({ scrollToTop: toTop }));
  useEffect(() => {
    if (!tab) return;
    return registerScrollToTop(tab, toTop);
  }, [tab]);

  // The large title shrinks a touch when pulled down past the top, like iOS.
  const largeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(y.value, [-120, 0], [1.08, 1], "clamp") }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <BlurTargetContext.Provider value={target}>
        <BlurTargetView ref={target} style={{ flex: 1, backgroundColor: colors.bg }}>
          <Animated.ScrollView
            ref={scroll}
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={!!refreshing}
                  onRefresh={onRefresh}
                  progressViewOffset={insets.top + TOPBAR}
                  tintColor={colors.accent}
                  colors={[colors.accentInk]}
                  progressBackgroundColor={colors.accent}
                />
              ) : undefined
            }
            contentContainerStyle={{
              paddingTop: bleedTop ? 0 : insets.top + TOPBAR,
              paddingBottom: bottom,
              paddingHorizontal: padded ? 20 : 0,
            }}
            {...rest}
          >
            {large && title ? (
              <Animated.View style={[{ transformOrigin: "left center", marginTop: 2, marginBottom: 8 }, largeStyle]}>
                <Text variant="largeTitle">{title}</Text>
              </Animated.View>
            ) : null}
            {children}
          </Animated.ScrollView>
        </BlurTargetView>
        {topBar ?? (
          <TopBar back={back} left={left} title={title} scrollY={y} titleAt={titleAt ?? (large ? 44 : 160)} right={right} target={target} />
        )}
      </BlurTargetContext.Provider>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 20 },
  hairline: { position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  side: { minWidth: 72, flexDirection: "row", alignItems: "center" },
  middle: { flex: 1, alignItems: "center", justifyContent: "center", alignSelf: "stretch" },
});

/** A large title at the top of a page that doesn't use Screen's own. */
export function PageTitle({ children, subtitle }: { children: string; subtitle?: string }) {
  return (
    <View style={{ marginTop: 2, marginBottom: subtitle ? 20 : 8 }}>
      <Text variant="largeTitle">{children}</Text>
      {subtitle ? (
        <Text variant="subhead" color={colors.text2} style={{ marginTop: 4 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
