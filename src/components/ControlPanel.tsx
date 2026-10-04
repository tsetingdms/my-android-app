import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Launcher from '../../modules/launcher';
import type { SettingsPanel, SystemState } from '../../modules/launcher';
import { formatTime, MONTHS, useBattery, useMinuteClock, WEEKDAYS } from '../hooks';
import { useStore } from '../store';
import { Glass } from './Glass';
import { Tilt } from './Tilt';
import { PanelBackdrop } from './Wallpaper';
import { batteryIcon } from './widgets/GlanceRow';

type Props = {
  /** 0 = hidden, 1 = fully open. Driven by the home swipe-down gesture. */
  progress: Animated.Value;
  open: boolean;
  onClose: () => void;
  onSettle: () => void;
};

const PAD = 16;
const GAP = 12;
type Icon = keyof typeof Ionicons.glyphMap;

/** Honor/HyperOS-style control centre: frosted tiles that tilt toward the finger. */
export function ControlPanel({ progress, open, onClose, onSettle }: Props) {
  const { palette, settings } = useStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const now = useMinuteClock();
  const battery = useBattery();
  const [state, setState] = useState<SystemState>(() => Launcher.getSystemState());
  const [needsAccess, setNeedsAccess] = useState<null | 'brightness' | 'rotation'>(null);
  const unit = Math.floor((width - PAD * 2 - GAP * 3) / 4);
  const wide = unit * 2 + GAP;

  const refresh = useCallback(() => setState(Launcher.getSystemState()), []);

  useEffect(() => {
    if (!open) {
      setNeedsAccess(null);
      return;
    }
    refresh();
    const id = setInterval(refresh, 2000);
    const offTorch = Launcher.addTorchListener(refresh);
    return () => {
      clearInterval(id);
      offTorch();
    };
  }, [open, refresh]);

  // Swipe up anywhere on the panel to put it away (sliders keep their own drags).
  const latest = useRef({ onClose, onSettle });
  latest.current = { onClose, onSettle };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy < -10 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => progress.setValue(Math.max(0, Math.min(1, 1 + g.dy / 320))),
        onPanResponderRelease: (_, g) => {
          if (g.dy < -60 || g.vy < -0.5) latest.current.onClose();
          else latest.current.onSettle();
        },
        onPanResponderTerminate: () => latest.current.onSettle(),
      }),
    [progress]
  );

  const { backdropOpacity, contentStyle } = useMemo(
    () => ({
      backdropOpacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
      contentStyle: {
        opacity: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.7, 1], extrapolate: 'clamp' }),
        transform: [
          { perspective: 900 },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-70, 0], extrapolate: 'clamp' }) },
          { rotateX: progress.interpolate({ inputRange: [0, 1], outputRange: ['14deg', '0deg'], extrapolate: 'clamp' }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1], extrapolate: 'clamp' }) },
        ],
      },
    }),
    [progress]
  );

  const openPanel = (panel: SettingsPanel) => {
    Launcher.openSettingsPanel(panel);
  };
  const toggleTorch = () => {
    Launcher.setTorch(!state.torch);
    setTimeout(refresh, 150);
  };
  const cycleSound = () => setState((s) => ({ ...s, ringer: Launcher.cycleRinger() }));
  const toggleRotation = () => {
    if (!state.canWriteSettings) {
      setNeedsAccess('rotation');
      return;
    }
    Launcher.setAutoRotate(!state.autoRotate);
    setTimeout(refresh, 150);
  };
  const media = (action: Launcher.MediaAction) => {
    Launcher.mediaKey(action);
    setTimeout(refresh, 600);
  };

  const { hours, minutes, suffix } = formatTime(now, settings.clock24h);
  const onTile = palette.dark ? '#FFFFFF' : '#1C1C1E';
  const soundIcon: Icon =
    state.ringer === 'silent' ? 'notifications-off-outline' : state.ringer === 'vibrate' ? 'phone-portrait-outline' : 'notifications-outline';

  return (
    <Animated.View pointerEvents={open ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
        <PanelBackdrop
          blurTint={palette.dark ? 'rgba(8,8,14,0.4)' : 'rgba(236,238,244,0.4)'}
          solidTint={palette.dark ? 'rgba(10,10,14,0.9)' : 'rgba(238,240,246,0.92)'}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        {...pan.panHandlers}
        style={[styles.content, { paddingTop: insets.top + 14, paddingHorizontal: PAD }, contentStyle]}
      >
        {/* Header: time, date, battery and system settings */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.time, { color: palette.text }]}>
              {hours}:{minutes}
              {suffix ? <Text style={styles.suffix}> {suffix}</Text> : null}
            </Text>
            <Text style={[styles.date, { color: palette.subtext }]}>
              {WEEKDAYS[now.getDay()]}, {MONTHS[now.getMonth()]} {now.getDate()}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.battery}>
              <Ionicons name={batteryIcon(battery.level, battery.charging)} size={18} color={palette.text} />
              <Text style={[styles.batteryText, { color: palette.text }]}>
                {battery.level >= 0 ? `${battery.level}%` : ''}
              </Text>
            </View>
            <Pressable hitSlop={10} onPress={() => openPanel('settings')} style={[styles.roundSmall, { backgroundColor: palette.chipBg }]}>
              <Ionicons name="settings-outline" size={18} color={palette.text} />
            </Pressable>
          </View>
        </View>

        {needsAccess && (
          <Glass radius={20} style={styles.access}>
            <Ionicons name="key-outline" size={18} color={palette.accent} />
            <Text style={[styles.accessText, { color: palette.text }]}>
              {needsAccess === 'brightness'
                ? 'Allow Lumo to change brightness'
                : 'Allow Lumo to change auto-rotate'}
            </Text>
            <Pressable
              onPress={() => {
                Launcher.requestWriteSettings();
                setNeedsAccess(null);
              }}
              style={[styles.accessButton, { backgroundColor: palette.accent }]}
            >
              <Text style={styles.accessButtonText}>Allow</Text>
            </Pressable>
          </Glass>
        )}

        {/* Connectivity */}
        <View style={styles.row}>
          <WideTile
            width={wide}
            height={unit}
            icon="wifi"
            title="Wi‑Fi"
            status={state.wifi == null ? 'Tap to open' : state.wifi ? 'On' : 'Off'}
            active={state.wifi === true}
            onPress={() => openPanel('wifi')}
          />
          <WideTile
            width={wide}
            height={unit}
            icon="cellular"
            title="Mobile data"
            status={state.mobileData ? 'Connected' : 'Tap to open'}
            active={state.mobileData === true}
            onPress={() => openPanel('internet')}
          />
        </View>

        {/* Music + sliders */}
        <View style={styles.row}>
          <Tilt style={{ width: wide, height: wide }} radius={26} max={7}>
            <Glass radius={26} style={styles.media}>
              <View style={styles.mediaTop}>
                <LinearGradient colors={[palette.accent, '#BF5AF2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover}>
                  <Ionicons name="musical-notes" size={24} color="#fff" />
                </LinearGradient>
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={[styles.mediaTitle, { color: palette.text }]}>
                    Music
                  </Text>
                  <Text numberOfLines={1} style={[styles.mediaSub, { color: palette.subtext }]}>
                    {state.musicActive ? 'Playing' : 'Not playing'}
                  </Text>
                </View>
              </View>
              <View style={styles.mediaControls}>
                <Pressable hitSlop={8} onPress={() => media('previous')}>
                  <Ionicons name="play-skip-back" size={22} color={palette.text} />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => media('play_pause')}>
                  <Ionicons name={state.musicActive ? 'pause' : 'play'} size={30} color={palette.text} />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => media('next')}>
                  <Ionicons name="play-skip-forward" size={22} color={palette.text} />
                </Pressable>
              </View>
            </Glass>
          </Tilt>
          <PillSlider
            width={unit}
            height={wide}
            icon="sunny"
            value={state.brightness}
            blocked={!state.canWriteSettings}
            onBlocked={() => setNeedsAccess('brightness')}
            onChange={(v) => Launcher.setBrightness(v)}
          />
          <PillSlider
            width={unit}
            height={wide}
            icon="volume-medium"
            value={state.volume}
            onChange={(v) => Launcher.setVolume(v)}
          />
        </View>

        {/* Toggles */}
        <View style={styles.row}>
          <RoundTile size={unit} icon="flashlight" label="Torch" active={state.torch} onPress={toggleTorch} />
          <RoundTile
            size={unit}
            icon={soundIcon}
            label={state.ringer === 'normal' ? 'Sound' : state.ringer === 'vibrate' ? 'Vibrate' : 'Silent'}
            active={state.ringer !== 'normal'}
            onPress={cycleSound}
          />
          <RoundTile size={unit} icon="sync-outline" label="Rotate" active={state.autoRotate} onPress={toggleRotation} />
          <RoundTile
            size={unit}
            icon="bluetooth"
            label="Bluetooth"
            active={state.bluetooth === true}
            onPress={() => openPanel('bluetooth')}
          />
        </View>
        <View style={styles.row}>
          <RoundTile
            size={unit}
            icon="location-outline"
            label="Location"
            active={state.location === true}
            onPress={() => openPanel('location')}
          />
          <RoundTile
            size={unit}
            icon="airplane-outline"
            label="Airplane"
            active={state.airplane}
            onPress={() => openPanel('airplane')}
          />
          <RoundTile size={unit} icon="calculator-outline" label="Calculator" onPress={Launcher.openCalculator} />
          <RoundTile size={unit} icon="camera-outline" label="Camera" onPress={Launcher.openCamera} />
        </View>

        <Tilt style={styles.notifications} radius={22} max={5} onPress={Launcher.expandNotifications}>
          <Glass radius={22} style={styles.notificationsInner}>
            <Ionicons name="notifications-outline" size={18} color={onTile} />
            <Text style={[styles.notificationsText, { color: onTile }]}>Notifications</Text>
            <Ionicons name="chevron-down" size={16} color={palette.subtext} />
          </Glass>
        </Tilt>
      </Animated.View>
    </Animated.View>
  );
}

