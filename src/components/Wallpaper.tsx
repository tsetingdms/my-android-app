import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { useStore } from '../store';
import { GRADIENTS } from '../theme';

/**
 * Background layer. In "system" mode it stays transparent so the phone's own wallpaper
 * (drawn by Android behind the window) shows through; otherwise draws a gradient.
 */
export function Wallpaper() {
  const { settings, palette } = useStore();
  const gradient = GRADIENTS[settings.wallpaper];
  const dim = settings.dim;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
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
