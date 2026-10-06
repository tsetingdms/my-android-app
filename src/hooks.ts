import { useEffect, useState } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';

import * as Launcher from '../modules/launcher';
import type { BatteryInfo, DeviceStats } from '../modules/launcher';

// One clock for the whole launcher: a single timer aligned to the minute (not one per widget), and
// only while something on screen shows the time.
let clockNow = new Date();
const clockListeners = new Set<(now: Date) => void>();
let clockTimer: ReturnType<typeof setTimeout> | null = null;
let clockAppState: NativeEventSubscription | null = null;

const sameMinute = (a: Date, b: Date) => Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);

function clockTick() {
  const now = new Date();
  if (!sameMinute(now, clockNow)) {
    clockNow = now;
    clockListeners.forEach((listener) => listener(now));
  }
}

function scheduleClock() {
  if (clockTimer) clearTimeout(clockTimer);
  clockTimer = setTimeout(() => {
    clockTick();
    scheduleClock();
  }, 60_000 - (Date.now() % 60_000) + 50);
}

function subscribeClock(listener: (now: Date) => void) {
  clockListeners.add(listener);
  if (clockListeners.size === 1) {
    clockTick();
    scheduleClock();
    // JS timers pause while Lumo is in the background; catch up as soon as it's back.
    clockAppState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      clockTick();
      scheduleClock();
    });
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size > 0) return;
    if (clockTimer) clearTimeout(clockTimer);
    clockTimer = null;
    clockAppState?.remove();
    clockAppState = null;
  };
}

/**
 * The current time, updated at the start of every minute. Pass `active = false` while the
 * component is hidden (closed panel, other home page): it then costs nothing and catches up when shown.
 */
export function useMinuteClock(active = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const fresh = new Date();
    setNow((prev) => (sameMinute(prev, fresh) ? prev : fresh));
    return subscribeClock(setNow);
  }, [active]);
  return now;
}

/**
 * A native reading shared by every component that shows it: one poll for all of them, only while at
 * least one is visible and Lumo is in front, and no re-render when the value didn't change.
 */
function sharedPoll<T>(read: () => T | Promise<T>, initial: T, everyMs: number) {
  let value = initial;
  let json = '';
  let timer: ReturnType<typeof setInterval> | null = null;
  let appState: NativeEventSubscription | null = null;
  const listeners = new Set<(value: T) => void>();

  const update = async () => {
    try {
      const next = await read();
      const nextJson = JSON.stringify(next);
      if (nextJson === json) return;
      json = nextJson;
      value = next;
      listeners.forEach((listener) => listener(next));
    } catch {
      // Ignore transient failures.
    }
  };

  return function usePolledValue(active = true): T {
    const [current, setCurrent] = useState<T>(value);
    useEffect(() => {
      if (!active) return;
      setCurrent(value);
      listeners.add(setCurrent);
      if (listeners.size === 1) {
        update();
        timer = setInterval(() => {
          if (AppState.currentState === 'active') update();
        }, everyMs);
        appState = AppState.addEventListener('change', (state) => state === 'active' && update());
      }
      return () => {
        listeners.delete(setCurrent);
        if (listeners.size > 0) return;
        if (timer) clearInterval(timer);
        timer = null;
        appState?.remove();
        appState = null;
      };
    }, [active]);
    return current;
  };
}

const NO_BATTERY: BatteryInfo = { level: -1, charging: false, temperature: 0 };

/** Battery level / charging, polled every 30 s while shown. */
export const useBattery = sharedPoll<BatteryInfo>(Launcher.getBattery, NO_BATTERY, 30_000);

/** RAM and storage, polled every 15 s while shown (only the widgets page uses it). */
export const useDeviceStats = sharedPoll<DeviceStats | null>(Launcher.getDeviceStats, null, 15_000);
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
