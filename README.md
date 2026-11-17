# Harmoni for Android

A native Android app for [Harmoni](../harmoni-next) servers, built with React Native (Expo SDK 58) and a local Kotlin module for playback. It works with any Harmoni server that supports app sign-in (OAuth): you type the server's address, sign in on the server's own page in a Custom Tab, and come back signed in.

It does everything the web app does (Home, Search, Library, Liked Songs, Recently Played, playlists, albums, artists, Spices and the seed picker, synced lyrics, the queue, autoplay, Harmoni Link, invites, Apple Music import, account settings), plus things only an app can:

- **Background playback** with a Media3 `MediaSessionService`: notification, lock screen and Bluetooth controls, a heart button in the media controls, headset buttons, audio focus, and pausing when headphones come out.
- **Downloads** for offline listening (songs, albums, playlists, Spices, or everything you like), stored in Media3's download cache, so playback finds them automatically.
- **Android Auto**: browse Recently Played, Liked Songs, Playlists and Downloads, and search by voice.
- **Home screen widget** with artwork, colour taken from the cover, and play/skip/back. It resumes your last queue even when the app isn't running.
- **Haptics** throughout, using Android's own haptic constants.
- **Sleep timer** (minutes, or "end of this song"), **crossfade** (0–12 s, equal-power like the web), smooth play/pause, and the phone's **equalizer**.
- Resumes where you left off after the app is closed or the phone restarts.

## Layout

| Path | What's there |
|---|---|
| `src/app/` | Routes (Expo Router). `(auth)` is sign-in; `(app)` has three tabs, each with its own stack, sharing the detail screens in `(home,search,library)/`. |
| `src/api/` | Types and calls for the Harmoni API (`docs/api/reference.md` on any server). |
| `src/auth/` | Server discovery, dynamic client registration, OAuth + PKCE. |
| `src/player/` | The queue, shuffle, autoplay, play/listen reporting and Link reporting. Native plays; this decides what. |
| `src/link/` | Harmoni Link: the event stream, reports, commands, transfers. |
| `src/now-playing/` | The full-screen player: backdrop, lyrics, queue, transport. |
| `src/song/`, `src/spice/`, `src/ui/` | Rows, cards, menus, collection screens, Spice art, and the design system. |
| `modules/harmoni-player/` | Kotlin: `PlaybackService` (Media3), `Downloads`, `NowPlayingWidget`, `AuthStore` (Keystore-encrypted tokens, refreshed natively so background playback never loses them), and the JS bridge. |

Two things worth knowing about the design:

- **Tokens live natively.** `AuthStore` keeps the session encrypted with an Android Keystore key and refreshes it (one refresh at a time, saving the rotated refresh token first), so audio, downloads, the widget and JS all share one source of truth.
- **JS timers stop in the background on Android**, so the native module ticks (every 0.5 s while playing) and everything periodic in JS (Link reports, reconnects, autoplay retries) runs off those ticks (`src/lib/heartbeat.ts`).

## Building

You need Node 22, JDK 17, the Android SDK (platform 36, build tools, NDK) and Bun.

```bash
bun install
bunx expo prebuild --platform android
cd android && ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/debug/app-debug.apk
cd .. && bunx expo start --dev-client
```

For a release build: `cd android && ./gradlew :app:assembleRelease`. It needs a signing config before it can be installed on a phone.

## CI: an APK on every push

`.github/workflows/android.yml` typechecks, runs the tests, and builds a release APK (arm64 + armv7) on every push to `main` and on pull requests. Download it from the run's **Artifacts** on the Actions tab. Pushing a tag like `v1.2.0` also attaches the APK to a GitHub Release.

- Each build's `versionCode` is the run number, so a newer APK installs over an older one.
- **Signing.** Without secrets, APKs are signed with the shared debug key: fine for testing, not for handing out. To sign with your own key, create one once (`keytool -genkeypair -v -keystore harmoni.jks -alias harmoni -keyalg RSA -keysize 4096 -validity 10000`) and add these repository secrets: `ANDROID_KEYSTORE_BASE64` (`base64 -i harmoni.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Switching keys means uninstalling the debug-signed app once. Keep the keystore safe: losing it means people can't update.
- Locally, the same `HARMONI_KEYSTORE_FILE`, `HARMONI_KEYSTORE_PASSWORD`, `HARMONI_KEY_ALIAS` and `HARMONI_KEY_PASSWORD` environment variables sign `assembleRelease` (see `plugins/withReleaseSigning.js`).

## Developing against a real server

- `bun scripts/dev-login.ts https://your.server cli emulator` signs in through your own browser (you type your password there, nothing else sees it) and saves tokens to `.dev/` (gitignored).
- `bun scripts/dev-api.ts GET /api/me` calls the API with the `cli` session.
- `sh scripts/dev-session.sh emulator` copies the `emulator` session into a debug build on a connected device, so you can skip the sign-in screen.
- Start Metro with `EXPO_PUBLIC_DISABLE_LINK=1` to keep a test device out of Harmoni Link (so it never takes playback from your phone), and `EXPO_PUBLIC_NO_REPORTS=1` to stop it writing to your play history. Add `--clear` when you change these: Metro caches them.

## Credits

Icons: Basil by Craftwork and Font Awesome 6, both CC BY 4.0 (the same set the web app uses). Font: Outfit.
