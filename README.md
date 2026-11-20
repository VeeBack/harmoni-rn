# Harmoni for Android

A native Android app for [Harmoni](../harmoni-next) servers, built with React Native (Expo SDK 58) and a local Kotlin module for playback. It works with any Harmoni server that supports app sign-in (OAuth): you type the server's address, sign in on the server's own page in a Custom Tab, and come back signed in.

It does everything the web app does (Home, Search, Library, Liked Songs, Recently Played, your Daily Spice, playlists and sharing them, albums, artists, Spices and the seed picker, profiles and following, people in search, song links, synced lyrics, the queue, autoplay, Harmoni Link, invites, Apple Music and Spotify import, account settings), plus things only an app can:

- **Background playback** with a Media3 `MediaSessionService`: notification, lock screen and Bluetooth controls, a heart button in the media controls, headset buttons, audio focus, and pausing when headphones come out.
- **Downloads** for offline listening (songs, albums, playlists, Spices, or everything you like), stored in Media3's download cache, so playback finds them automatically. They save in the order they're on screen, top to bottom, and whatever list you have open goes first (`Downloads.kt` keeps the line itself: Media3 only orders by when songs were added). Each song shows a ring while it waits and fills. The Downloads page is your library as it is on the phone: Liked Songs, your playlists and Spices, each with just the songs saved, all of it offline.
- **Harmoni Link in Android's media controls.** While another device plays, the notification, lock screen, widget and car show its song and control it, and the output chip shows that device's name instead of "This phone". Your Link devices also appear in Android's output switcher: pick one to move playback there, and the volume slider controls that device.
- **Android Auto**: browse Recently Played, Liked Songs, Playlists and Downloads, and search by voice.
- **Home screen widget** with artwork, colour taken from the cover, and play/skip/back. It resumes your last queue even when the app isn't running.
- **Haptics** throughout, using Android's own haptic constants.
- **Sleep timer** (minutes, or "end of this song"), **crossfade** (0–12 s, equal-power like the web), smooth play/pause, and the phone's **equalizer**.
- Resumes where you left off after the app is closed or the phone restarts.
- **A backdrop that moves with the music.** `BassMeter` sits between ExoPlayer's audio renderer and the sink, low-passes each decoded buffer and lines it up with what's coming out of the speaker (no microphone permission, unlike `Visualizer`). Now Playing reads the next half second at a time and plays it out on the UI thread.
- **Updates itself** from this repository's GitHub Releases, so testers don't need a store or Obtainium (see [Updates](#updates)).
- **Links open in the app.** `https://<server>/u/…`, `/song/…`, `/playlist/…?key=…`, `/spice/…`, `/album/…` and `/artist/…` open the matching screen (see [Links](#links)).

## Layout

| Path | What's there |
|---|---|
| `src/app/` | Routes (Expo Router). `(auth)` is sign-in; `(app)` has three tabs, each with its own stack, sharing the detail screens in `(home,search,library)/`. |
| `src/api/` | Types and calls for the Harmoni API (`docs/api/reference.md` on any server). |
| `src/auth/` | Server discovery, dynamic client registration, OAuth + PKCE. |
| `src/player/` | The queue, shuffle, autoplay, play/listen reporting and Link reporting. Native plays; this decides what. |
| `src/link/` | Harmoni Link: the event stream, reports, commands, transfers. |
| `src/now-playing/` | The full-screen player: backdrop, lyrics, queue, transport. |
| `src/profile/` | Profiles (banners drawn with Skia from the person's colour, their fonts, editing in place), people, following and the playlist share sheet. |
| `src/update/` | Updating from GitHub Releases: the check, the Software Update sheet, and the Updates rows in Settings. |
| `src/home/` | Home's hero: your Spice, coloured from its covers, with a fan of them. |
| `src/song/`, `src/spice/`, `src/ui/` | Rows, cards, tiles, menus (`collections.ts` plays or opens any collection), collection screens, Spice art, and the design system (`theme.ts` shares the web's tokens). |
| `modules/harmoni-player/` | Kotlin: `PlaybackService` (Media3), `BassMeter`, `Downloads`, `Updater`, `NowPlayingWidget`, `AuthStore` (Keystore-encrypted tokens, refreshed natively so background playback never loses them), and the JS bridge. |

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

## Links

The app handles web links for the hosts in `LINK_HOSTS` (default `music.ceccun.com`; set it when building for another server). Android only opens them in the app without asking once the server proves the app is its own, with `/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.ceccun.harmoni",
    "sha256_cert_fingerprints": ["FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C"]
  }
}]
```

That fingerprint is the shared debug key that builds are signed with until a signing key is set up (see Signing); use your own key's fingerprint once there is one (`keytool -list -v -keystore <keystore>`). Until the file is there, people can turn the links on in Settings → Open Harmoni links here, which opens Android's "Open by default" page for the app.

## CI: an APK on every push

`.github/workflows/android.yml` typechecks, runs the tests, and builds a release APK (arm64; run it by hand to add armv7) on every push to `main` and on pull requests. Builds from `main` are published as a GitHub Release tagged `v1.0.<run number>`; pull request builds are only in the run's **Artifacts**.

- **The app updates itself from these releases** (see [Updates](#updates)). Each release's notes are the commit subjects since the last one (minus `CI:` and `[skip ci]` commits): the app shows them as "What's new", so write subjects for the people testing.
- [Obtainium](https://github.com/ImranR98/Obtainium) can follow the releases too: add the app by its repository URL. Each release tag matches the app's version name, so it knows what's installed.

- Each build's `versionCode` is the run number, so a newer APK installs over an older one.
- **Signing.** Without secrets, APKs are signed with the shared debug key: fine for testing, not for handing out. To sign with your own key, create one once (`keytool -genkeypair -v -keystore harmoni.jks -alias harmoni -keyalg RSA -keysize 4096 -validity 10000`) and add these repository secrets: `ANDROID_KEYSTORE_BASE64` (`base64 -i harmoni.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Switching keys means uninstalling the debug-signed app once. Keep the keystore safe: losing it means people can't update.
- Locally, the same `HARMONI_KEYSTORE_FILE`, `HARMONI_KEYSTORE_PASSWORD`, `HARMONI_KEY_ALIAS` and `HARMONI_KEY_PASSWORD` environment variables sign `assembleRelease` (see `plugins/withReleaseSigning.js`).

## Updates

Builds installed from an APK (not a store) update themselves from this repository's GitHub Releases (`src/update/`, `modules/harmoni-player/.../Updater.kt`):

1. When the app comes to the front, at most once an hour, it asks GitHub for the latest release (conditionally, so it rarely counts against GitHub's 60-an-hour limit) and compares its tag with the app's version name.
2. On Wi‑Fi (any unmetered network) it downloads the APK in the background, resuming if interrupted, and checks it against the SHA-256 GitHub publishes. On mobile data it asks first, with the size. Settings → Updates has the switch for automatic downloads and a Check button.
3. When the download is ready it offers the update in a sheet with the release notes, at most once a day per version. **Update Now** hands the APK to Android's package installer. The first time, Android asks to allow installs from Harmoni ("Install unknown apps"); the sheet sends people there and carries on when they come back. Android then asks to confirm (Android 12 and later can skip that once Harmoni itself installed the version on the phone), closes the app and replaces it, keeping the sign-in, downloads and settings. A notification ("Harmoni is up to date") opens the new version. Google Play Protect may first offer to scan the app ("App scan recommended"), as it does for any APK from outside the Play Store; **Scan app** or **More details → Install without scanning** both carry on.

An update only installs over an APK signed with the same key, so switching from the shared debug key to your own (see Signing) means installing that first build by hand. Builds take the repository from `EXPO_PUBLIC_UPDATE_REPO` (CI sets it to the repository it runs in; locally it defaults to `ejaz4/harmoni-rn`). `EXPO_PUBLIC_UPDATES=0` turns updating off for a build. Development builds only check when you tap Check, unless `EXPO_PUBLIC_UPDATE_CHECKS=1`.

## Developing against a real server

- `bun scripts/dev-login.ts https://your.server cli emulator` signs in through your own browser (you type your password there, nothing else sees it) and saves tokens to `.dev/` (gitignored).
- `bun scripts/dev-api.ts GET /api/me` calls the API with the `cli` session.
- `sh scripts/dev-session.sh emulator` copies the `emulator` session into a debug build on a connected device, so you can skip the sign-in screen.
- Start Metro with `EXPO_PUBLIC_DISABLE_LINK=1` to keep a test device out of Harmoni Link (so it never takes playback from your phone), and `EXPO_PUBLIC_NO_REPORTS=1` to stop it writing to your play history. Add `--clear` when you change these: Metro caches them.

## Credits

Icons: Basil by Craftwork and Font Awesome 6, both CC BY 4.0 (the same set the web app uses). Font: Outfit.