function WideTile({
  width,
  height,
  icon,
  title,
  status,
  active,
  onPress,
}: {
  width: number;
  height: number;
  icon: Icon;
  title: string;
  status: string;
  active: boolean;
  onPress: () => void;
}) {
  const { palette } = useStore();
  return (
    <Tilt style={{ width, height }} radius={24} max={8} onPress={onPress}>
      <Glass radius={24} style={styles.wide}>
        {active && <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.accent }]} />}
        <View style={[styles.wideIcon, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : palette.chipBg }]}>
          <Ionicons name={icon} size={20} color={active ? '#fff' : palette.text} />
        </View>
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[styles.wideTitle, { color: active ? '#fff' : palette.text }]}>
            {title}
          </Text>
          <Text numberOfLines={1} style={[styles.wideStatus, { color: active ? 'rgba(255,255,255,0.85)' : palette.subtext }]}>
            {status}
          </Text>
        </View>
      </Glass>
    </Tilt>
  );
}

function RoundTile({
  size,
  icon,
  label,
  active,
  onPress,
}: {
  size: number;
  icon: Icon;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const { palette } = useStore();
  const d = Math.round(size * 0.8);
  return (
    <View style={{ width: size, alignItems: 'center' }}>
      <Tilt style={{ width: d, height: d }} radius={d / 2} max={14} onPress={onPress}>
        <Glass radius={d / 2} style={styles.round}>
          {active && <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.accent }]} />}
          <Ionicons name={icon} size={22} color={active ? '#fff' : palette.text} />
        </Glass>
      </Tilt>
      <Text numberOfLines={1} style={[styles.roundLabel, { color: palette.subtext }]}>
        {label}
      </Text>
    </View>
  );
}

