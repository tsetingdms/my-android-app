import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import * as Launcher from '../../modules/launcher';
import type { App } from '../store';
import { useStore } from '../store';
import { shapeStyle, type EdgeHandle as HandlePosition } from '../theme';
import { Glass } from './Glass';
import { Tilt } from './Tilt';
import { PanelBackdrop } from './Wallpaper';

export const EDGE_PANEL_WIDTH = 172;
const ITEM_H = 78;
/** Apps shown in the edge panel (plus the "More" button). */
export const EDGE_APP_LIMIT = 7;

const HANDLE_TOP: Record<HandlePosition, number> = { upper: 0.2, middle: 0.4, lower: 0.6 };

type HandleProps = {
  progress: Animated.Value;
  position: HandlePosition;
  onOpen: () => void;
  onClose: () => void;
};

/** The small curved bar on the right edge. Swipe it left (or tap it) to open the edge panel. */
export function EdgeHandle({ progress, position, onOpen, onClose }: HandleProps) {
  const { height } = useWindowDimensions();
  const { palette } = useStore();
  const latest = useRef({ onOpen, onClose });
  latest.current = { onOpen, onClose };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          if (g.dx < 0) progress.setValue(Math.min(1, -g.dx / EDGE_PANEL_WIDTH));
        },
        onPanResponderRelease: (_, g) => {
          const tap = Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6;
          if (tap || g.dx < -40 || g.vx < -0.3) latest.current.onOpen();
          else latest.current.onClose();
        },
        onPanResponderTerminate: () => latest.current.onClose(),
      }),
    [progress]
  );

  return (
    <View {...pan.panHandlers} style={[styles.handleArea, { top: height * HANDLE_TOP[position] }]}>
      <View
        style={[
          styles.handle,
          { backgroundColor: palette.dark ? 'rgba(255,255,255,0.7)' : 'rgba(20,20,24,0.45)' },
        ]}
      />
    </View>
  );
}

type PanelProps = {
  progress: Animated.Value;
  open: boolean;
  onClose: () => void;
  onSettle: () => void;
  onLaunch: (app: App) => void;
  onLongPressApp: (app: App) => void;
  onOpenControls: () => void;
  onOpenDrawer: () => void;
};

