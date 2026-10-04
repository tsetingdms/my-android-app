import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Keyboard,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Launcher from '../modules/launcher';
import { ActionsSheet, type ActionTarget } from './components/ActionsSheet';
import { AppDrawer } from './components/AppDrawer';
import { useIconLook } from './components/AppIcon';
import { DefaultLauncherBanner, Dock, HomeGrid, PageDots, SearchPill } from './components/HomeParts';
import { SettingsSheet } from './components/SettingsSheet';
import { Wallpaper } from './components/Wallpaper';
import { ClockWidget } from './components/widgets/ClockWidget';
import { GlanceRow } from './components/widgets/GlanceRow';
import { WidgetsPage } from './components/widgets/WidgetsPage';
import type { App } from './store';
import { useStore } from './store';

const SWIPE = 70;

export function Root() {
  const { ready, settings, palette, launch } = useStore();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const H = Math.max(windowHeight, Dimensions.get('screen').height);
  const look = useIconLook();

  // Drawer position: H = hidden below the screen, 0 = fully open.
  const y = useRef(new Animated.Value(H)).current;
  const drawerOpenRef = useRef(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [target, setTarget] = useState<ActionTarget | null>(null);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const pagerRef = useRef<ScrollView>(null);
  const swipeDownRef = useRef(settings.swipeDownNotifications);
  swipeDownRef.current = settings.swipeDownNotifications;

  const openDrawer = useCallback(
    (search: boolean) => {
      setFocusSearch(search);
      drawerOpenRef.current = true;
      setDrawerOpen(true);
      Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 2 }).start();
    },
    [y]
  );

  const settleClosed = useCallback(() => {
    Animated.timing(y, { toValue: H, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [y, H]);

  const closeDrawer = useCallback(
    (animated = true) => {
      drawerOpenRef.current = false;
      Keyboard.dismiss();
      if (animated) {
        Animated.timing(y, { toValue: H, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
          if (!drawerOpenRef.current) setDrawerOpen(false);
        });
      } else {
        y.setValue(H);
        setDrawerOpen(false);
      }
    },
    [y, H]
  );

  const goToPage = useCallback(
    (p: number) => {
      pagerRef.current?.scrollTo({ x: p * width, animated: true });
      pageRef.current = p;
      setPage(p);
    },
    [width]
  );

  // Swipe up on the home page opens the drawer (following the finger); swipe down pulls the notification shade.
  const homePan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          !drawerOpenRef.current && pageRef.current === 0 && Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4,
        onPanResponderMove: (_, g) => {
          if (g.dy < 0) y.setValue(Math.max(0, H + g.dy * 1.15));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy < -SWIPE || g.vy < -0.6) {
            openDrawer(false);
            return;
          }
          settleClosed();
          if (g.dy > SWIPE && swipeDownRef.current) Launcher.expandNotifications();
        },
        onPanResponderTerminate: () => {
          if (!drawerOpenRef.current) settleClosed();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [y, H, openDrawer, settleClosed]
  );

  // Drag the drawer's header down to close it.
  const drawerPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 90 || g.vy > 0.6) closeDrawer();
          else Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 2 }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 2 }).start();
        },
      }),
    [y, closeDrawer]
  );

  // Back never leaves the launcher; it just closes whatever is open.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpenRef.current) closeDrawer();
      else if (pageRef.current !== 0) goToPage(0);
      return true;
    });
    return () => sub.remove();
  }, [closeDrawer, goToPage]);

  // Home button while the launcher is showing: return to the main page.
  useEffect(
    () =>
      Launcher.addHomePressedListener(() => {
        setSettingsOpen(false);
        setTarget(null);
        if (drawerOpenRef.current) closeDrawer();
        else goToPage(0);
      }),
    [closeDrawer, goToPage]
  );

  const onLaunchHome = useCallback((app: App) => launch(app), [launch]);
  const onLaunchDrawer = useCallback(
    (app: App) => {
      launch(app);
      setTimeout(() => closeDrawer(false), 350);
    },
    [launch, closeDrawer]
  );
  const onLongHome = useCallback((app: App) => setTarget({ app, source: 'home' }), []);
  const onLongDock = useCallback((app: App) => setTarget({ app, source: 'dock' }), []);
  const onLongDrawer = useCallback((app: App) => setTarget({ app, source: 'drawer' }), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  const onPageScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const p = Math.round(e.nativeEvent.contentOffset.x / width);
      pageRef.current = p;
      setPage(p);
    },
    [width]
  );

  const homeOpacity = useMemo(
    () => y.interpolate({ inputRange: [0, H * 0.7, H], outputRange: [0, 0.6, 1], extrapolate: 'clamp' }),
    [y, H]
  );
  const homeScale = useMemo(
    () => y.interpolate({ inputRange: [0, H], outputRange: [0.94, 1], extrapolate: 'clamp' }),
    [y, H]
  );

  if (!ready) return <StatusBar style="light" />;

  return (
    <View style={styles.root}>
      <StatusBar style={palette.dark ? 'light' : 'dark'} />
      <Wallpaper />

      <Animated.View
        {...homePan.panHandlers}
        style={[styles.root, { opacity: homeOpacity, transform: [{ scale: homeScale }] }]}
      >
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onPageScrollEnd}
          keyboardShouldPersistTaps="handled"
          style={styles.root}
        >
          <Pressable style={{ width }} onLongPress={openSettings} delayLongPress={450}>
            <View style={{ paddingTop: insets.top }}>
              <DefaultLauncherBanner />
              {settings.showClock && <ClockWidget />}
              {settings.showGlance && <GlanceRow />}
            </View>
            <View style={styles.root} />
            <HomeGrid look={look} onPress={onLaunchHome} onLongPress={onLongHome} />
          </Pressable>
          <WidgetsPage width={width} bottomInset={0} onOpenSettings={openSettings} />
        </ScrollView>

        <View style={{ paddingBottom: insets.bottom + 10, paddingTop: 6 }}>
          <PageDots page={page} count={2} />
          {settings.showSearch && <SearchPill onPress={() => openDrawer(true)} onOpenDrawer={() => openDrawer(false)} />}
          <Dock look={look} onPress={onLaunchHome} onLongPress={onLongDock} />
        </View>
      </Animated.View>

      <AppDrawer
        y={y}
        open={drawerOpen}
        focusSearch={focusSearch}
        look={look}
        headerPanHandlers={drawerPan.panHandlers}
        onLaunch={onLaunchDrawer}
        onLongPressApp={onLongDrawer}
        onOpenSettings={openSettings}
      />

      <ActionsSheet target={target} onClose={() => setTarget(null)} />
      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
