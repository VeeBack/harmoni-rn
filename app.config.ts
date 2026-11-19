import type { ConfigContext, ExpoConfig } from "expo/config";

// app.json holds the config; this adds what CI decides per build.
//   VERSION_CODE  Android versionCode (CI uses the run number, so each build upgrades the last)
//   APP_VERSION   the version people see (CI uses 1.0.<run number>, matching the release tag)
//   LINK_HOSTS    servers whose links (/u/…, /song/…, /playlist/…) open in the app; comma-separated
const LINK_HOSTS = (process.env.LINK_HOSTS || "music.ceccun.com")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);
const LINK_PATHS = ["/u/", "/song/", "/playlist/", "/spice/", "/album/", "/artist/"];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  version: process.env.APP_VERSION || config.version,
  android: {
    ...config.android,
    versionCode: Number(process.env.VERSION_CODE || config.android?.versionCode || 1),
    // Links to the web app open the matching screen here. Android verifies them when the
    // server publishes /.well-known/assetlinks.json; until then people can turn them on
    // in Settings (Open Harmoni links).
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: LINK_HOSTS.flatMap((host) => LINK_PATHS.map((pathPrefix) => ({ scheme: "https", host, pathPrefix }))),
      },
    ],
  },
  plugins: [...(config.plugins ?? []), "./plugins/withReleaseSigning"],
});
