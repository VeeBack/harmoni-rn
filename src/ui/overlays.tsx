import { useEffect, useRef, useState, type ReactNode } from "react";
import { BackHandler, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";

import { haptic } from "@/lib/haptics";
import { Icon, type IconName } from "./Icon";
import { Press } from "./Press";
import { Text } from "./Text";
import { colors, fonts, layout, radius } from "./theme";

const EASE = Easing.bezier(0.2, 0.7, 0.2, 1);

// ---------- Toasts ----------

interface Toast {
  id: number;
  message: string;
  kind: "info" | "error";
}

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let toastId = 0;

export function toast(message: string, kind: "info" | "error" = "info") {
  const id = ++toastId;
  if (kind === "error") haptic.reject();
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, kind }] }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
}

/** Bottom offset so toasts sit above the dock; screens can raise it (e.g. Now Playing). */
export const useToastOffset = create<{ bottom: number }>(() => ({ bottom: layout.tabBar + layout.miniPlayer + 24 }));

function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const insets = useSafeAreaInsets();
  const bottom = useToastOffset((s) => s.bottom);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: "flex-end", alignItems: "center", paddingBottom: bottom + insets.bottom, gap: 8 }]}>
      {toasts.map((t) => (
        <Animated.View
          key={t.id}
          entering={FadeIn.duration(240).withInitialValues({ transform: [{ translateY: 8 }] } as never)}
          exiting={FadeOut.duration(200)}
          style={{
            backgroundColor: t.kind === "error" ? colors.danger : colors.accent,
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: radius.pill,
            maxWidth: "88%",
            elevation: 8,
            shadowColor: "#000",
          }}
        >
          <Text weight={500} color={t.kind === "error" ? "#2a0e0a" : colors.accentInk} align="center">
            {t.message}
          </Text>
        </Animated.View>
      ))}
    </View>
  );
}

// ---------- Dialogs (prompt / confirm) ----------

interface DialogSpec {
  title: string;
  note?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirm?: string;
  danger?: boolean;
  field: boolean;
  resolve: (v: string | boolean | undefined) => void;
}

const useDialog = create<{ dialog: DialogSpec | null }>(() => ({ dialog: null }));

export function prompt(opts: { title: string; note?: string; label?: string; defaultValue?: string; placeholder?: string; confirm?: string }): Promise<string | undefined> {
  return new Promise((resolve) =>
    useDialog.setState({ dialog: { ...opts, field: true, resolve: (v) => resolve(typeof v === "string" ? v : undefined) } }),
  );
}

export function confirm(opts: { title: string; note?: string; confirm?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => useDialog.setState({ dialog: { ...opts, field: false, resolve: (v) => resolve(v === true) } }));
}

