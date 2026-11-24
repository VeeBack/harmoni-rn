#!/usr/bin/env bash
# Builds a release APK on this machine and publishes it as a GitHub Release,
# the way CI used to (CI took 10+ minutes a build):
#   - tag and version v1.0.<n>, versionCode <n>, one past the latest release,
#     so the app's updater (src/update) and Obtainium see it as newer
#   - signed with the shared debug key (android/app/debug.keystore, the same
#     one CI used), or your own with HARMONI_KEYSTORE_* (plugins/withReleaseSigning.js)
#   - "What's new" from the commit subjects since the last release
#
#   scripts/release.sh                         arm64 only
#   ARCHS=arm64-v8a,armeabi-v7a scripts/release.sh
#   DRY_RUN=1 scripts/release.sh               build, but don't publish
set -euo pipefail
cd "$(dirname "$0")/.."

REPO=ejaz4/harmoni-rn
ARCHS=${ARCHS:-arm64-v8a}

# Release what's on GitHub, so the tag points at a commit people can see.
if [ -n "$(git status --porcelain)" ]; then echo "Commit or stash your changes first." >&2; exit 1; fi
git fetch -q origin --tags
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "HEAD isn't origin/main: push main (or check it out) first." >&2
  exit 1
fi

last=$(gh release list --repo "$REPO" --limit 100 --json tagName -q '.[].tagName' | sed -n 's/^v1\.0\.\([0-9][0-9]*\)$/\1/p' | sort -n | tail -1)
n=$(( ${last:-0} + 1 ))
export VERSION_CODE=$n APP_VERSION="1.0.$n" EXPO_PUBLIC_UPDATE_REPO=$REPO
# Never ship a build that skips Harmoni Link or play reports (test flags for Metro).
unset EXPO_PUBLIC_DISABLE_LINK EXPO_PUBLIC_NO_REPORTS
echo "Building Harmoni $APP_VERSION ($ARCHS) from $(git rev-parse --short HEAD)"

bun install --frozen-lockfile
bunx tsc --noEmit
bun test src
CI=1 bunx expo prebuild --platform android --no-install
(cd android && ./gradlew :app:assembleRelease -PreactNativeArchitectures="$ARCHS" \
  -Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=1g")

mkdir -p dist
apk="dist/harmoni-$APP_VERSION.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$apk"
ls -la "$apk"

notes=$(mktemp)
prev=${last:+v1.0.$last}
git log --no-merges --format='- %s' ${prev:+$prev..}HEAD | grep -v '\[skip ci\]' | grep -v '^- CI:' | head -30 > "$notes" || true
[ -s "$notes" ] || echo "- Small fixes and improvements" > "$notes"
[ -n "$prev" ] && printf '\n**Full Changelog**: https://github.com/%s/compare/%s...v%s\n' "$REPO" "$prev" "$APP_VERSION" >> "$notes"
echo "--- What's new"; cat "$notes"

if [ -n "${DRY_RUN:-}" ]; then echo "DRY_RUN: not publishing."; exit 0; fi
gh release create "v$APP_VERSION" "$apk" --repo "$REPO" --target "$(git rev-parse HEAD)" \
  --title "Harmoni $APP_VERSION" --notes-file "$notes" --latest
echo "Published https://github.com/$REPO/releases/tag/v$APP_VERSION"
