import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import { api, errorMessage } from "@/api/client";
import { toast } from "@/ui/overlays";

/**
 * Picks a photo (the system photo picker, no permission needed), cropped to the
 * shape it's shown in, and uploads it. True when the picture changed.
 */
export async function pickPicture(kind: "avatar" | "banner"): Promise<boolean> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: kind === "avatar" ? [1, 1] : [3, 1],
    quality: 0.9,
  });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return false;
  try {
    const data = await new File(asset.uri).bytes();
    if (data.byteLength > 10 * 1024 * 1024) {
      toast("That picture's too big. Pick one under 10 MB.", "error");
      return false;
    }
    await api(`/api/me/profile/${kind}`, { method: "PUT", raw: { data, type: asset.mimeType || "image/jpeg" }, timeoutMs: 120_000 });
    toast(kind === "avatar" ? "New profile picture" : "New banner");
    return true;
  } catch (e) {
    toast(errorMessage(e) || "Couldn't upload that picture.", "error");
    return false;
  }
}

export async function removePicture(kind: "avatar" | "banner"): Promise<boolean> {
  try {
    await api(`/api/me/profile/${kind}`, { method: "DELETE" });
    toast(kind === "avatar" ? "Picture removed" : "Banner removed");
    return true;
  } catch {
    toast("Couldn't remove it.", "error");
    return false;
  }
}
