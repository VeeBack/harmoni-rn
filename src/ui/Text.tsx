import { memo } from "react";
import { Text as RNText, type TextProps, type TextStyle } from "react-native";

import { colors, fonts, type as t, type Weight } from "./theme";

export interface Props extends TextProps {
  size?: number;
  weight?: Weight;
  color?: string;
  align?: TextStyle["textAlign"];
  tabular?: boolean;
}

/** Outfit text. Weight picks the font file (Android can't synthesise weights). */
export const Text = memo(function Text({ size = t.b0, weight = 400, color = colors.text, align, tabular, style, ...rest }: Props) {
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[
        {
          fontFamily: fonts[weight],
          fontSize: size,
          lineHeight: Math.round(size * 1.3),
          color,
          textAlign: align,
          includeFontPadding: false,
          fontVariant: tabular ? ["tabular-nums"] : undefined,
        },
        style,
      ]}
    />
  );
});