function DialogHost() {
  const dialog = useDialog((s) => s.dialog);
  const [value, setValue] = useState("");
  const { width } = useWindowDimensions();
  useEffect(() => {
    if (dialog) setValue(dialog.defaultValue ?? "");
  }, [dialog]);
  useEffect(() => {
    if (!dialog) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close(undefined);
      return true;
    });
    return () => sub.remove();
  });
  if (!dialog) return null;
  const close = (v: string | boolean | undefined) => {
    Keyboard.dismiss();
    dialog.resolve(v);
    useDialog.setState({ dialog: null });
  };
  const trimmed = value.trim();
  const disabled = dialog.field && !trimmed;
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center" }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => close(dialog.field ? undefined : false)} />
      <Animated.View
        entering={FadeIn.duration(240).withInitialValues({ transform: [{ translateY: 8 }, { scale: 0.98 }] } as never)}
        style={{
          width: Math.min(420, width - 32),
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderWidth: 1,
          borderRadius: radius.xl,
          padding: 28,
          gap: 20,
          elevation: 24,
        }}
      >
        <View style={{ gap: 8 }}>
          <Text size={24} weight={600}>
            {dialog.title}
          </Text>
          {dialog.note ? (
            <Text size={13} color={colors.text2} style={{ lineHeight: 19 }}>
              {dialog.note}
            </Text>
          ) : null}
        </View>
        {dialog.field ? (
          <View style={{ gap: 6 }}>
            {dialog.label ? (
              <Text size={13} color={colors.text2}>
                {dialog.label}
              </Text>
            ) : null}
            <TextInput
              autoFocus
              value={value}
              onChangeText={setValue}
              maxLength={100}
              placeholder={dialog.placeholder}
              placeholderTextColor={colors.text3}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              onSubmitEditing={() => !disabled && close(trimmed)}
              returnKeyType="done"
              style={{
                height: 48,
                paddingHorizontal: 16,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.borderStrong,
                backgroundColor: colors.surface2,
                color: colors.text,
                fontFamily: fonts[400],
                fontSize: 16,
              }}
            />
          </View>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <Press onPress={() => close(dialog.field ? undefined : false)} style={{ height: 40, paddingHorizontal: 18, borderRadius: 999, justifyContent: "center" }}>
            <Text weight={500} color={colors.text2}>
              Cancel
            </Text>
          </Press>
          <Press
            disabled={disabled}
            feedback="confirm"
            onPress={() => close(dialog.field ? trimmed : true)}
            style={{
              height: 40,
              paddingHorizontal: 18,
              borderRadius: 999,
              justifyContent: "center",
              backgroundColor: dialog.danger ? colors.danger : colors.accent,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text weight={500} color={dialog.danger ? "#2a0d08" : colors.accentInk}>
              {dialog.confirm ?? (dialog.field ? "Save" : "OK")}
            </Text>
          </Press>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ---------- Menus (action sheets) ----------

export type MenuItem =
  | {
      label: string;
      icon?: IconName;
      detail?: string;
      checked?: boolean;
      disabled?: boolean;
      danger?: boolean;
      keepOpen?: boolean;
      onPress?: () => void;
      submenu?: () => MenuItem[];
    }
  | "divider";

interface MenuSpec {
  header?: ReactNode;
  items: MenuItem[] | (() => MenuItem[]);
  label?: string;
}

const useMenu = create<{ menu: MenuSpec | null; version: number }>(() => ({ menu: null, version: 0 }));

export function openMenu(spec: MenuSpec) {
  haptic.contextClick();
  useMenu.setState((s) => ({ menu: spec, version: s.version + 1 }));
}

export function closeMenu() {
  useMenu.setState({ menu: null });
}

/** Re-render an open menu (after a keepOpen item changes state). */
export function refreshMenu() {
  useMenu.setState((s) => ({ version: s.version + 1 }));
}

function MenuHost() {
  const { menu, version } = useMenu();
  const [shown, setShown] = useState<MenuSpec | null>(null);
  const [stack, setStack] = useState<{ title: string; items: () => MenuItem[] }[]>([]);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const y = useSharedValue(600);
  const backdrop = useSharedValue(0);
  const sheetH = useRef(400);
  void version;

  useEffect(() => {
    if (menu) {
      setShown(menu);
      setStack([]);
      y.value = sheetH.current + 40;
      backdrop.value = withTiming(1, { duration: 240 });
      y.value = withTiming(0, { duration: 320, easing: EASE });
    } else if (shown) {
      backdrop.value = withTiming(0, { duration: 200 });
      y.value = withTiming(sheetH.current + 40, { duration: 220, easing: Easing.in(Easing.quad) }, (done) => {
        if (done) runOnJS(setShown)(null);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stack.length) setStack((s) => s.slice(0, -1));
      else closeMenu();
      return true;
    });
    return () => sub.remove();
  }, [menu, stack.length]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 800) runOnJS(closeMenu)();
      else y.value = withSpring(0, { damping: 20, stiffness: 240 });
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  if (!shown) return null;
  const top = stack[stack.length - 1];
  const base = typeof shown.items === "function" ? shown.items() : shown.items;
  const items: MenuItem[] = top ? top.items() : base;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={menu ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)" }, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} accessibilityLabel="Close menu" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          onLayout={(e) => (sheetH.current = e.nativeEvent.layout.height)}
          accessibilityLabel={shown.label}
          style={[
            {
              position: "absolute",
              left: 8,
              right: 8,
              bottom: 8 + insets.bottom,
              maxHeight: height * 0.7,
              borderRadius: radius.xl,
              padding: 8,
              backgroundColor: "rgba(40,38,36,0.97)",
              elevation: 24,
            },
            sheetStyle,
          ]}
        >
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)", marginBottom: 6, marginTop: 2 }} />
          <ScrollView bounces={false} overScrollMode="never" showsVerticalScrollIndicator={false}>
            {top ? (
              <>
                <MenuRow item={{ label: top.title, icon: "arrow-left" }} onPress={() => setStack((s) => s.slice(0, -1))} />
                <Divider />
              </>
            ) : shown.header ? (
              <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 }}>{shown.header}</View>
            ) : null}
            {items.map((item, i) =>
              item === "divider" ? (
                <Divider key={`d${i}`} />
              ) : (
                <MenuRow
                  key={`${item.label}${i}`}
                  item={item}
                  onPress={() => {
                    if (item.disabled) return;
                    if (item.submenu) {
                      haptic.tick();
                      setStack((s) => [...s, { title: item.label, items: item.submenu! }]);
                      return;
                    }
                    if (!item.keepOpen) closeMenu();
                    else haptic.select();
                    item.onPress?.();
                    if (item.keepOpen) refreshMenu();
                  }}
                />
              ),
            )}
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.borderStrong, marginVertical: 6, marginHorizontal: 4 }} />;
}

function MenuRow({ item, onPress }: { item: Exclude<MenuItem, "divider">; onPress: () => void }) {
  const color = item.danger ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={item.disabled}
      android_ripple={{ color: "rgba(255,255,255,0.08)", foreground: true }}
      style={({ pressed }) => ({
        minHeight: 52,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        borderRadius: radius.md,
        overflow: "hidden",
        opacity: item.disabled ? 0.6 : 1,
        backgroundColor: pressed ? "rgba(255,255,255,0.06)" : "transparent",
      })}
    >
      {item.icon ? <Icon name={item.icon} size={21} color={item.danger ? colors.danger : colors.text2} /> : null}
      <View style={{ flex: 1, paddingVertical: item.detail ? 8 : 0 }}>
        <Text size={17} color={color} numberOfLines={1}>
          {item.label}
        </Text>
        {item.detail ? (
          <Text size={13} color={colors.text2} numberOfLines={2} style={{ lineHeight: 17 }}>
            {item.detail}
          </Text>
        ) : null}
      </View>
      {item.checked ? <Icon name="check" size={22} color={colors.accent} /> : null}
      {item.submenu ? <Icon name="arrow-right" size={18} color={colors.text3} /> : null}
    </Pressable>
  );
}

/** Mount once at the root, above everything. */
export function OverlayHost() {
  return (
    <>
      <MenuHost />
      <DialogHost />
      <ToastHost />
    </>
  );
}
