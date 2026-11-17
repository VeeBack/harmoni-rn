import { memo, useMemo } from "react";
import { SvgXml } from "react-native-svg";

import { ICONS, type IconName } from "./icon-data";
import { colors } from "./theme";

export type { IconName };

/** Harmoni's icons (Basil + a few Font Awesome), coloured like currentColor on the web. */
export const Icon = memo(function Icon({ name, size = 24, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  const icon = ICONS[name];
  const xml = useMemo(
    () =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width} ${icon.height}" color="${color}">${icon.body.replace(/currentColor/g, color)}</svg>`,
    [icon, color],
  );
  return <SvgXml xml={xml} width={size} height={size} />;
});
