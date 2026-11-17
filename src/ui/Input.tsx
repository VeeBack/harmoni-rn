import { forwardRef, useState } from "react";
import { TextInput, View, type TextInputProps, type StyleProp, type ViewStyle } from "react-native";

import { Icon, type IconName } from "./Icon";
import { colors, fonts, radius } from "./theme";

export const Input = forwardRef<React.ComponentRef<typeof TextInput>, TextInputProps & { icon?: IconName; containerStyle?: StyleProp<ViewStyle>; right?: React.ReactNode }>(
  function Input({ icon, containerStyle, style, right, onFocus, onBlur, ...rest }, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.surface2,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: focused ? colors.borderStrong : "transparent",
            paddingHorizontal: 14,
            height: 48,
            gap: 10,
          },
          containerStyle,
        ]}
      >
        {icon ? <Icon name={icon} size={20} color={colors.text3} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.text3}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
          style={[{ flex: 1, color: colors.text, fontFamily: fonts[400], fontSize: 16, paddingVertical: 0 }, style]}
        />
        {right}
      </View>
    );
  },
);
