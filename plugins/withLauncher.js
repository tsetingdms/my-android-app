// Turns the Expo app into an Android home-screen launcher during `expo prebuild`.
const { AndroidConfig, withAndroidManifest, withAndroidStyles } = require('expo/config-plugins');

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
    return cfg;
  });
}

module.exports = function withLauncher(config) {
  return withWallpaperTheme(withHomeIntent(config));
};
