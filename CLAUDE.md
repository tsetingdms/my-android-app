# Lumo Launcher

Android home-screen launcher for budget phones (target device: **Moto E40**, Android 11, 720×1600, Unisoc T700, 4 GB RAM).
Expo SDK 57 (React Native 0.86, New Architecture, Hermes) + TypeScript, plus a local Kotlin Expo module.
Everything is stored on the phone (AsyncStorage); there is no backend, no account and no network use.
App version lives in `app.json` (`expo.version` 1.1.0, `android.versionCode` 2).

## Repo & branches

- The repo's **default branch is `claude/jolly-fermat-denon4`**; there is no `main` yet. The workflow only builds
  automatically on pushes to `main`, so builds are currently started by hand (`workflow_dispatch`). If a `main` branch
  is created from the default branch, every push to it will build and release.
- Commit and push only when asked; never force-push.

## Commands

```bash
npm ci                      # install (lockfile is committed; use npm, not yarn/bun)
npx tsc --noEmit            # typecheck — run before every commit (CI runs it too)
npx expo export --platform android --output-dir /tmp/lumo-export   # bundle the JS without Android SDK (catches import errors)
#   if Expo's online API is unreachable, prefix with: CI=1 EXPO_OFFLINE=1

# Native build (needs JDK 17 + Android SDK with ANDROID_HOME set)
npx expo prebuild --platform android --no-install   # generates ./android (gitignored); add --clean after native changes
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a   # Windows: gradlew.bat
# APK: android/app/build/outputs/apk/release/app-release.apk (local builds are signed with the public debug key,
# so uninstall the CI-signed app before installing a local build)
adb install -r android/app/build/outputs/apk/release/app-release.apk

npx expo run:android        # dev build + Metro on a USB-connected phone (USB debugging on)
node scripts/generate-icons.mjs assets   # regenerate app icon PNGs
node scripts/generate-wallpapers.mjs     # regenerate theme wallpapers in assets/wallpapers (needs ffmpeg for JPEG)
```

- **Expo Go cannot run this app**: it has a custom native module. Use `npx expo run:android` or a release APK.
- Add packages with `npx expo install <pkg>` so versions match SDK 57. If Expo's API is unreachable, look up the
  compatible version in `node_modules/expo/bundledNativeModules.json` and `npm install pkg@<that version>`.
- Prefer doing small native features in `modules/launcher` over adding libraries (e.g. the photo picker is ~60 lines
  of Kotlin instead of expo-image-picker, which would add camera/storage permissions and a cropper).

## Layout

- `index.ts` — registers `main` (App) and `lock` (`src/lock/LockScreen.tsx`, the lock-screen surface).
- `App.tsx` — providers only (`GestureHandlerRootView` → `SafeAreaProvider` → `StoreProvider` → `Root`).
- `src/Root.tsx` — the whole screen: horizontal pager (home page + widgets page), dock/search, and three overlays
  driven by `Animated.Value`s — app drawer (`y`: H = hidden, 0 = open), control panel (`cp`: 0–1), edge panel
  (`edge`: 0–1). Home gestures: swipe up = drawer, swipe down = control panel / notifications / split (setting
  `swipeDown`). The home content recedes behind overlays (the edge panel tilts it back in 3D). Also Back/Home button
  handling, the long-press sheet, Customize, and `ScreenSizeContext` (root size, for frosted glass).
- `src/store.tsx` — single React context: `settings` (look), `layout` (home / dock / edge / hidden / launch counts),
  installed `apps`, derived `palette`. Persists to AsyncStorage with a debounce, seeds dock/home on first run, prunes
  uninstalled apps, and syncs `settings.lockEnabled` to native. Exports `KEYS` (used by the lock screen).
- `src/theme.ts` — `Settings` type + `DEFAULT_SETTINGS`, accents, gradient wallpapers, `WALLPAPER_IMAGES` (theme art,
  `wallpaper: 'img:<id>'`; `'photo'` uses `photoUri`; `'system'` = phone wallpaper), `wallpaperImage()`, `THEMES`
  (one-tap presets = settings patches), `CLOCK_FACES`, `CLOCK_COLORS`, icon shapes, `makePalette()` (glass colors per
  style: liquid / frosted / clear / solid), drawer categories.
