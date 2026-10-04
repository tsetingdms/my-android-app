# Lumo Launcher

A fast, lightweight Android home-screen launcher made for budget phones (tuned on a Moto E40),
built with Expo (React Native) + TypeScript and a small native Kotlin module.

**Download the latest APK:** https://github.com/tsetingdms/my-android-app/releases/latest/download/lumo-launcher.apk

## Features

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
- Swipe down on home to open notifications; long-press any app for add/remove/move/hide/info/uninstall.
- Everything is stored on the phone. No account, no internet needed.

## Build

The APK is built by GitHub Actions (`.github/workflows/build-apk.yml`) on every push to `main` or by running the
workflow manually. It runs `expo prebuild` and `./gradlew assembleRelease` (signed with the debug keystore), uploads the
APK as a workflow artifact and attaches it to a GitHub Release.

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
