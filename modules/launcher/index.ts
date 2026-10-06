import { NativeModule, requireOptionalNativeModule } from 'expo';

export type NativeApp = {
  key: string;
  packageName: string;
  activityName: string;
  label: string;
  icon: string | null;
  monoIcon: string | null;
  /** Android ApplicationInfo.category, -1 when undefined. */
  category: number;
  isSystem: boolean;
};

export type BatteryInfo = { level: number; charging: boolean; temperature: number };

export type DeviceStats = {
  ramTotal: number;
  ramAvailable: number;
  storageTotal: number;
  storageAvailable: number;
};

export type SystemState = {
  wifi: boolean | null;
  mobileData: boolean | null;
  bluetooth: boolean | null;
  airplane: boolean;
  location: boolean | null;
  autoRotate: boolean;
  autoBrightness: boolean;
  /** 0..1, perceptual. */
  brightness: number;
  /** 0..1 media volume. */
  volume: number;
  ringer: 'normal' | 'vibrate' | 'silent';
  musicActive: boolean;
  torch: boolean;
  canWriteSettings: boolean;
};

export type MediaAction = 'play_pause' | 'next' | 'previous';

export type LockScreenStatus = {
  enabled: boolean;
  /** The screen-off listener is running. */
  listening: boolean;
  /** ms timestamps (0 = never). */
  lastAttempt: number;
  lastShown: number;
  lastVia: 'direct' | 'notification' | 'test' | null;
  canDrawOverlays: boolean;
  notificationsEnabled: boolean;
};

/** An edge-panel clipboard item (stored on the phone by the native module). */
export type ClipItem = {
  id: string;
  kind: 'text' | 'image';
  text: string | null;
  /** file:// URI of the saved picture. */
  uri: string | null;
  width: number;
  height: number;
  /** ms timestamp of when it was copied (or last brought back to the top). */
  time: number;
  pinned: boolean;
};

export type SettingsPanel =
  | 'wifi'
  | 'internet'
  | 'volume'
  | 'bluetooth'
  | 'display'
  | 'battery'
  | 'storage'
  | 'location'
  | 'airplane'
  | 'apps'
  | 'settings';

type LauncherEvents = {
  onAppsChanged(event: { action: string; packageName: string }): void;
  onHomePressed(): void;
  onTorchChanged(event: { on: boolean }): void;
  onClipsChanged(): void;
  onOpenRequest(event: { target: string }): void;
};

declare class LauncherNativeModule extends NativeModule<LauncherEvents> {
  getApps(iconSize: number): Promise<NativeApp[]>;
  launchApp(packageName: string, activityName: string): boolean;
  openAppInfo(packageName: string): boolean;
  uninstallApp(packageName: string): boolean;
  isDefaultLauncher(): boolean;
  openHomeSettings(): boolean;
  requestHomeRole(): boolean;
  openWallpaperPicker(): boolean;
  openSettingsPanel(panel: SettingsPanel): boolean;
  openAlarms(): boolean;
  openCalendar(): boolean;
  expandNotifications(): boolean;
  setTorch(on: boolean): boolean;
  isTorchOn?(): boolean;
  getBattery(): BatteryInfo;
  getDeviceStats(): Promise<DeviceStats>;
  getWallpaperColor(): string | null;
  getSystemState(): SystemState;
  setVolume(fraction: number): boolean;
  setBrightness(fraction: number): boolean;
  setAutoBrightness(on: boolean): boolean;
  setAutoRotate(on: boolean): boolean;
  requestWriteSettings(): boolean;
  cycleRinger(): SystemState['ringer'];
  mediaKey(action: MediaAction): boolean;
  openCamera(): boolean;
  openCalculator(): boolean;
  pickWallpaperPhoto(maxShortSide: number): Promise<string | null>;
  setLockScreenEnabled(enabled: boolean): void;
  isLockScreenEnabled(): boolean;
  unlockScreen(): boolean;
  getLockScreenStatus(): LockScreenStatus;
  testLockScreen(): boolean;
  openOverlaySettings(): boolean;
  requestNotificationPermission(): boolean;
  setClipboardOptions(enabled: boolean, keepHours: number): Promise<void>;
  getClips(): ClipItem[];
  copyClip(id: string): boolean;
  shareClip(id: string, packageName: string | null): boolean;
  pinClip(id: string, pinned: boolean): boolean;
  updateClipText(id: string, text: string): boolean;
  deleteClip(id: string): boolean;
  clearClips(): boolean;
  saveClipEdit(id: string, edit: string): Promise<string | null>;
  setEdgeOverlay(enabled: boolean, position: string, dark: boolean): Promise<void>;
  closeEdgeOverlay(): boolean;
  canDrawOverlays(): boolean;
  openHome(target: string): boolean;
  setPhoneWallpaper(spec: string): Promise<boolean>;
  setShowSystemWallpaper(show: boolean): Promise<void>;
}