/** Glass side panel with tools and favourite apps (all offline). */
export function EdgePanel({
  progress,
  open,
  onClose,
  onSettle,
  onLaunch,
  onLongPressApp,
  onOpenControls,
  onOpenDrawer,
}: PanelProps) {
  const { palette, layout, appsByKey, apps, settings } = useStore();
  const { height } = useWindowDimensions();
  const [torch, setTorch] = useState(false);
  const latest = useRef({ onClose, onSettle });
  latest.current = { onClose, onSettle };

  useEffect(() => {
    if (!open) return;
    setTorch(Launcher.getSystemState().torch);
    return Launcher.addTorchListener(setTorch);
  }, [open]);

  const panelApps = useMemo(() => {
    const pinned = layout.edge.map((k) => appsByKey.get(k)).filter((a): a is App => !!a);
    if (pinned.length) return pinned.slice(0, EDGE_APP_LIMIT);
    const hidden = new Set(layout.hidden);
    const used = apps
      .filter((a) => !hidden.has(a.key) && (layout.launches[a.key] ?? 0) > 0)
      .sort((a, b) => (layout.launches[b.key] ?? 0) - (layout.launches[a.key] ?? 0));
    const home = layout.home.map((k) => appsByKey.get(k)).filter((a): a is App => !!a);
    const merged: App[] = [];
    for (const a of [...used, ...home]) if (!merged.some((m) => m.key === a.key)) merged.push(a);
    return merged.slice(0, EDGE_APP_LIMIT);
  }, [layout, appsByKey, apps]);

  // Swipe right on the panel to put it away.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => progress.setValue(Math.max(0, Math.min(1, 1 - g.dx / EDGE_PANEL_WIDTH))),
        onPanResponderRelease: (_, g) => {
          if (g.dx > 50 || g.vx > 0.3) latest.current.onClose();
          else latest.current.onSettle();
        },
        onPanResponderTerminate: () => latest.current.onSettle(),
      }),
    [progress]
  );

  const { panelStyle, scrimOpacity } = useMemo(
    () => ({
      panelStyle: {
        opacity: progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.8, 1], extrapolate: 'clamp' }),
        transform: [
          { perspective: 800 },
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [EDGE_PANEL_WIDTH + 24, 0],
              extrapolate: 'clamp',
            }),
          },
          { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['-35deg', '0deg'], extrapolate: 'clamp' }) },
        ],
      },
      scrimOpacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    }),
    [progress]
  );
  const iconShape = shapeStyle(settings.iconShape, 46);

  const tools: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean; run: () => void }[] = [
    {
      key: 'torch',
      icon: 'flashlight',
      label: 'Torch',
      active: torch,
      run: () => {
        if (Launcher.setTorch(!torch)) setTorch(!torch);
      },
    },
    { key: 'controls', icon: 'options-outline', label: 'Controls', run: onOpenControls },
    { key: 'camera', icon: 'camera-outline', label: 'Camera', run: () => Launcher.openCamera() },
    { key: 'calc', icon: 'calculator-outline', label: 'Calculator', run: () => Launcher.openCalculator() },
  ];

  return (
    <Animated.View pointerEvents={open ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrimOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        {...pan.panHandlers}
        style={[styles.panel, { top: height * 0.12, bottom: height * 0.1 }, panelStyle]}
      >
        <View style={[StyleSheet.absoluteFill, styles.panelClip]}>
          <PanelBackdrop
            blurTint={palette.dark ? 'rgba(20,20,28,0.35)' : 'rgba(255,255,255,0.45)'}
            solidTint={palette.dark ? 'rgba(28,28,36,0.86)' : 'rgba(250,250,252,0.9)'}
          />
        </View>
        <Glass radius={30} style={styles.panelGlass}>
          <Text style={[styles.section, { color: palette.subtext }]}>Tools</Text>
          <View style={styles.grid}>
            {tools.map((t) => (
              <Pressable key={t.key} onPress={t.run} style={styles.item}>
                <Tilt style={styles.toolTilt} radius={23} max={14} onPress={t.run}>
                  <View style={[styles.tool, { backgroundColor: t.active ? palette.accent : palette.chipBg }]}>
                    <Ionicons name={t.icon} size={22} color={t.active ? '#fff' : palette.text} />
                  </View>
                </Tilt>
                <Text numberOfLines={1} style={[styles.label, { color: palette.text }]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.divider, { backgroundColor: palette.separator }]} />
          <Text style={[styles.section, { color: palette.subtext }]}>Apps</Text>
          <View style={styles.grid}>
            {panelApps.map((app) => (
              <Pressable
                key={app.key}
                onPress={() => onLaunch(app)}
                onLongPress={() => onLongPressApp(app)}
                delayLongPress={350}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              >
                <View style={[styles.appIcon, iconShape]}>
                  {app.icon ? <Image source={{ uri: app.icon }} style={styles.appImage} fadeDuration={0} /> : null}
                </View>
                <Text numberOfLines={1} style={[styles.label, { color: palette.text }]}>
                  {app.label}
                </Text>
              </Pressable>
            ))}
            <Pressable onPress={onOpenDrawer} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <View style={[styles.tool, { backgroundColor: palette.accent }]}>
                <Ionicons name="apps" size={20} color="#fff" />
              </View>
              <Text numberOfLines={1} style={[styles.label, { color: palette.text }]}>
                More
              </Text>
            </Pressable>
          </View>
          {layout.edge.length === 0 && (
            <Text style={[styles.hint, { color: palette.subtext }]}>Long-press any app → Add to edge panel</Text>
          )}
        </Glass>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  handleArea: {
    position: 'absolute',
    right: 0,
    width: 26,
    height: 110,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  handle: {
    width: 5,
    height: 64,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    marginRight: 2,
  },
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  panel: {
    position: 'absolute',
    right: 10,
    width: EDGE_PANEL_WIDTH,
  },
  panelClip: {
    borderRadius: 30,
    overflow: 'hidden',
  },
  panelGlass: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  section: {
    fontSize: 12,
    fontFamily: 'sans-serif-medium',
    marginLeft: 10,
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  item: {
    width: '50%',
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.92 }],
  },
  toolTilt: {
    width: 46,
    height: 46,
  },
  tool: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIcon: {
    width: 46,
    height: 46,
    overflow: 'hidden',
  },
  appImage: {
    width: 46,
    height: 46,
  },
  label: {
    fontSize: 11,
    marginTop: 5,
    maxWidth: 76,
    textAlign: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
    marginVertical: 6,
  },
  hint: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 'auto',
    paddingHorizontal: 8,
  },
});
