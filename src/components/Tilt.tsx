import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Maximum tilt in degrees. */
  max?: number;
  radius?: number;
};

const spring = (value: Animated.Value, toValue: number, bounciness = 6) =>
  Animated.spring(value, { toValue, useNativeDriver: true, speed: 40, bounciness });

/**
 * Press feedback like the Honor control centre: the tile tilts in 3D toward the finger,
 * shrinks a little and glows, then springs back. Native-driver animations, so it stays smooth.
 */
export function Tilt({ children, style, onPress, onLongPress, max = 10, radius = 24 }: Props) {
  const rx = useRef(new Animated.Value(0)).current;
  const ry = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const size = useRef({ w: 1, h: 1 });

  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) };
  };

  const pressIn = (e: GestureResponderEvent) => {
    const dx = Math.max(-1, Math.min(1, (e.nativeEvent.locationX / size.current.w - 0.5) * 2));
    const dy = Math.max(-1, Math.min(1, (e.nativeEvent.locationY / size.current.h - 0.5) * 2));
    // The pressed side sinks into the screen.
    Animated.parallel([
      spring(ry, dx * max),
      spring(rx, -dy * max),
      spring(scale, 0.95),
      Animated.timing(glow, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  const pressOut = () => {
    Animated.parallel([
      spring(ry, 0, 12),
      spring(rx, 0, 12),
      spring(scale, 1, 12),
      Animated.timing(glow, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onLayout={onLayout}
      style={style}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            transform: [
              { perspective: 700 },
              { rotateX: rx.interpolate({ inputRange: [-45, 45], outputRange: ['-45deg', '45deg'] }) },
              { rotateY: ry.interpolate({ inputRange: [-45, 45], outputRange: ['-45deg', '45deg'] }) },
              { scale },
            ],
          },
        ]}
      >
        {children}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.glow, { borderRadius: radius, opacity: glow }]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  glow: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
});
