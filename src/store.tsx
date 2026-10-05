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
import { phoneWallpaperSpec } from './wallpaperSync';

export type App = NativeApp;

export type Layout = {
  home: string[];
  dock: string[];
  /** Apps pinned to the edge panel (empty = show most used). */
  edge: string[];
  hidden: string[];
  launches: Record<string, number>;
  seeded: boolean;
};

const DEFAULT_LAYOUT: Layout = { home: [], dock: [], edge: [], hidden: [], launches: {}, seeded: false };

export const KEYS = {
  settings: 'lumo.settings.v1',
  layout: 'lumo.layout.v1',
  apps: 'lumo.apps.v1',
};

// The lock screen runs in the same JS runtime as the launcher, so it can start from the settings
// already in memory instead of waiting for a storage read.
let lastSettings: Settings | null = null;
export const lastKnownSettings = (): Settings | null => lastSettings;

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

type LookValue = Pick<StoreValue, 'ready' | 'settings' | 'palette' | 'updateSettings' | 'resetSettings'>;
type ActionsValue = Pick<StoreValue, 'updateSettings' | 'resetSettings' | 'updateLayout' | 'refreshApps' | 'launch'>;

const StoreContext = createContext<StoreValue | null>(null);
const LookContext = createContext<LookValue | null>(null);
const ActionsContext = createContext<ActionsValue | null>(null);

// Other React roots in the same JS runtime (the edge panel over other apps) use the launcher's live
// store instead of loading and saving a second copy, which would overwrite each other's changes.
type Shared = { value: StoreValue; look: LookValue; actions: ActionsValue };
let shared: Shared | null = null;
const sharedListeners = new Set<() => void>();
function publishShared(next: Shared | null) {
  shared = next;
  sharedListeners.forEach((listener) => listener());
}

/** Everything. Re-renders on any change (apps, layout, launch counts…) — use only where needed. */
export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <StoreProvider>');
  return value;
}

/** Settings + palette only: for visual components, so they skip app-list / layout updates. */
export function useLook(): LookValue {
  const value = useContext(LookContext);
  if (!value) throw new Error('useLook must be used inside <StoreProvider>');
  return value;
}

