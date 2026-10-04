import { LinearGradient } from 'expo-linear-gradient';
import { createContext, memo, useContext } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useLook } from '../store';
import { GRADIENTS, wallpaperImage } from '../theme';

/** Blur (dp) used for frosted panels and glass cards over picture wallpapers. */
export const BACKDROP_BLUR = 22;

/** Size of the root view, so frosted cards can line their blurred copy up with the wallpaper. */
export const ScreenSizeContext = createContext<{ width: number; height: number } | null>(null);
export const useScreenSize = () => useContext(ScreenSizeContext);

/**
 * Background layer. "Phone" mode stays transparent so Android draws the system wallpaper behind
 * the window; otherwise it shows a gradient or a picture (theme art or the user's photo).
 * Picture blur is computed once at decode time by the image pipeline, not every frame.
 */
export const Wallpaper = memo(function Wallpaper() {
  const { settings, palette } = useLook();
  const image = wallpaperImage(settings);
  const gradient = image ? undefined : GRADIENTS[settings.wallpaper];
  const dim = settings.dim;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {image ? (
        <Image
          source={image}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          resizeMethod="resize"
          blurRadius={settings.wallpaperBlur > 0 ? settings.wallpaperBlur : undefined}
          fadeDuration={0}
        />
      ) : null}
      {gradient && (
        <>
          <LinearGradient
            colors={gradient.colors}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Soft light orbs give the glass panels something to "refract". */}
          <LinearGradient
            colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
            start={{ x: 0.2, y: 0.1 }}
            end={{ x: 0.8, y: 0.9 }}
            style={[styles.orb, styles.orbTop]}
          />
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.14)']}
            start={{ x: 0.2, y: 0.1 }}
            end={{ x: 0.8, y: 0.9 }}
            style={[styles.orb, styles.orbBottom]}
          />
        </>
      )}
      {dim > 0 && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: palette.dark ? `rgba(0,0,0,${dim})` : `rgba(255,255,255,${dim})` },
          ]}
        />
      )}
    </View>
  );
});

/**
 * Full-screen frosted background for overlays (drawer, control panel, edge panel): the blurred
 * wallpaper picture under a light tint, or a stronger plain tint for the phone wallpaper.
 */
export function PanelBackdrop({ blurTint, solidTint }: { blurTint: string; solidTint: string }) {
  const { settings } = useLook();
  const image = settings.panelBlur ? wallpaperImage(settings) : null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {image ? (
        <Image
          source={image}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          resizeMethod="resize"
          blurRadius={BACKDROP_BLUR}
          fadeDuration={0}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: image ? blurTint : solidTint }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
  },
  orbTop: {
    top: -90,
    right: -110,
  },
  orbBottom: {
    bottom: 80,
    left: -150,
  },
});
