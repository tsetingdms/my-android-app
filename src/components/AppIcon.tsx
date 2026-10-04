import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { App } from '../store';
import { useLook } from '../store';
import { shapeStyle, type IconShape } from '../theme';

export type IconLook = {
  shape: IconShape;
  themed: boolean;
  shine: boolean;
  themedBg: string;
  themedFg: string;
};

/** Stable icon styling derived from settings, so memoized icons skip unrelated re-renders. */
export function useIconLook(): IconLook {
  const { settings, palette } = useLook();
  return useMemo(
    () => ({
      shape: settings.iconShape,
      themed: settings.themedIcons,
      shine: settings.iconShine,
      themedBg: palette.themedIconBg,
      themedFg: palette.themedIconFg,
    }),
    [settings.iconShape, settings.themedIcons, settings.iconShine, palette.themedIconBg, palette.themedIconFg]
  );
}

type Props = {
  app: App;
  size: number;
  width: number;
  look: IconLook;
  showLabel: boolean;
  labelColor: string;
  labelShadow?: boolean;
  onPress: (app: App) => void;
  onLongPress: (app: App) => void;
};

export const AppIcon = memo(function AppIcon({
  app,
  size,
  width,
  look,
  showLabel,
  labelColor,
  labelShadow,
  onPress,
  onLongPress,
}: Props) {
  const shape = shapeStyle(look.shape, size);
  const themed = look.themed && app.monoIcon;

  return (
    <Pressable
      onPress={() => onPress(app)}
      onLongPress={() => onLongPress(app)}
      delayLongPress={350}
      style={({ pressed }) => [styles.cell, { width }, pressed && styles.pressed]}
    >
      <View style={[styles.icon, shape, { width: size, height: size }]}>
        {themed ? (
          <View style={[styles.center, { backgroundColor: look.themedBg }]}>
            <Image
              source={{ uri: app.monoIcon! }}
              fadeDuration={0}
              style={{ width: size, height: size, tintColor: look.themedFg }}
            />
          </View>
        ) : app.icon ? (
          <Image source={{ uri: app.icon }} fadeDuration={0} style={{ width: size, height: size }} />
        ) : (
          <View style={[styles.center, styles.placeholder]}>
            <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{app.label.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        {look.shine && (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.12)']}
              locations={[0, 0.4, 0.7, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, styles.rim]} />
          </>
        )}
      </View>
      {showLabel && (
        <Text
          numberOfLines={1}
          style={[styles.label, { color: labelColor, maxWidth: width - 6 }, labelShadow && styles.shadow]}
        >
          {app.label}
        </Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.9 }],
  },
  icon: {
    overflow: 'hidden',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    backgroundColor: '#5E5CE6',
  },
  letter: {
    color: '#fff',
    fontWeight: '600',
  },
  rim: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  shadow: {
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
