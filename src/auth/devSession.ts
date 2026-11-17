import { File, Paths } from "expo-file-system";
import Native from "harmoni-player";

/**
 * Debug builds only: picks up a session written by `scripts/dev-session.sh`
 * (from a sign-in the developer did in their own browser with
 * scripts/dev-login.ts), hands it to the native session store, and deletes the file.
 */
export async function importDevSession(): Promise<boolean> {
  if (!__DEV__) return false;
  try {
    const f = new File(Paths.document, "dev-session.json");
    if (!f.exists) return false;
    const json = f.textSync();
    f.delete();
    JSON.parse(json);
    await Native.setSession(json);
    return true;
  } catch {
    return false;
  }
}
