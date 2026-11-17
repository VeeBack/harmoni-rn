import type { ConfigContext, ExpoConfig } from "expo/config";

// app.json holds the config; this adds what CI decides per build.
//   VERSION_CODE  Android versionCode (CI uses the run number, so each build upgrades the last)
//   APP_VERSION   the version people see (CI uses the tag on releases)
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  version: process.env.APP_VERSION || config.version,
  android: {
    ...config.android,
    versionCode: Number(process.env.VERSION_CODE || config.android?.versionCode || 1),
  },
  plugins: [...(config.plugins ?? []), "./plugins/withReleaseSigning"],
});
