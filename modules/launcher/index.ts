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

export type SettingsPanel =
  | 'wifi'
  | 'internet'
  | 'volume'
  | 'bluetooth'
  | 'display'
  | 'battery'
  | 'storage'
  | 'location'
  | 'apps'
  | 'settings';

type LauncherEvents = {
  onAppsChanged(event: { action: string; packageName: string }): void;
  onHomePressed(): void;
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
  getBattery(): BatteryInfo;
  getDeviceStats(): Promise<DeviceStats>;
  getWallpaperColor(): string | null;
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
export const getWallpaperColor = () => native?.getWallpaperColor() ?? null;

export function getBattery(): BatteryInfo {
  return native?.getBattery() ?? { level: -1, charging: false, temperature: 0 };
}

export function getDeviceStats(): Promise<DeviceStats | null> {
  return native ? native.getDeviceStats() : Promise.resolve(null);
}

export function addAppsChangedListener(listener: () => void) {
  const sub = native?.addListener('onAppsChanged', listener);
  return () => sub?.remove();
}

export function addHomePressedListener(listener: () => void) {
  const sub = native?.addListener('onHomePressed', listener);
  return () => sub?.remove();
}
