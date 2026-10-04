# Lumo Launcher

A fast, lightweight Android home-screen launcher made for budget phones (tuned on a Moto E40),
built with Expo (React Native) + TypeScript and a small native Kotlin module.

**Download the latest APK:** https://github.com/tsetingdms/my-android-app/releases/latest/download/lumo-launcher.apk
(smaller 64-bit-only build: https://github.com/tsetingdms/my-android-app/releases/latest/download/lumo-launcher-arm64.apk)

## Features

**New in 1.1:** control panel, edge panel, Lumo lock screen, 11 clock styles with custom fonts, one-tap themes with
picture wallpapers and real frosted-glass blur, your own photo as wallpaper, drawer Grid/Pages/List layouts with A–Z
quick scroll, and drag-down-anywhere to close the drawer.

- **Liquid-glass look** – see-through panels with a light shine and bright edges, built without expensive blur so it stays smooth on
  low-end phones. Styles: Liquid, Frosted, Clear, Solid.
- **Home screen** – clock (Thin / Bold / Stacked / Card), battery and date glass cards, pinned apps, glass dock and search bar.
- **Widgets page** (swipe left) – quick controls (torch, Wi‑Fi, data, Bluetooth, sound, display), battery/RAM/storage
  meters, month calendar and a quick note.
- **App drawer** (swipe up) – instant search (also matches initials, e.g. "gm" → Gmail), category tabs, a
  frequently-used row, and web / Play Store search fallbacks.
- **Modern icons** – re-shape every icon (squircle, circle, rounded, teardrop, square), size, grid columns, labels,
  glass shine, and accent-tinted themed icons (works on Android 11 too).
- **Customise** (long-press empty home space) – dark/light/auto theme, accent colours or wallpaper-matched accent,
  your phone wallpaper or built-in gradients, wallpaper dimming, hide apps, reorder home/dock.
- **Control panel** (swipe down on home) – tiles that tilt toward your finger, brightness & volume pills, music
  controls, torch, sound/vibrate, auto-rotate, Wi‑Fi/data/Bluetooth/location/airplane shortcuts, notifications.
- **Edge panel** – swipe the small bar on the right edge: tools and favourite apps while the home screen tilts back.
- **Lock screen** (optional) – your clock style over the phone's lock with torch & camera; swipe up to unlock (your
  PIN/fingerprint still protects the phone).
- Long-press any app for add/remove/move/hide/info/uninstall and add to dock or edge panel.
- Everything is stored on the phone. No account, no internet permission in release builds, and no cloud backup of
  your data. Brightness/auto-rotate control asks for "Modify system settings" only if you use it.

## Build

The APK is built by GitHub Actions (`.github/workflows/build-apk.yml`) on every push to `main` or by running the
workflow manually, in two jobs:

1. **build** (read-only token, no secrets): `npm ci`, typecheck, `expo prebuild`, `./gradlew assembleRelease`.
2. **release** (holds the signing key and write access, runs no npm/Gradle code): signs the universal and 64-bit
   APKs with your release key, uploads them as a workflow artifact and publishes a GitHub Release whose notes list the
   signing-certificate fingerprint and SHA-256 checksums.

## Release signing

Until the secrets below exist, releases are signed with the public React Native debug key (the workflow prints a
warning). Anyone has that key, so set up your own once:

1. Create a key (needs a JDK; Android Studio ships one at
   `C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe` on Windows):
   ```bash
   keytool -genkeypair -v -keystore lumo-release.jks -alias lumo -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Lumo Launcher"
   ```
   Pick a strong password when asked.
2. Copy the key file as base64:
   - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("lumo-release.jks")) | Set-Clipboard`
   - macOS: `base64 -i lumo-release.jks | pbcopy`
   - Linux: `base64 -w0 lumo-release.jks`
3. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**, add
   `SIGNING_KEYSTORE_BASE64` (the base64 text) and `SIGNING_STORE_PASSWORD` (the password).
   Only if you changed them: `SIGNING_KEY_ALIAS` (default `lumo`) and `SIGNING_KEY_PASSWORD` (default = store password).
4. Back up `lumo-release.jks` and the password somewhere safe, **not** in this repo. Without them you can't publish
   updates that install over the existing app.

Official release signing certificate (SHA-256), shown in every release's notes since v1.0.3:
`8deba2c59d8cd10389b506503c852ea441d68e8d30036fbd4a1ce44679d15b04`. An APK signed with any other certificate
did not come from this repo's release workflow.

Switching from the debug key to your key changes the app's signature, so uninstall the old Lumo once before installing
the first release-signed APK (your launcher layout resets).

Local development:

```bash
npm ci
npx tsc --noEmit
npx expo run:android   # needs Android SDK; Expo Go can't run this (it has native code)
```

## Project layout

- `App.tsx`, `src/` – UI (React Native)
- `modules/launcher/` – local Expo native module (Kotlin): lists apps and caches their icons, launches apps, battery/RAM/storage,
  torch, settings shortcuts, home-button events
- `plugins/withLauncher.js` – config plugin that registers the app as a HOME launcher and shows the system wallpaper
