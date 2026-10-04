import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import * as Launcher from '../modules/launcher';
import type { BatteryInfo, DeviceStats } from '../modules/launcher';

/** Re-renders at the start of every minute (and when the launcher comes back to the front). */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(new Date());
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60_000);
    }, 60_000 - (Date.now() % 60_000) + 50);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
      sub.remove();
    };
  }, []);
  return now;
}

/** Polls a cheap native reading while the launcher is visible. */
function usePolled<T>(read: () => T | Promise<T>, initial: T, everyMs: number): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let alive = true;
    const update = async () => {
      try {
        const v = await read();
        if (alive) setValue(v);
      } catch {
        // Ignore transient failures.
      }
    };
    update();
    const id = setInterval(() => {
      if (AppState.currentState === 'active') update();
    }, everyMs);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && update());
    return () => {
      alive = false;
      clearInterval(id);
      sub.remove();
    };
  }, [everyMs]);
  return value;
}

const NO_BATTERY: BatteryInfo = { level: -1, charging: false, temperature: 0 };

export function useBattery(): BatteryInfo {
  return usePolled(Launcher.getBattery, NO_BATTERY, 30_000);
}

export function useDeviceStats(): DeviceStats | null {
  return usePolled<DeviceStats | null>(Launcher.getDeviceStats, null, 15_000);
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatTime(date: Date, use24h: boolean): { hours: string; minutes: string; suffix: string } {
  const h = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  if (use24h) return { hours: String(h).padStart(2, '0'), minutes, suffix: '' };
  return { hours: String(h % 12 || 12), minutes, suffix: h < 12 ? 'AM' : 'PM' };
}

export function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(gb >= 10 ? 0 : 1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}
