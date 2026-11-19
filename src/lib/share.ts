import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";

import { serverOrigin } from "@/api/client";

// Links to things in Harmoni, for copying or sharing. They open on the
// signed-in server (and in this app, where Android lets it).

export const songPath = (id: string) => `/song/${id}`;
export const profilePath = (username: string) => `/u/${encodeURIComponent(username)}`;
export const playlistPath = (id: string) => `/playlist/${id}`;

export const absolute = (path: string) => `${serverOrigin() ?? ""}${path}`;

export async function copyLink(path: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(absolute(path));
    return true;
  } catch {
    return false;
  }
}

/** The phone's share sheet, with the link. */
export async function shareLink(path: string, title: string): Promise<void> {
  const url = absolute(path);
  await Share.share({ message: url, title, url }, { dialogTitle: title }).catch(() => {});
}

export { routeForLink } from "./links";
