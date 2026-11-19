import { useEffect, useState } from "react";

import { dailySpiceLabel, dayPart } from "@/lib/day-part";
import { useSession } from "@/state/session";

export const DAILY_SPICE_HREF = "/spice/daily";

/**
 * Someone's Daily Spice as the library shows it: "Ejaz's Spice", with the part
 * of the day it's in now. Null when the server has Super Processing off.
 */
export function useDailySpice(): { label: string; part: string } | null {
  const me = useSession((s) => s.me);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const wait = Math.max(60_000, dayPart(now).endsAt.getTime() - Date.now() + 1000);
    const t = setTimeout(() => setNow(new Date()), wait);
    return () => clearTimeout(t);
  }, [now]);
  if (!me || !me.server.features.superProcessing) return null;
  return { label: dailySpiceLabel(me.name), part: dayPart(now).label };
}
