import { ActivityIndicator, View, type StyleProp, type ViewStyle } from "react-native";

import { Icon, type IconName } from "./Icon";
import { Press } from "./Press";
import { Text } from "./Text";
import { colors, radius } from "./theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

/** Pill buttons: cream primary, soft grey secondary, like the web app. */
export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
  size = "md",
  color,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: "sm" | "md" | "lg";
  /** Overrides the primary colour (e.g. from artwork). */
  color?: string;
}) {
  const bg =
    variant === "primary" ? (color ?? colors.accent) : variant === "secondary" ? colors.surface2 : variant === "danger" ? "rgba(255,138,122,0.12)" : "transparent";
  const fg = variant === "primary" ? colors.accentInk : variant === "danger" ? colors.danger : colors.text;
  const h = size === "sm" ? 36 : size === "lg" ? 52 : 44;
  return (
    <Press
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        {
          height: h,
          paddingHorizontal: size === "sm" ? 14 : 20,
          borderRadius: radius.pill,
          backgroundColor: bg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === "sm" ? 18 : 20} color={fg} /> : null}
          <Text weight={600} size={size === "sm" ? 14 : 15} color={fg}>
            {label}
          </Text>
        </>
      )}
    </Press>
  );
}

export function Spacer({ h = 0, w = 0 }: { h?: number; w?: number }) {
  return <View style={{ height: h, width: w }} />;
}
