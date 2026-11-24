import { memo } from "react";
import { Text as RNText, type TextProps, type TextStyle } from "react-native";

import { colors, fonts, textStyles, type as t, type TextVariant, type Weight } from "./theme";

export interface Props extends TextProps {
  /** An HIG text style; `size`/`weight` override it. */
  variant?: TextVariant;
  size?: number;
  weight?: Weight;
  color?: string;
  align?: TextStyle["textAlign"];
  tabular?: boolean;
}

/** Outfit text on the HIG type ramp. Weight picks the font file (Android can't synthesise weights). */
export const Text = memo(function Text({ variant, size, weight, color = colors.text, align, tabular, style, ...rest }: Props) {
  const v = variant ? textStyles[variant] : null;
  const s = size ?? v?.size ?? t.b0;
  const w = (weight ?? v?.weight ?? 400) as Weight;
  const line = v && size === undefined ? v.line : Math.round(s * 1.3);
  const tracking = v && size === undefined ? v.tracking : s >= 20 ? -s * 0.018 : s >= 15 ? -0.15 : 0;
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.35}
      {...rest}
      style={[
        {
          fontFamily: fonts[w],
          fontSize: s,
          lineHeight: line,
          letterSpacing: tracking,
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

/** Small caps over a title, as the web sets them: "PLAYLIST", "YOUR SPICE · MORNING". */
export const Kicker = memo(function Kicker({ children, color = colors.text2, style, ...rest }: Omit<Props, "variant">) {
  return (
    <Text variant="kicker" color={color} numberOfLines={1} {...rest} style={[{ textTransform: "uppercase" }, style]}>
      {children}
    </Text>
  );
});