// Optional so the JS still loads (with empty data) outside a native Android build.
const native = requireOptionalNativeModule<LauncherNativeModule>('Launcher');

export const isAvailable = native != null;

export function getApps(iconSize: number): Promise<NativeApp[]> {
  return native ? native.getApps(iconSize) : Promise.resolve([]);
}

export const launchApp = (packageName: string, activityName: string) =>
  native?.launchApp(packageName, activityName) ?? false;
export const openAppInfo = (packageName: string) => native?.openAppInfo(packageName) ?? false;
export const uninstallApp = (packageName: string) => native?.uninstallApp(packageName) ?? false;
export const isDefaultLauncher = () => native?.isDefaultLauncher() ?? false;
export const openHomeSettings = () => native?.openHomeSettings() ?? false;
export const requestHomeRole = () => native?.requestHomeRole() ?? false;
export const openWallpaperPicker = () => native?.openWallpaperPicker() ?? false;
export const openSettingsPanel = (panel: SettingsPanel) => native?.openSettingsPanel(panel) ?? false;
export const openAlarms = () => native?.openAlarms() ?? false;
export const openCalendar = () => native?.openCalendar() ?? false;
export const expandNotifications = () => native?.expandNotifications() ?? false;
export const setTorch = (on: boolean) => native?.setTorch(on) ?? false;
/** Cheap cached torch state (no full system-state read). */
export const isTorchOn = (): boolean => (native?.isTorchOn ? native.isTorchOn() : false);
export const getWallpaperColor = () => native?.getWallpaperColor() ?? null;
/** Draw the phone's wallpaper behind the home screen (off while Lumo covers it with its own). */
export function setShowSystemWallpaper(show: boolean) {
  native?.setShowSystemWallpaper(show).catch(() => {});
}
/** Sets the phone's own wallpaper from a spec (see wallpaperSync.ts); resolves true when done. */
export function setPhoneWallpaper(spec: string): Promise<boolean> {
  return native ? native.setPhoneWallpaper(spec).catch(() => false) : Promise.resolve(false);
}

const NO_STATE: SystemState = {
  wifi: null,
  mobileData: null,
  bluetooth: null,
  airplane: false,
  location: null,
  autoRotate: false,
  autoBrightness: false,
  brightness: 0.5,
  volume: 0.5,
  ringer: 'normal',
  musicActive: false,
  torch: false,
  canWriteSettings: false,
};

export const getSystemState = (): SystemState => native?.getSystemState() ?? NO_STATE;
export const setVolume = (fraction: number) => native?.setVolume(fraction) ?? false;
export const setBrightness = (fraction: number) => native?.setBrightness(fraction) ?? false;
export const setAutoBrightness = (on: boolean) => native?.setAutoBrightness(on) ?? false;
export const setAutoRotate = (on: boolean) => native?.setAutoRotate(on) ?? false;
export const requestWriteSettings = () => native?.requestWriteSettings() ?? false;
export const cycleRinger = (): SystemState['ringer'] => native?.cycleRinger() ?? 'normal';
export const mediaKey = (action: MediaAction) => native?.mediaKey(action) ?? false;
export const openCamera = () => native?.openCamera() ?? false;
export const openCalculator = () => native?.openCalculator() ?? false;
export const setLockScreenEnabled = (enabled: boolean) => native?.setLockScreenEnabled(enabled);
export const isLockScreenEnabled = () => native?.isLockScreenEnabled() ?? false;
export const unlockScreen = () => native?.unlockScreen() ?? false;
export const getLockScreenStatus = (): LockScreenStatus | null => native?.getLockScreenStatus() ?? null;
export const testLockScreen = () => native?.testLockScreen() ?? false;
export const openOverlaySettings = () => native?.openOverlaySettings() ?? false;
export const requestNotificationPermission = () => native?.requestNotificationPermission() ?? false;