- `src/hooks.ts` — minute clock, polled battery / device stats, date/time formatting.
- `src/components/`
  - `Glass` — the "liquid glass" surface; `frosted` adds a pre-blurred wallpaper backdrop (static cards only).
  - `Wallpaper` (+ `PanelBackdrop` for overlays, `ScreenSizeContext`), `ClockFace` (11 designs shared by home, lock
    screen and pickers; `resolveClockColor`), `Tilt` (3D press feedback), `AppIcon` (+ `useIconLook`).
  - `AppDrawer` — grid / pages / list layouts, A–Z bar, search with web/Play Store fallbacks, RNGH drag-to-close.
  - `ControlPanel`, `EdgePanel` (+ `EdgeHandle`, `EDGE_APP_LIMIT` = 7), `HomeParts` (home grid, dock with
    `DOCK_LIMIT` = 5, search pill, page dots, default-launcher banner), `ActionsSheet` (long-press menu),
    `SettingsSheet` (Customize: themes, wallpaper, clocks, lock screen, gestures, icons, drawer, hidden apps).
  - `widgets/` — clock widget, battery/date glance cards, widgets page (quick controls, device meters, calendar, note).
- `src/lock/LockScreen.tsx` — the `lock` component. It runs in a separate React root, so it reads settings straight
  from AsyncStorage (no store), shows the lock clock face, swipe up → `Launcher.unlockScreen()`, torch/camera buttons.
- `assets/fonts/` — 7 OFL clock fonts embedded by the `expo-font` plugin (list + licenses in its README);
  `assets/wallpapers/` — theme art generated by `scripts/generate-wallpapers.mjs`.
- `modules/launcher/` — local Expo module, autolinked from `./modules`:
  - `index.ts` — typed JS wrapper. Uses `requireOptionalNativeModule`, so every call has a safe fallback when the
    native module is missing.
  - `LauncherModule.kt` — lists launchable apps, renders icons to PNG files in `cacheDir/launcher-icons` (keyed by
    package + version + size), launches apps, app info/uninstall, default-launcher role request, settings panels,
    battery/RAM/storage, wallpaper color, notification shade, photo picker (`OnActivityResult`), and events
    `onAppsChanged` (package broadcasts), `onHomePressed` (`OnNewIntent` with CATEGORY_HOME), `onTorchChanged`.
  - `SystemControls.kt` — control-panel state and actions: volume, brightness / auto-rotate (only with the
    user-granted WRITE_SETTINGS), ringer, media keys (`dispatchMediaKeyEvent`, no notification access), torch tracking.
  - `WallpaperPhoto.kt` — saves a picked photo downscaled + EXIF-rotated to `filesDir/wallpapers` (keeps only one).
  - `LockScreen.kt` — `LockScreen` (screen-off receiver, on/off in SharedPreferences `lumo_lock_screen`) and
    `LockScreenActivity` (a `ReactActivity` hosting `lock` over the keyguard). The module's `build.gradle` depends on
    `react-android` for this.
  - `android/src/main/AndroidManifest.xml` — `<queries>` for LAUNCHER apps and the module's permissions (see below).
- `plugins/withLauncher.js` — config plugin: HOME/DEFAULT intent filter on MainActivity, declares
  `LockScreenActivity` (showWhenLocked, singleInstance, own task, not exported), makes `AppTheme` and
  `Theme.App.SplashScreen` transparent with `windowShowWallpaper`, writes `data_extraction_rules.xml` and the
  release-only manifest that removes INTERNET.
- `.github/workflows/build-apk.yml` — CI build and release (see below).

## Data & settings

- AsyncStorage keys: `lumo.settings.v1`, `lumo.layout.v1`, `lumo.apps.v1` (cached app list for instant start),
  `lumo.note.v1` (widgets-page note).
- Saved settings are loaded as `{ ...DEFAULT_SETTINGS, ...saved }`, so a **new setting** only needs the type field
  and a default. Renaming or changing the meaning of a key needs a migration in `StoreProvider`'s load effect (old
  keys such as `swipeDownNotifications` may still sit in saved data; they're harmless).
- `layout.home/dock/edge` hold app keys `package/activity`; uninstalled apps are pruned automatically.
- Applying a theme = `updateSettings({ ...preset.patch, themeId })`; changing the wallpaper by hand clears `themeId`.

