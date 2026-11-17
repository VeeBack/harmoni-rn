import { type ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { haptic } from "@/lib/haptics";

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
}

/** A pressable that gives way under the finger, with a haptic on tap. */
export function Press({ style, children, scaleTo = 0.96, feedback = "tap", ripple, rippleBorderless, onPressIn, onPressOut, onPress, onLongPress, ...rest }: PressProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <APressable
      {...rest}
      android_ripple={
        ripple
          ? { color: typeof ripple === "string" ? ripple : "rgba(255,255,255,0.08)", borderless: rippleBorderless, foreground: true }
          : undefined
      }
      onPressIn={(e) => {
        if (scaleTo !== 1) scale.value = withTiming(scaleTo, { duration: 90 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (scaleTo !== 1) scale.value = withSpring(1, { damping: 14, stiffness: 260, mass: 0.6 });
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
