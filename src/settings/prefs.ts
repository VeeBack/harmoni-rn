import Native, { type NativePref } from "harmoni-player";
import { useState } from "react";
import { AppState } from "react-native";
import { create } from "zustand";

import { kv } from "@/lib/storage";

// Settings for this phone only (the server's are on /api/me). The ones the
// player or downloads need without the app live natively (Prefs.kt); these
// are the rest, read across the app.

export type OpenOn = "home" | "search" | "library" | "last";

export interface Prefs {
  /** Albums and playlists without the number on each row. Off by default. */
  hideNumbers: boolean;
  /** Liking a song saves it for offline too. */
  autoDownloadLikes: boolean;
  /** Smaller artwork while on mobile data. */
  dataSaver: boolean;
  /** Calmer animations, whatever Android's own setting says. */
  reduceMotion: boolean;
  /** Which tab Harmoni opens on. */
  openOn: OpenOn;
  /** Private listening: nothing played goes to your history until then (ms since epoch, 0 = off). */
  privateUntil: number;
}

const DEFAULTS: Prefs = { hideNumbers: false, autoDownloadLikes: false, dataSaver: false, reduceMotion: false, openOn: "home", privateUntil: 0 };

export const usePrefs = create<Prefs>(() => ({ ...DEFAULTS, ...kv.get<Partial<Prefs>>("prefs", {}) }));

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  usePrefs.setState({ [key]: value } as Pick<Prefs, K>);
  kv.set("prefs", usePrefs.getState());
}

/** How long private listening lasts once it's turned on. */
export const PRIVATE_HOURS = 6;

/** Whether what's played now stays out of your history. */
export const isPrivate = () => usePrefs.getState().privateUntil > Date.now();

/** A setting kept natively (Prefs.kt): read once, written through to the player straight away. */
export function useNativePref(key: NativePref): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => Native.getPref(key));
  return [
    on,
    (v) => {
      Native.setPref(key, v);
      setOn(v);
    },
  ];
}

/** True while data saver is on and the phone is on mobile data. Checked when Harmoni comes to the front, and each minute. */
export const useSavingData = create<{ on: boolean }>(() => ({ on: false }));

function checkSaving() {
  const on = usePrefs.getState().dataSaver && Native.networkMetered();
  if (on !== useSavingData.getState().on) useSavingData.setState({ on });
}
checkSaving();
usePrefs.subscribe(checkSaving);
AppState.addEventListener("change", (s) => s === "active" && checkSaving());
setInterval(() => AppState.currentState === "active" && checkSaving(), 60_000);