## How things work / gotchas

- **Never edit `android/`** — it is generated by prebuild and gitignored. Native changes go in `app.json`,
  `plugins/withLauncher.js`, or `modules/launcher/android`.
- **Icons**: adaptive icons are drawn unmasked (layers inset by size/4) so JS can apply any shape via border radius;
  legacy icons are wrapped on a white plate. Themed icons use the Android 13 monochrome layer, falling back to the
  foreground layer (needed on the Android 11 target). `ICON_PX` in `store.tsx` is density-based (128 px on the E40).
- **Glass & blur are never real-time** (too slow on low-end GPUs; don't add `expo-blur`). `Glass` = translucent tint +
  diagonal `LinearGradient` sheen + rim border + 1px top highlight. Picture wallpapers are blurred once at decode
  (`Image blurRadius`, cached by the image pipeline); frosted `Glass` measures its window position and shows an offset
  copy of that blurred image, and overlays use `PanelBackdrop`. The phone wallpaper ("Phone") can't be read on modern
  Android, so it only gets a tint.
- **Performance rules** (low-end target): memoized `AppIcon` gets a stable `look` object and stable callbacks; the
  drawer list mounts ~1.2 s after start and the control/edge panels ~1.5 s after (`overlaysReady`); the app list only
  re-renders when its JSON changes; animations use `useNativeDriver: true` and interpolations are memoized; the control
  panel polls system state every 2 s only while open; launch counts update after the app-open transition.
- **Gestures**: the home `PanResponder` claims vertical moves in the *capture* phase only on page 0 and only when no
  overlay is open, so the widgets page can scroll. The edge handle sits outside the home view so it isn't stolen.
  The drawer uses react-native-gesture-handler: a `Pan` running simultaneously with the list's `Gesture.Native()`
  closes it from anywhere once the list is at the top (the A–Z bar's pan must fail first); gesture objects are
  memoized and read the latest callbacks through refs. Control/edge panels use `PanResponder`s; sliders refuse
  responder termination so swipes on them don't close the panel.
- **Lock screen** (opt-in, default off): a cover over the real keyguard, not a replacement. It starts on screen-off
  only while Lumo is the default home app (home apps may start activities from the background), never during a call or
  ringing, finishes when a secure keyguard is unlocked by fingerprint/face (USER_PRESENT), and finishes in `onStop` only
  if the screen is on (screen-off must not kill it). Both React surfaces share one JS runtime, so the main app's
  `BackHandler` also receives Back presses from the lock screen.
- **Fonts**: system families via Android names (`sans-serif-thin/-light/-medium/-black`); custom clock fonts by file
  name (`BebasNeue`, `Anton`, `Fredoka`, `Orbitron`, `BigShouldersStencil`, `Unbounded`, `Righteous`). Don't set
  `fontWeight` on custom fonts (Android may fall back to the system font).
- Back never exits the launcher; Home closes overlays first, then returns to the main home page (pager page 0).
- Package id: `com.tsetingdms.lumolauncher`. Gradle always signs with the template's public `debug.keystore`; CI
  re-signs with the private release key. Keep `android.versionCode` ≥ the installed one (lower = refused as a
  downgrade) and bump it with `expo.version` for feature releases.
- **Security/privacy settings to keep**: `android.allowBackup: false` (app.json) plus `data_extraction_rules.xml` keep
  the note/layout out of backups; release builds have no INTERNET permission — the app must stay offline, so don't add
  network features without revisiting this (debug builds keep INTERNET for Metro). `blockedPermissions` removes
  SYSTEM_ALERT_WINDOW and storage permissions. Permissions the module adds: EXPAND_STATUS_BAR, REQUEST_DELETE_PACKAGES,
  ACCESS_WIFI_STATE, ACCESS_NETWORK_STATE, BLUETOOTH (≤ API 30), WRITE_SETTINGS (special access, asked only when the
  user touches brightness/rotation).

## Adding things

- **Setting**: add it to `Settings` + `DEFAULT_SETTINGS` in `src/theme.ts`, then a control in `SettingsSheet`.
- **Clock font**: put the TTF in `assets/fonts/`, add it to the `expo-font` list in `app.json`, add its license to
  `assets/fonts/licenses/` and the fonts README, then use `fontFamily: '<FileName>'` in `ClockFace`.
- **Theme / wallpaper**: add a spec to `scripts/generate-wallpapers.mjs`, regenerate, register the JPEG in
  `WALLPAPER_IMAGES`, and add a `THEMES` entry (a settings patch).
- **Native function**: add it to `LauncherModule.kt` (or a helper object), declare it in `modules/launcher/index.ts`
  with a fallback for when the module is missing, and run a CI build (Kotlin can't be compiled without the Android SDK).

## CI / releases

`.github/workflows/build-apk.yml` runs on push to `main` (ignores `**.md`-only changes) and on manual
`workflow_dispatch` with input `release` (default true; `"false"` = compile-only test build, no release), as two jobs:

- `build` — `contents: read`, no secrets, `persist-credentials: false`: Node 22, Java 17 (temurin), `npm ci`,
  typecheck, `expo prebuild`, `./gradlew assembleRelease` (armeabi-v7a + arm64-v8a). Uploads `app-release.apk` +
  the public `debug.keystore` as a 1-day `build-output` artifact.
- `release` — `contents: write`, the only job that sees signing secrets; runs no npm/Gradle code. `zipalign -P 16` +
  `apksigner` sign `lumo-launcher.apk` (universal) and `lumo-launcher-arm64.apk` (32-bit libs stripped), with
  `SIGNING_KEYSTORE_BASE64` / `SIGNING_STORE_PASSWORD` (optional `SIGNING_KEY_ALIAS`, default `lumo`;
  `SIGNING_KEY_PASSWORD`, default = store password), falling back to the debug key with a warning. Publishes a
  GitHub Release marked latest, with the cert fingerprint and `SHA256SUMS.txt` in the notes.
- Release tags are `v1.0.<run_number>` — a CI build counter, **not** the app version (the app's version is in
  `app.json`).

Release-key certificate SHA-256 (since v1.0.3): `8deba2c59d8cd10389b506503c852ea441d68e8d30036fbd4a1ce44679d15b04`.
If a release's notes say "debug" or show another fingerprint, the signing secrets are missing or were changed. The
keystore itself is only on the owner's PC (backed up by them) and in GitHub Secrets — never in the repo.

All third-party actions are pinned to commit SHAs (tag in a comment); update both together. setup-gradle uses
`cache-provider: basic` (open-source cache). Stable download links:
https://github.com/tsetingdms/my-android-app/releases/latest/download/lumo-launcher.apk and `…/lumo-launcher-arm64.apk`

No Expo account / EAS is used — keep it that way.

## Working in a Claude cloud session

- Expo's online API and Google's Android SDK host (`dl.google.com`) are blocked, so native code can't be built in the
  container: verify with `npx tsc --noEmit` + `CI=1 EXPO_OFFLINE=1 npx expo export …`, then let CI compile Kotlin.
- Start builds with the GitHub MCP `actions_run_trigger` (`run_workflow`, workflow `build-apk.yml`, ref = the default
  branch, inputs `{"release": "false"}` for a test build); watch `…/actions/runs/<id>` via the API or
  `actions_get` / `get_job_logs`.
- The Actions secrets API is blocked from the session: signing secrets are managed by the owner in GitHub settings.
- Inspecting a release APK: resource file names are shortened in release builds (e.g. wallpapers become `res/Lt.jpg`),
  so look up asset names in `resources.arsc` (`assets_wallpapers_<id>`); fonts stay in `assets/fonts/`.

## Testing on the phone

No automated tests yet. Verify with `npx tsc --noEmit` and a JS bundle export, then install the APK on the Moto E40.
Useful: `adb logcat | grep -i -E "ReactNativeJS|Launcher|AndroidRuntime"` for JS logs and crashes.

Checklist after changes: swipe up opens the drawer and dragging down from the middle closes it (grid, pages and list);
A–Z bar jumps; swipe down opens the control panel (tiles tilt, volume/brightness pills, brightness asks for "Modify
system settings" once); edge bar opens the panel with the 3D tilt; themes apply wallpaper + clock; "My photo" picks
and blurs; with Lumo as default home and the lock screen on: screen off → on shows the Lumo lock, swipe up asks for the
PIN/fingerprint, fingerprint alone also dismisses it, and calls are never covered.
