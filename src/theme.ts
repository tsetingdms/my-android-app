import type { ViewStyle } from 'react-native';

export type ThemeMode = 'auto' | 'dark' | 'light';
export type GlassStyle = 'liquid' | 'frosted' | 'clear' | 'solid';
export type IconShape = 'circle' | 'squircle' | 'rounded' | 'square' | 'teardrop';
export type ClockStyle = 'large' | 'bold' | 'stacked' | 'minimal';

export type Settings = {
  theme: ThemeMode;
  glass: GlassStyle;
  /** Hex color, or 'wallpaper' to follow the system wallpaper. */
  accent: string;
  /** 'system' for the phone wallpaper, otherwise a key of GRADIENTS. */
  wallpaper: string;
  dim: number;
  iconShape: IconShape;
  iconSize: number;
  columns: number;
  showLabels: boolean;
  themedIcons: boolean;
  iconShine: boolean;
  clockStyle: ClockStyle;
  clock24h: boolean;
  showClock: boolean;
  showGlance: boolean;
  showSearch: boolean;
  swipeDownNotifications: boolean;
  drawerCategories: boolean;
  showFrequent: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  glass: 'liquid',
  accent: '#0A84FF',
  wallpaper: 'system',
  dim: 0.15,
  iconShape: 'squircle',
  iconSize: 56,
  columns: 4,
  showLabels: true,
  themedIcons: false,
  iconShine: true,
  clockStyle: 'large',
  clock24h: false,
  showClock: true,
  showGlance: true,
  showSearch: true,
  swipeDownNotifications: true,
  drawerCategories: true,
  showFrequent: true,
};

export const ACCENTS = [
  '#0A84FF',
  '#5E5CE6',
  '#BF5AF2',
  '#FF375F',
  '#FF9F0A',
  '#FFD60A',
  '#30D158',
  '#64D2FF',
];

export type Gradient = { name: string; colors: [string, string, ...string[]]; light?: boolean };

export const GRADIENTS: Record<string, Gradient> = {
  midnight: { name: 'Midnight', colors: ['#0B1026', '#2B1B5A', '#5A2A82'] },
  aurora: { name: 'Aurora', colors: ['#03252B', '#0B6E6E', '#58C6A0'] },
  sunset: { name: 'Sunset', colors: ['#2E1437', '#8E2D5A', '#F28B50'] },
  ocean: { name: 'Ocean', colors: ['#071A35', '#1F5F8B', '#53A7D8'] },
  rose: { name: 'Rose', colors: ['#2A1225', '#A4508B', '#F3A4B5'] },
  graphite: { name: 'Graphite', colors: ['#0B0B0D', '#1C1C22', '#34343E'] },
  dawn: { name: 'Dawn', colors: ['#FBD3E9', '#E2ECF9', '#BBD2F5'], light: true },
  lilac: { name: 'Lilac', colors: ['#E0C3FC', '#C2D6FD', '#8EC5FC'], light: true },
};

export const SHAPES: { key: IconShape; name: string }[] = [
  { key: 'squircle', name: 'Squircle' },
  { key: 'circle', name: 'Circle' },
  { key: 'rounded', name: 'Rounded' },
  { key: 'teardrop', name: 'Teardrop' },
  { key: 'square', name: 'Square' },
];

export function shapeStyle(shape: IconShape, size: number): ViewStyle {
  switch (shape) {
    case 'circle':
      return { borderRadius: size / 2 };
    case 'rounded':
      return { borderRadius: size * 0.22 };
    case 'square':
      return { borderRadius: size * 0.08 };
    case 'teardrop':
      return {
        borderTopLeftRadius: size / 2,
        borderTopRightRadius: size / 2,
        borderBottomLeftRadius: size / 2,
        borderBottomRightRadius: size * 0.16,
      };
    case 'squircle':
    default:
      return { borderRadius: size * 0.32 };
  }
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, amount: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const out = ca.map((v, i) => Math.round(v + (cb[i] - v) * amount));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export type Palette = {
  dark: boolean;
  accent: string;
  text: string;
  subtext: string;
  /** Text drawn straight onto the wallpaper. */
  onWallpaper: string;
  glassBg: string;
  glassBorder: string;
  glassSheen: [string, string, ...string[]];
  glassHighlight: string;
  sheetBg: string;
  separator: string;
  chipBg: string;
  themedIconBg: string;
  themedIconFg: string;
};

export function makePalette(dark: boolean, glass: GlassStyle, accent: string): Palette {
  const base = {
    dark,
    accent,
    text: dark ? '#FFFFFF' : '#111114',
    subtext: dark ? 'rgba(235,235,245,0.62)' : 'rgba(60,60,67,0.7)',
    onWallpaper: dark ? '#FFFFFF' : '#0E0E12',
    separator: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    chipBg: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
    sheetBg: dark ? 'rgba(18,18,24,0.94)' : 'rgba(246,246,250,0.96)',
    themedIconBg: dark ? mix(accent, '#000000', 0.72) : mix(accent, '#FFFFFF', 0.82),
    themedIconFg: dark ? mix(accent, '#FFFFFF', 0.55) : mix(accent, '#000000', 0.4),
  };

  switch (glass) {
    case 'frosted':
      return {
        ...base,
        glassBg: dark ? 'rgba(30,30,38,0.62)' : 'rgba(255,255,255,0.72)',
        glassBorder: dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.9)',
        glassSheen: ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.02)'],
        glassHighlight: 'rgba(255,255,255,0.25)',
      };
    case 'clear':
      return {
        ...base,
        glassBg: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.18)',
        glassBorder: dark ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.8)',
        glassSheen: ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.0)', 'rgba(255,255,255,0.0)', 'rgba(255,255,255,0.12)'],
        glassHighlight: 'rgba(255,255,255,0.7)',
      };
    case 'solid':
      return {
        ...base,
        glassBg: dark ? '#1C1C22' : '#FFFFFF',
        glassBorder: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        glassSheen: ['rgba(255,255,255,0)', 'rgba(255,255,255,0)'],
        glassHighlight: 'rgba(255,255,255,0)',
      };
    case 'liquid':
    default:
      return {
        ...base,
        glassBg: dark ? 'rgba(24,24,34,0.30)' : 'rgba(255,255,255,0.40)',
        glassBorder: dark ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.75)',
        glassSheen: [
          'rgba(255,255,255,0.30)',
          'rgba(255,255,255,0.07)',
          'rgba(255,255,255,0.0)',
          'rgba(255,255,255,0.14)',
        ],
        glassHighlight: 'rgba(255,255,255,0.65)',
      };
  }
}

export const CATEGORIES: { key: string; name: string; match: (c: number) => boolean }[] = [
  { key: 'social', name: 'Social', match: (c) => c === 4 },
  { key: 'media', name: 'Media', match: (c) => c === 1 || c === 2 || c === 3 },
  { key: 'games', name: 'Games', match: (c) => c === 0 },
  { key: 'work', name: 'Productivity', match: (c) => c === 7 },
  { key: 'travel', name: 'News & Maps', match: (c) => c === 5 || c === 6 },
  { key: 'other', name: 'Other', match: (c) => c < 0 || c > 7 },
];
