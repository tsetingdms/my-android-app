import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useStore } from '../store';

type GlassProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
};

/**
 * "Liquid glass" surface. Real-time blur is too heavy for budget phones, so the effect is
 * built from cheap layers: a translucent tint, a diagonal light sheen, a bright rim and a
 * specular highlight along the top edge.
 */
export function Glass({ children, style, radius = 26 }: GlassProps) {
  const { palette, settings } = useStore();
  const sheen = settings.glass !== 'solid';
  return (
    <View
      style={[
        styles.base,
        { borderRadius: radius, backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
        style,
      ]}
    >
      {sheen && (
        <LinearGradient
          pointerEvents="none"
          colors={palette.glassSheen}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {sheen && (
        <View
          pointerEvents="none"
          style={[
            styles.highlight,
            { left: radius * 0.7, right: radius * 0.7, backgroundColor: palette.glassHighlight },
          ]}
        />
      )}
      {children}
    </View>
  );
}

type GlassButtonProps = GlassProps & {
  onPress?: () => void;
  onLongPress?: () => void;
};

export function GlassButton({ onPress, onLongPress, style, ...rest }: GlassButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [pressed && styles.pressed, style]}
    >
      <Glass {...rest} style={styles.fill} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    borderWidth: 1,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    height: 1,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  fill: {
    flexGrow: 1,
  },
});