/** Tall pill slider like the Honor control centre; drag up/down anywhere on it. */
function PillSlider({
  width,
  height,
  icon,
  value,
  blocked,
  onBlocked,
  onChange,
}: {
  width: number;
  height: number;
  icon: Icon;
  value: number;
  blocked?: boolean;
  onBlocked?: () => void;
  onChange: (value: number) => void;
}) {
  const { palette } = useStore();
  const anim = useRef(new Animated.Value(value)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const current = useRef(value);
  const start = useRef(value);
  const dragging = useRef(false);
  const lastSent = useRef(0);
  const [shown, setShown] = useState(value);
  const latest = useRef({ blocked, onBlocked, onChange, height });
  latest.current = { blocked, onBlocked, onChange, height };

  useEffect(() => {
    if (dragging.current) return;
    current.current = value;
    anim.setValue(value);
    setShown(value);
  }, [value, anim]);

  const pan = useMemo(() => {
    const end = () => {
      if (!dragging.current) return;
      dragging.current = false;
      latest.current.onChange(current.current);
      setShown(current.current);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 10 }).start();
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        if (latest.current.blocked) {
          latest.current.onBlocked?.();
          return;
        }
        dragging.current = true;
        start.current = current.current;
        Animated.spring(scale, { toValue: 1.05, useNativeDriver: true, speed: 30, bounciness: 8 }).start();
      },
      onPanResponderMove: (_, g) => {
        if (!dragging.current) return;
        const next = Math.max(0, Math.min(1, start.current - g.dy / latest.current.height));
        current.current = next;
        anim.setValue(next);
        const t = Date.now();
        if (t - lastSent.current > 60) {
          lastSent.current = t;
          latest.current.onChange(next);
        }
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
  }, [anim, scale]);

  const radius = Math.min(width / 2.2, 30);
  const fill = palette.dark ? 'rgba(255,255,255,0.92)' : '#FFFFFF';
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [height, 0], extrapolate: 'clamp' });

  return (
    <Animated.View
      {...pan.panHandlers}
      style={{ width, height, borderRadius: radius, overflow: 'hidden', transform: [{ scale }] }}
    >
      <Glass radius={radius} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: fill, transform: [{ translateY }] }]} />
      <View pointerEvents="none" style={styles.pillIcon}>
        <Ionicons name={icon} size={22} color={shown > 0.12 ? '#1C1C1E' : palette.text} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: GAP + 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  time: {
    fontSize: 44,
    fontFamily: 'sans-serif-light',
    includeFontPadding: false,
  },
  suffix: {
    fontSize: 16,
  },
  date: {
    fontSize: 14,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 4,
  },
  battery: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  batteryText: {
    fontSize: 14,
    fontFamily: 'sans-serif-medium',
  },
  roundSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  access: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  accessText: {
    flex: 1,
    fontSize: 13,
  },
  accessButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
  },
  accessButtonText: {
    color: '#fff',
    fontFamily: 'sans-serif-medium',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  wide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  wideIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wideTitle: {
    fontSize: 14,
    fontFamily: 'sans-serif-medium',
  },
  wideStatus: {
    fontSize: 12,
    marginTop: 1,
  },
  media: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  mediaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaTitle: {
    fontSize: 16,
    fontFamily: 'sans-serif-medium',
  },
  mediaSub: {
    fontSize: 12,
    marginTop: 2,
  },
  mediaControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  round: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundLabel: {
    fontSize: 11,
    marginTop: 5,
  },
  pillIcon: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: 'center',
  },
  notifications: {
    height: 48,
  },
  notificationsInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  notificationsText: {
    fontSize: 15,
    fontFamily: 'sans-serif-medium',
  },
});
