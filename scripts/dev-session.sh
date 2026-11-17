#!/bin/sh
# Debug builds only: copies a session from scripts/dev-login.ts into the app on
# a connected device or emulator. The app imports it on next launch and deletes it.
#   sh scripts/dev-session.sh [label]   (default: emulator)
set -e
label="${1:-emulator}"
src=".dev/session-$label.json"
[ -f "$src" ] || { echo "No $src. Run: bun scripts/dev-login.ts https://your.server $label"; exit 1; }
adb push "$src" /data/local/tmp/harmoni-dev-session.json >/dev/null
adb shell chmod 644 /data/local/tmp/harmoni-dev-session.json
adb shell run-as com.ceccun.harmoni mkdir -p files
adb shell run-as com.ceccun.harmoni cp /data/local/tmp/harmoni-dev-session.json files/dev-session.json
adb shell rm /data/local/tmp/harmoni-dev-session.json
echo "Copied $label session into the app. Restart the app to use it."
