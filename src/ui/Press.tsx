import { type ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { haptic } from "@/lib/haptics";
import { spring } from "./theme";

const APressable = Animated.createAnimatedComponent(Pressable);

export interface PressProps extends Omit<PressableProps, "style" | "children"> {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** How far it shrinks while held (1 = not at all). */
  scaleTo?: number;
  /** Haptic on press: "tap" by default for buttons; false for rows. */
  feedback?: keyof typeof haptic | false;
  ripple?: boolean | string;
  rippleBorderless?: boolean;
  /** Highlight with a fill while held (rows), instead of or as well as shrinking. */
  highlight?: string;
  /** Dim while held (glyph buttons, like iOS). */
  dim?: boolean;
}

/** A pressable that gives way under the finger, with a haptic on tap. */
export function Press({ style, children, scaleTo = 0.96, feedback = "tap", ripple, rippleBorderless, highlight, dim, onPressIn, onPressOut, onPress, onLongPress, ...rest }: PressProps) {
  const scale = useSharedValue(1);
  const held = useSharedValue(0);
  const animated = useAnimatedStyle(() => {
    const st: Record<string, unknown> = { transform: [{ scale: scale.value }] };
    if (highlight) st.backgroundColor = interpolateColor(held.value, [0, 1], ["rgba(255,255,255,0)", highlight]);
    if (dim) st.opacity = 1 - held.value * 0.55;
    return st;
  });
  return (
    <APressable
      {...rest}
      android_ripple={
        ripple
          ? { color: typeof ripple === "string" ? ripple : "rgba(255,255,255,0.08)", borderless: rippleBorderless, foreground: true }
          : undefined
      }
      onPressIn={(e) => {
        if (scaleTo !== 1) scale.value = withSpring(scaleTo, spring.press);
        if (highlight || dim) held.value = withTiming(1, { duration: 80 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (scaleTo !== 1) scale.value = withSpring(1, spring.snappy);
        if (highlight || dim) held.value = withTiming(0, { duration: 260 });
        onPressOut?.(e);
      }}
      onPress={
        onPress
          ? (e) => {
              if (feedback) haptic[feedback]();
              onPress(e);
            }
          : undefined
      }
      onLongPress={
        onLongPress
          ? (e) => {
              haptic.longPress();
              onLongPress(e);
            }
          : undefined
      }
      delayLongPress={350}
      style={[style, animated]}
    >
      {children}
    </APressable>
  );
}

export function IconButton({
  children,
  onPress,
  size = 44,
  label,
  style,
  disabled,
  onLongPress,
  feedback = "tap",
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  size?: number;
  label: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  feedback?: keyof typeof haptic | false;
}) {
  return (
    <Press
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      disabled={disabled}
      scaleTo={0.88}
      feedback={feedback}
      ripple
      rippleBorderless
      style={[{ width: size, height: size, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }, style]}
    >
      {children}
    </Press>
  );
}
