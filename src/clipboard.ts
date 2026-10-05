import { useCallback, useEffect, useRef, useState } from 'react';

import * as Launcher from '../modules/launcher';
import type { ClipItem } from '../modules/launcher';

export type { ClipItem };

// Pinned items first; the native list is already newest first.
function ordered(list: ClipItem[]): ClipItem[] {
  return [...list.filter((c) => c.pinned), ...list.filter((c) => !c.pinned)];
}

/**
 * The edge-panel clipboard (saved natively, see ClipboardStore.kt). Re-renders only when the list
 * actually changes. Returns the items and a refresh function (expired items drop out on refresh).
 */
export function useClips(enabled: boolean): [ClipItem[], () => void] {
  const [clips, setClips] = useState<ClipItem[]>([]);
  const last = useRef('');

  const refresh = useCallback(() => {
    const next = enabled ? ordered(Launcher.getClips()) : [];
    const json = JSON.stringify(next);
    if (json === last.current) return;
    last.current = json;
    setClips(next);
  }, [enabled]);

  useEffect(() => {
    refresh();
    if (!enabled) return;
    return Launcher.addClipsListener(refresh);
  }, [enabled, refresh]);

  return [clips, refresh];
}

export function timeAgo(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** Black or white, whichever reads better on a hex color (same rule as ClipEditor.kt). */
export function contrastOn(hex: string): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(n)) return '#FFFFFF';
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.6 ? '#000000' : '#FFFFFF';
}
