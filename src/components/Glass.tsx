import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useLook } from '../store';
import { wallpaperImage } from '../theme';
import { BACKDROP_BLUR, useScreenSize } from './Wallpaper';

type GlassProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /**
   * Real frosted glass over picture wallpapers: shows a blurred copy of the wallpaper lined up
   * behind the card. Only for cards that don't scroll (dock, search, home cards).
   */
  frosted?: boolean;
  /** Light reflection along the straight top edge; turn off for circles and narrow pills. */
  highlight?: boolean;
};

/**
 * "Liquid glass" surface. Real-time blur is too heavy for budget phones, so the effect is
 * built from cheap layers: a translucent tint, a diagonal light sheen, a bright rim and a
 * specular highlight along the top edge — plus, over picture wallpapers, a pre-blurred backdrop.
 */
export function Glass({ children, style, radius = 26, frosted, highlight = true }: GlassProps) {
  const { palette, settings } = useLook();
  const screen = useScreenSize();
  const sheen = settings.glass !== 'solid';
  const backdrop = frosted && sheen && settings.panelBlur && screen ? wallpaperImage(settings) : null;
  const ref = useRef<View>(null);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);

  const measure = useCallback(() => {
    if (!backdrop) return;
    ref.current?.measureInWindow((x, y) => {
      setOffset((o) => (o && Math.abs(o.x - x) < 1 && Math.abs(o.y - y) < 1 ? o : { x, y }));
    });
  }, [backdrop]);

  return (
    <View
      ref={ref}
      onLayout={backdrop ? measure : undefined}
      style={[
        styles.base,
        {
          borderRadius: radius,
          backgroundColor: backdrop && offset ? undefined : palette.glassBg,
          borderColor: palette.glassBorder,
        },
        style,
      ]}
    >
      {backdrop && offset && screen ? (
        <>
          <Image
            source={backdrop}
            blurRadius={BACKDROP_BLUR}
            resizeMode="cover"
            resizeMethod="resize"
            fadeDuration={0}
            style={{ position: 'absolute', left: -offset.x, top: -offset.y, width: screen.width, height: screen.height }}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: palette.glassBg }]} />
        </>
      ) : null}
      {sheen && (
        <LinearGradient
          pointerEvents="none"
          colors={palette.glassSheen}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {sheen && highlight && settings.glassEdge && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0)', palette.glassHighlight, 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.highlight, { left: radius, right: radius }]}
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
    opacity: 0.8,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  fill: {
    flexGrow: 1,
  },
});
