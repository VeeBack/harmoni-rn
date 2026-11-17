import * as Haptics from "expo-haptics";
import { AndroidHaptics, ImpactFeedbackStyle } from "expo-haptics";
import { Platform } from "react-native";

import { kv } from "./storage";

let enabled = kv.get("settings.haptics", true);
const api = typeof Platform.Version === "number" ? Platform.Version : 0;

export function setHapticsEnabled(on: boolean) {
  enabled = on;
  kv.set("settings.haptics", on);
}

export function hapticsEnabled() {
  return enabled;
}

/** Plays an Android haptic constant if this Android has it, else a close fallback. */
function play(type: AndroidHaptics, minApi: number, fallback: AndroidHaptics | ImpactFeedbackStyle) {
  if (!enabled) return;
  if (api >= minApi) {
    Haptics.performAndroidHapticsAsync(type).catch(() => {});
    return;
  }
  if (Object.values(ImpactFeedbackStyle).includes(fallback as ImpactFeedbackStyle)) Haptics.impactAsync(fallback as ImpactFeedbackStyle).catch(() => {});
  else Haptics.performAndroidHapticsAsync(fallback as AndroidHaptics).catch(() => {});
}

/** Android's own haptic vocabulary, named for what the app is doing. */
export const haptic = {
  tap: () => play(AndroidHaptics.Virtual_Key, 0, AndroidHaptics.Virtual_Key),
  select: () => play(AndroidHaptics.Segment_Tick, 34, AndroidHaptics.Clock_Tick),
  tick: () => play(AndroidHaptics.Clock_Tick, 0, AndroidHaptics.Clock_Tick),
  frequentTick: () => play(AndroidHaptics.Segment_Frequent_Tick, 34, AndroidHaptics.Clock_Tick),
  longPress: () => play(AndroidHaptics.Long_Press, 0, AndroidHaptics.Long_Press),
  toggleOn: () => play(AndroidHaptics.Toggle_On, 34, AndroidHaptics.Virtual_Key),
  toggleOff: () => play(AndroidHaptics.Toggle_Off, 34, AndroidHaptics.Virtual_Key),
  confirm: () => play(AndroidHaptics.Confirm, 30, ImpactFeedbackStyle.Medium),
  reject: () => play(AndroidHaptics.Reject, 30, ImpactFeedbackStyle.Heavy),
  dragStart: () => play(AndroidHaptics.Drag_Start, 34, AndroidHaptics.Long_Press),
  gestureStart: () => play(AndroidHaptics.Gesture_Start, 30, AndroidHaptics.Clock_Tick),
  gestureEnd: () => play(AndroidHaptics.Gesture_End, 30, AndroidHaptics.Virtual_Key),
  contextClick: () => play(AndroidHaptics.Context_Click, 0, AndroidHaptics.Context_Click),
};
