// Turns the Expo app into an Android home-screen launcher during `expo prebuild`.
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withAndroidStyles, withDangerousMod } = require('expo/config-plugins');

function withHomeIntent(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity.$['android:launchMode'] = 'singleTask';
    activity.$['android:stateNotNeeded'] = 'true';
    activity.$['android:resizeableActivity'] = 'true';
    activity.$['android:windowSoftInputMode'] = 'adjustResize';

    const filters = activity['intent-filter'] || [];
    const hasHome = filters.some((f) =>
      (f.category || []).some((c) => c.$['android:name'] === 'android.intent.category.HOME')
    );
    if (!hasHome) {
      filters.push({
        action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
        category: [
          { $: { 'android:name': 'android.intent.category.HOME' } },
          { $: { 'android:name': 'android.intent.category.DEFAULT' } },
        ],
      });
    }
    activity['intent-filter'] = filters;

    // Optional Lumo lock screen (expo.modules.launcher.LockScreenActivity) shown over the keyguard.
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const lockName = 'expo.modules.launcher.LockScreenActivity';
    app.activity = (app.activity || []).filter((a) => a.$['android:name'] !== lockName);
    app.activity.push({
      $: {
        'android:name': lockName,
        'android:theme': '@style/AppTheme',
        'android:exported': 'false',
        'android:launchMode': 'singleInstance',
        'android:taskAffinity': `${cfg.android?.package ?? 'lumo'}.lock`,
        'android:excludeFromRecents': 'true',
        'android:showWhenLocked': 'true',
        'android:screenOrientation': 'portrait',
        'android:resizeableActivity': 'false',
        'android:configChanges':
          'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|smallestScreenSize',
      },
    });

    // Edge panel over other apps (expo.modules.launcher.EdgeActivity): a see-through screen on top
    // of the current app, opened from the floating edge bar. Not exported; finishes when hidden.
    const edgeName = 'expo.modules.launcher.EdgeActivity';
    app.activity = app.activity.filter((a) => a.$['android:name'] !== edgeName);
    app.activity.push({
      $: {
        'android:name': edgeName,
        'android:theme': '@style/Theme.Lumo.Overlay',
        'android:exported': 'false',
        'android:launchMode': 'singleInstance',
        'android:taskAffinity': `${cfg.android?.package ?? 'lumo'}.edge`,
        'android:excludeFromRecents': 'true',
        'android:noHistory': 'true',
        'android:windowSoftInputMode': 'adjustResize',
        'android:configChanges':
          'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|smallestScreenSize',
      },
    });
    return cfg;
  });
}

function setStyleItem(style, name, value) {
  style.item = (style.item || []).filter((item) => item.$.name !== name);
  style.item.push({ $: { name }, _: value });
}

// Show the user's system wallpaper behind the (transparent) React Native views.
function withWallpaperTheme(config) {
  return withAndroidStyles(config, (cfg) => {
    const styles = cfg.modResults.resources.style || [];
    // AppTheme is the running theme; Theme.App.SplashScreen is the starting window. A launcher
    // should show the wallpaper instantly rather than a splash image.
    for (const name of ['AppTheme', 'Theme.App.SplashScreen']) {
      const style = styles.find((s) => s.$.name === name);
      if (!style) continue;
      setStyleItem(style, 'android:windowShowWallpaper', 'true');
      setStyleItem(style, 'android:windowBackground', '@android:color/transparent');
      setStyleItem(style, 'android:colorBackgroundCacheHint', '@null');
      setStyleItem(style, 'android:statusBarColor', '@android:color/transparent');
      setStyleItem(style, 'android:navigationBarColor', '@android:color/transparent');
    }

    // The edge panel over other apps must show the app behind it, not the wallpaper.
    let overlay = styles.find((s) => s.$.name === 'Theme.Lumo.Overlay');
    if (!overlay) {
      overlay = { $: { name: 'Theme.Lumo.Overlay', parent: 'AppTheme' }, item: [] };
      styles.push(overlay);
    }
    setStyleItem(overlay, 'android:windowIsTranslucent', 'true');
    setStyleItem(overlay, 'android:windowShowWallpaper', 'false');
    setStyleItem(overlay, 'android:windowBackground', '@android:color/transparent');
    setStyleItem(overlay, 'android:windowNoTitle', 'true');
    setStyleItem(overlay, 'android:windowAnimationStyle', '@null');
    setStyleItem(overlay, 'android:backgroundDimEnabled', 'false');
    cfg.modResults.resources.style = styles;
    return cfg;
  });
}

// Keep the quick note, layout and app list out of cloud backups and phone-to-phone transfers
// (Android 12+). `android.allowBackup: false` in app.json covers Android 11 and older.
const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
  </device-transfer>
</data-extraction-rules>
`;

// The app never goes online, so release builds drop the INTERNET permission that React Native
// adds by default. Debug builds keep it because they load JS from the Metro dev server.
const RELEASE_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
  xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />
</manifest>
`;

function withPrivacyHardening(config) {
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    return cfg;
  });
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const appDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src');
      const xmlDir = path.join(appDir, 'main', 'res', 'xml');
      const releaseDir = path.join(appDir, 'release');
      await fs.promises.mkdir(xmlDir, { recursive: true });
      await fs.promises.mkdir(releaseDir, { recursive: true });
      await fs.promises.writeFile(path.join(xmlDir, 'data_extraction_rules.xml'), DATA_EXTRACTION_RULES);
      await fs.promises.writeFile(path.join(releaseDir, 'AndroidManifest.xml'), RELEASE_MANIFEST);
      return cfg;
    },
  ]);
}

module.exports = function withLauncher(config) {
  return withPrivacyHardening(withWallpaperTheme(withHomeIntent(config)));
};
