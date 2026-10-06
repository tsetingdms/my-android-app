import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Launcher from '../../modules/launcher';
import { ClockFace, resolveClockColor } from '../components/ClockFace';
import { useMinuteClock } from '../hooks';
import { KEYS, lastKnownSettings } from '../store';
import { DEFAULT_SETTINGS, GRADIENTS, makePalette, wallpaperImage, type Settings } from '../theme';

/** Root of the "lock" surface hosted by LockScreenActivity (shown over Android's own lock). */
export function LockRoot() {
  return (
    <SafeAreaProvider style={styles.transparent}>
      <LockScreen />
    </SafeAreaProvider>
  );
}

function LockScreen() {
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const now = useMinuteClock();
  // Settings already in memory (the launcher is running) let the first frame be the real lock screen.
  const [settings, setSettings] = useState<Settings | null>(lastKnownSettings);
  const [torch, setTorch] = useState(Launcher.isTorchOn);
  const offset = useRef(new Animated.Value(0)).current;
  const hint = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!lastKnownSettings()) {
      AsyncStorage.getItem(KEYS.settings)
        .then((raw) => setSettings({ ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) }))
        .catch(() => setSettings(DEFAULT_SETTINGS));
    }
    return Launcher.addTorchListener(setTorch);
  }, []);

  // Gentle "swipe up" nudge so it's obvious how to unlock. Three times, then it rests: an endless
  // animation would keep the screen redrawing (and the battery busy) the whole time the lock shows.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(hint, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(hint, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
      { iterations: 3 }
    );
    loop.start();
    return () => loop.stop();
  }, [hint]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => offset.setValue(Math.min(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy < -120 || g.vy < -0.7) {
            Animated.timing(offset, { toValue: -height * 0.4, duration: 180, useNativeDriver: true }).start(() => {
              // Shows the PIN / fingerprint prompt if the phone is secured, then this screen closes.
              Launcher.unlockScreen();
              // If the prompt was cancelled the screen stays: bring the clock back.
              setTimeout(() => {
                Animated.spring(offset, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
              }, 1500);
            });
          } else {
            Animated.spring(offset, { toValue: 0, useNativeDriver: true, bounciness: 8 }).start();
          }
        },
        onPanResponderTerminate: () => Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [offset, height]
  );

  const { fade, hintY } = useMemo(
    () => ({
      fade: offset.interpolate({ inputRange: [-height * 0.4, 0], outputRange: [0, 1], extrapolate: 'clamp' }),
      hintY: hint.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }),
    }),
    [offset, hint, height]
  );

  if (!settings) return <StatusBar style="light" />;

  const dark = settings.theme === 'auto' ? scheme !== 'light' : settings.theme === 'dark';
  const palette = makePalette(dark, settings.glass, settings.accent.startsWith('#') ? settings.accent : '#0A84FF');
  const image = wallpaperImage(settings);
  const gradient = image ? undefined : GRADIENTS[settings.wallpaper];
  const color = resolveClockColor(settings.lockColor, palette);
  const face = settings.lockFace === 'minimal' ? 'large' : settings.lockFace;
  const buttonBg = 'rgba(0,0,0,0.28)';

  return (
    <View style={styles.fill} {...pan.panHandlers}>
      <StatusBar style="light" />
      {image ? (
        <Image
          source={image}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          resizeMethod="resize"
          blurRadius={settings.wallpaperBlur > 0 ? settings.wallpaperBlur : undefined}
          fadeDuration={0}
        />
      ) : gradient ? (
        <LinearGradient colors={gradient.colors} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : null}
      {settings.dim > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${settings.dim})` }]} />}

      <Animated.View style={[styles.fill, { opacity: fade, transform: [{ translateY: offset }] }]}>
        <Animated.View style={[styles.top, { paddingTop: insets.top + 10, transform: [{ translateY: hintY }] }]}>
          <Ionicons name="lock-closed" size={14} color={color} />
          <Text style={[styles.hint, { color }]}>Swipe up to unlock</Text>
        </Animated.View>

        <View style={[styles.clock, face === 'giant' && styles.center]}>
          <ClockFace face={face} color={color} accent={palette.accent} now={now} use24h={settings.clock24h} />
        </View>
      </Animated.View>

      {settings.lockShortcuts && (
        <View style={[styles.shortcuts, { bottom: insets.bottom + 28 }]}>
          <Pressable
            onPress={() => {
              if (Launcher.setTorch(!torch)) setTorch(!torch);
            }}
            style={({ pressed }) => [
              styles.shortcut,
              { backgroundColor: torch ? 'rgba(255,255,255,0.9)' : buttonBg },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="flashlight" size={22} color={torch ? '#111' : '#fff'} />
          </Pressable>
          <Pressable
            onPress={() => Launcher.openCamera()}
            style={({ pressed }) => [styles.shortcut, { backgroundColor: buttonBg }, pressed && styles.pressed]}
          >
            <Ionicons name="camera-outline" size={22} color="#fff" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  transparent: {
    backgroundColor: 'transparent',
  },
  fill: {
    flex: 1,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  hint: {
    fontSize: 13,
    fontFamily: 'sans-serif-medium',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  clock: {
    marginTop: 48,
    paddingHorizontal: 28,
  },
  center: {
    alignItems: 'center',
  },
  shortcuts: {
    position: 'absolute',
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  shortcut: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.9 }],
  },
});
