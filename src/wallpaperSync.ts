import { Image } from 'react-native';

import { GRADIENTS, wallpaperImage, type Settings } from './theme';

export type PhoneWallpaperSpec = {
  kind: 'image' | 'gradient';
  /** Bundled picture: its drawable resource name (release builds); the user's photo: a file:// URI. */
  source?: string;
  colors?: string[];
  /** Same blur (dp) and dim as the home screen's wallpaper. */
  blur: number;
  dim: number;
  dimColor: string;
  which: 'home' | 'both';
};

/**
 * What PhoneWallpaper.kt should draw so the phone's own wallpaper matches Lumo's. Null when it's off
 * or Lumo already shows the phone's wallpaper ("Phone").
 */
export function phoneWallpaperSpec(settings: Settings, dark: boolean): PhoneWallpaperSpec | null {
  if (settings.phoneWallpaper === 'off' || settings.wallpaper === 'system') return null;
  const which = settings.phoneWallpaper;
  const dimColor = dark ? '#000000' : '#FFFFFF';
  const image = wallpaperImage(settings);
  if (image) {
    const source = Image.resolveAssetSource(image)?.uri;
    if (!source) return null;
    return { kind: 'image', source, blur: settings.wallpaperBlur, dim: settings.dim, dimColor, which };
  }
  const gradient = GRADIENTS[settings.wallpaper];
  if (!gradient) return null;
  return { kind: 'gradient', colors: gradient.colors, blur: 0, dim: settings.dim, dimColor, which };
}
