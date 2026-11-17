// Signs release builds with your own key when these are set (CI secrets, or locally):
//   HARMONI_KEYSTORE_FILE      path to the .jks/.keystore
//   HARMONI_KEYSTORE_PASSWORD  store password
//   HARMONI_KEY_ALIAS          key alias
//   HARMONI_KEY_PASSWORD       key password (defaults to the store password)
// Without them, release builds keep the debug key, so they still install for testing.
const { withAppBuildGradle } = require("expo/config-plugins");

const SIGNING = `
        release {
            if (System.getenv("HARMONI_KEYSTORE_FILE")) {
                storeFile file(System.getenv("HARMONI_KEYSTORE_FILE"))
                storePassword System.getenv("HARMONI_KEYSTORE_PASSWORD")
                keyAlias System.getenv("HARMONI_KEY_ALIAS")
                keyPassword System.getenv("HARMONI_KEY_PASSWORD") ?: System.getenv("HARMONI_KEYSTORE_PASSWORD")
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (g.includes("HARMONI_KEYSTORE_FILE")) return c;
    // Add a release signing config next to the debug one.
    g = g.replace(/signingConfigs \{\n(\s*)debug \{([\s\S]*?)\n\1\}/, (m) => m + SIGNING);
    // Use it for release builds when a key was given.
    g = g.replace(
      /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
      '$1signingConfig System.getenv("HARMONI_KEYSTORE_FILE") ? signingConfigs.release : signingConfigs.debug',
    );
    c.modResults.contents = g;
    return c;
  });
};