/** Stable action functions; never causes a re-render. */
export function useActions(): ActionsValue {
  const value = useContext(ActionsContext);
  if (!value) throw new Error('useActions must be used inside <StoreProvider>');
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

/**
 * The launcher's store. `publish` (the home screen's provider only) shares it with the other roots;
 * a provider without it is a standalone copy, used only when the home screen isn't running.
 */
export function StoreProvider({ children, publish = false }: { children: ReactNode; publish?: boolean }) {
  const scheme = useColorScheme();
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [apps, setApps] = useState<App[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [wallpaperColor, setWallpaperColor] = useState<string | null>(null);
  const lastRefresh = useRef(0);
  const loadingRef = useRef(false);
  const lastAppsJson = useRef('');

  // Load everything saved on the phone.
  useEffect(() => {
    (async () => {
      try {
        const [s, l, a] = await AsyncStorage.multiGet([KEYS.settings, KEYS.layout, KEYS.apps]);
        if (s[1]) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s[1]) });
        if (l[1]) setLayout({ ...DEFAULT_LAYOUT, ...JSON.parse(l[1]) });
        if (a[1]) {
          lastAppsJson.current = a[1];
          setApps(JSON.parse(a[1]));
        }
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
      const json = JSON.stringify(list);
      // Skip re-rendering every icon when nothing was installed, removed or updated.
      if (json !== lastAppsJson.current) {
        lastAppsJson.current = json;
        setApps(list);
        AsyncStorage.setItem(KEYS.apps, json).catch(() => {});
      }
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
      if (state === 'active' && Date.now() - lastRefresh.current > 5 * 60_000) refreshApps();
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
      const edge = current.edge.filter((k) => valid.has(k));
      if (
        home.length === current.home.length &&
        dock.length === current.dock.length &&
        edge.length === current.edge.length
      ) {
        return current;
      }
      return { ...current, home, dock, edge };
    });
  }, [ready, appsLoading, apps, settings.columns]);

  // The lock screen is started natively on screen-off; keep its on/off switch in sync.
  useEffect(() => {
    if (ready) Launcher.setLockScreenEnabled(settings.lockEnabled);
  }, [ready, settings.lockEnabled]);

  // Clipboard saving runs natively (it must happen while the home screen has focus); it only
  // exists inside the edge panel, so it's off whenever the panel is.
  const clipboardOn = settings.edgePanel && settings.clipboard;
  useEffect(() => {
    if (ready) Launcher.setClipboardOptions(clipboardOn, settings.clipboardKeep);
  }, [ready, clipboardOn, settings.clipboardKeep]);
  useEffect(() => {
    if (ready) lastSettings = settings;
  }, [ready, settings]);

  const appsByKey = useMemo(() => new Map(apps.map((a) => [a.key, a])), [apps]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const updateLayout = useCallback((fn: (layout: Layout) => Layout) => setLayout(fn), []);

  const launch = useCallback((app: App) => {
    Launcher.launchApp(app.packageName, app.activityName);
    // Count launches after the app's opening animation so the launcher doesn't re-render mid-transition.
    setTimeout(() => {
      setLayout((l) => ({ ...l, launches: { ...l.launches, [app.key]: (l.launches[app.key] ?? 0) + 1 } }));
    }, 800);
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

  const look = useMemo<LookValue>(
    () => ({ ready, settings, palette, updateSettings, resetSettings }),
    [ready, settings, palette, updateSettings, resetSettings]
  );
  const actions = useMemo<ActionsValue>(
    () => ({ updateSettings, resetSettings, updateLayout, refreshApps, launch }),
    [updateSettings, resetSettings, updateLayout, refreshApps, launch]
  );

  // Floating edge bar over other apps (drawn natively; it hides itself on the home screen).
  const overlayOn = settings.edgePanel && settings.edgeOverlay;
  useEffect(() => {
    if (ready && publish) Launcher.setEdgeOverlay(overlayOn, settings.edgeHandle, palette.dark);
  }, [ready, publish, overlayOn, settings.edgeHandle, palette.dark]);

  // Optional: the phone's own wallpaper follows Lumo's, so app switching and the lock screen match.
  // Debounced (tapping through wallpapers), and the native side skips a spec it already applied.
  const phoneSpec = useMemo(
    () => (ready && publish ? phoneWallpaperSpec(settings, dark) : null),
    [ready, publish, settings, dark]
  );
  const phoneSpecJson = phoneSpec ? JSON.stringify(phoneSpec) : null;
  useEffect(() => {
    if (!phoneSpecJson) return;
    const t = setTimeout(() => {
      Launcher.setPhoneWallpaper(phoneSpecJson).then((ok) => {
        // "Accent: wallpaper" follows the new picture.
        if (ok) setWallpaperColor(Launcher.getWallpaperColor());
      });
    }, 800);
    return () => clearTimeout(t);
  }, [phoneSpecJson]);

  useEffect(() => {
    if (publish && ready) publishShared({ value, look, actions });
  }, [publish, ready, value, look, actions]);
  useEffect(() => {
    if (!publish) return;
    return () => publishShared(null);
  }, [publish]);

  return (
    <ActionsContext.Provider value={actions}>
      <LookContext.Provider value={look}>
        <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
      </LookContext.Provider>
    </ActionsContext.Provider>
  );
}

/**
 * For other React roots (the edge panel over other apps): the home screen's live store, or a
 * standalone one if the home screen isn't running right now.
 */
export function SharedStoreProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Shared | null>(shared);
  useEffect(() => {
    const listener = () => setCurrent(shared);
    sharedListeners.add(listener);
    listener();
    return () => {
      sharedListeners.delete(listener);
    };
  }, []);
  if (!current) return <StoreProvider>{children}</StoreProvider>;
  return (
    <ActionsContext.Provider value={current.actions}>
      <LookContext.Provider value={current.look}>
        <StoreContext.Provider value={current.value}>{children}</StoreContext.Provider>
      </LookContext.Provider>
    </ActionsContext.Provider>
  );
}