/** Opens the system picker; resolves to a file:// URI of the saved, downscaled copy, or null if cancelled. */
export function pickWallpaperPhoto(maxShortSide: number): Promise<string | null> {
  return native ? native.pickWallpaperPhoto(maxShortSide) : Promise.resolve(null);
}

export function addTorchListener(listener: (on: boolean) => void) {
  const sub = native?.addListener('onTorchChanged', (e) => listener(e.on));
  return () => sub?.remove();
}

export function getBattery(): BatteryInfo {
  return native?.getBattery() ?? { level: -1, charging: false, temperature: 0 };
}

export function getDeviceStats(): Promise<DeviceStats | null> {
  return native ? native.getDeviceStats() : Promise.resolve(null);
}

// Edge-panel clipboard

/** Turns clipboard saving (and the "Lumo clipboard" share entry) on or off; keepHours 0 = keep forever. */
export function setClipboardOptions(enabled: boolean, keepHours: number) {
  native?.setClipboardOptions(enabled, keepHours).catch(() => {});
}
export const getClips = (): ClipItem[] => native?.getClips() ?? [];
/** Puts an item back on the phone's clipboard, ready to paste. */
export const copyClip = (id: string) => native?.copyClip(id) ?? false;
/** Sends an item to one app (true) or, without a package or if that app can't take it, via the share sheet. */
export const shareClip = (id: string, packageName: string | null = null) => native?.shareClip(id, packageName) ?? false;
export const pinClip = (id: string, pinned: boolean) => native?.pinClip(id, pinned) ?? false;
export const updateClipText = (id: string, text: string) => native?.updateClipText(id, text) ?? false;
export const deleteClip = (id: string) => native?.deleteClip(id) ?? false;
/** Removes every item except pinned ones. */
export const clearClips = () => native?.clearClips() ?? false;
/** Saves an edited copy of a picture as a new item; resolves to its id (null if it failed). */
export function saveClipEdit(id: string, edit: string): Promise<string | null> {
  return native ? native.saveClipEdit(id, edit) : Promise.resolve(null);
}
export function addClipsListener(listener: () => void) {
  const sub = native?.addListener('onClipsChanged', listener);
  return () => sub?.remove();
}

// Edge panel over other apps

/** Shows or hides the floating edge bar over other apps (it also needs "Display over other apps"). */
export function setEdgeOverlay(enabled: boolean, position: string, dark: boolean) {
  native?.setEdgeOverlay(enabled, position, dark).catch(() => {});
}
/** Finishes the see-through panel screen (after its closing animation). */
export const closeEdgeOverlay = () => native?.closeEdgeOverlay() ?? false;
/** "Display over other apps" granted. */
export const canDrawOverlays = () => native?.canDrawOverlays() ?? false;
/** Goes back to the home screen and asks it to open something there. */
export const openHome = (target: 'drawer') => native?.openHome(target) ?? false;
export function addOpenRequestListener(listener: (target: string) => void) {
  const sub = native?.addListener('onOpenRequest', (e) => listener(e.target));
  return () => sub?.remove();
}

export function addAppsChangedListener(listener: () => void) {
  const sub = native?.addListener('onAppsChanged', listener);
  return () => sub?.remove();
}

export function addHomePressedListener(listener: () => void) {
  const sub = native?.addListener('onHomePressed', listener);
  return () => sub?.remove();
}
