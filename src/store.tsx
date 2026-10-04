import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, PixelRatio, useColorScheme } from 'react-native';

import * as Launcher from '../modules/launcher';
import type { NativeApp } from '../modules/launcher';
import { DEFAULT_SETTINGS, makePalette, mix, type Palette, type Settings } from './theme';

export type App = NativeApp;

export type Layout = {
  home: string[];
  dock: string[];
  hidden: string[];
  launches: Record<string, number>;
  seeded: boolean;
};

const DEFAULT_LAYOUT: Layout = { home: [], dock: [], hidden: [], launches: {}, seeded: false };

const KEYS = {
  settings: 'lumo.settings.v1',
  layout: 'lumo.layout.v1',
  apps: 'lumo.apps.v1',
};

// Rendered once natively and cached on disk; sized for the screen density.
const ICON_PX = Math.min(192, Math.max(96, Math.round(PixelRatio.get() * 64)));

type StoreValue = {
  ready: boolean;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  layout: Layout;
  updateLayout: (fn: (layout: Layout) => Layout) => void;
  apps: App[];
  appsByKey: Map<string, App>;
  appsLoading: boolean;
  refreshApps: () => void;
  launch: (app: App) => void;
  palette: Palette;
};

const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <StoreProvider>');
  return value;
}

function sortApps(list: App[]): App[] {
  return [...list].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

function pick(apps: App[], tests: ((app: App) => boolean)[], limit: number, exclude: Set<string>): string[] {
  const out: string[] = [];
  for (const test of tests) {
    if (out.length >= limit) break;
    const found = apps.find((a) => !exclude.has(a.key) && !out.includes(a.key) && test(a));
    if (found) out.push(found.key);
  }
  return out;
}

const label = (...names: string[]) => (a: App) => names.some((n) => a.label.toLowerCase() === n.toLowerCase());
const pkg = (...parts: string[]) => (a: App) => parts.some((p) => a.packageName.toLowerCase().includes(p));

/** Puts sensible apps on the dock and home screen the first time the launcher runs. */
function seedLayout(layout: Layout, apps: App[], columns: number): Layout {
  const dock = pick(
    apps,
    [
      (a) => label('Phone')(a) || pkg('dialer')(a),
      (a) => label('Messages', 'Messaging')(a) || pkg('messaging', '.mms')(a),
      (a) => label('Chrome', 'Browser', 'Internet')(a) || pkg('com.android.chrome')(a),
      (a) => label('Camera')(a) || pkg('camera')(a),
      label('WhatsApp'),
    ],
    Math.min(columns, 5),
    new Set()
  );
  const home = pick(
    apps,
    [
      label('Play Store'),
      label('Photos', 'Gallery'),
      label('YouTube'),
      label('Maps'),
      label('Gmail'),
      label('WhatsApp'),
      label('Calendar'),
      label('Clock'),
      label('Calculator'),
      label('Files', 'File Manager', 'My Files'),
      label('Settings'),
    ],
    columns * 2,
    new Set(dock)
  );
  return { ...layout, dock, home, seeded: true };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [apps, setApps] = useState<App[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [wallpaperColor, setWallpaperColor] = useState<string | null>(null);
  const lastRefresh = useRef(0);
  const loadingRef = useRef(false);

  // Load everything saved on the phone.
  useEffect(() => {
    (async () => {
      try {
        const [s, l, a] = await AsyncStorage.multiGet([KEYS.settings, KEYS.layout, KEYS.apps]);
        if (s[1]) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s[1]) });
        if (l[1]) setLayout({ ...DEFAULT_LAYOUT, ...JSON.parse(l[1]) });
        if (a[1]) setApps(JSON.parse(a[1]));
      } catch {
        // Corrupt storage: fall back to defaults.
      }
      setReady(true);
    })();
  }, []);

  // Persist changes (debounced so typing / quick taps don't hammer storage).
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [settings, ready]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(KEYS.layout, JSON.stringify(layout)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [layout, ready]);

  const refreshApps = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    lastRefresh.current = Date.now();
    try {
      const list = sortApps(await Launcher.getApps(ICON_PX));
      setApps(list);
      AsyncStorage.setItem(KEYS.apps, JSON.stringify(list)).catch(() => {});
      setWallpaperColor(Launcher.getWallpaperColor());
    } catch {
      // Keep the cached list.
    } finally {
      loadingRef.current = false;
      setAppsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    refreshApps();
    const offApps = Launcher.addAppsChangedListener(() => {
      setTimeout(refreshApps, 400);
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastRefresh.current > 30_000) refreshApps();
    });
    return () => {
      offApps();
      sub.remove();
    };
  }, [ready, refreshApps]);

  // Seed dock/home once, and drop apps that were uninstalled.
  useEffect(() => {
    if (!ready || appsLoading || apps.length === 0) return;
    setLayout((current) => {
      if (!current.seeded) return seedLayout(current, apps, settings.columns);
      const valid = new Set(apps.map((a) => a.key));
      const home = current.home.filter((k) => valid.has(k));
      const dock = current.dock.filter((k) => valid.has(k));
      if (home.length === current.home.length && dock.length === current.dock.length) return current;
      return { ...current, home, dock };
    });
  }, [ready, appsLoading, apps, settings.columns]);

  const appsByKey = useMemo(() => new Map(apps.map((a) => [a.key, a])), [apps]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const updateLayout = useCallback((fn: (layout: Layout) => Layout) => setLayout(fn), []);

  const launch = useCallback((app: App) => {
    Launcher.launchApp(app.packageName, app.activityName);
    setLayout((l) => ({ ...l, launches: { ...l.launches, [app.key]: (l.launches[app.key] ?? 0) + 1 } }));
  }, []);

  const dark = settings.theme === 'auto' ? scheme !== 'light' : settings.theme === 'dark';
  const accent =
    settings.accent === 'wallpaper'
      ? wallpaperColor
        ? mix(wallpaperColor, dark ? '#FFFFFF' : '#000000', 0.25)
        : '#0A84FF'
      : settings.accent;
  const palette = useMemo(() => makePalette(dark, settings.glass, accent), [dark, settings.glass, accent]);

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      settings,
      updateSettings,
      resetSettings,
      layout,
      updateLayout,
      apps,
      appsByKey,
      appsLoading,
      refreshApps,
      launch,
      palette,
    }),
    [ready, settings, updateSettings, resetSettings, layout, updateLayout, apps, appsByKey, appsLoading, refreshApps, launch, palette]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
