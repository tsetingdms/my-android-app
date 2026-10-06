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
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Launcher from '../modules/launcher';
import { ActionsSheet, type ActionTarget } from './components/ActionsSheet';
import { AppDrawer } from './components/AppDrawer';
import { useIconLook } from './components/AppIcon';
import { ControlPanel } from './components/ControlPanel';
import { EdgeHandle, EdgePanel } from './components/EdgePanel';
import { DefaultLauncherBanner, Dock, HomeGrid, PageDots, SearchPill } from './components/HomeParts';
import { SettingsSheet } from './components/SettingsSheet';
import { ScreenSizeContext, Wallpaper } from './components/Wallpaper';
import { ClockWidget } from './components/widgets/ClockWidget';
import { GlanceRow } from './components/widgets/GlanceRow';
import { WidgetsPage } from './components/widgets/WidgetsPage';
import type { App } from './store';
import { useActions, useLook } from './store';

const SWIPE = 70;
const CONTROLS_DRAG = 320;

const springTo = (value: Animated.Value, toValue: number) =>
  Animated.spring(value, { toValue, useNativeDriver: true, speed: 20, bounciness: 3 });
const slideTo = (value: Animated.Value, toValue: number, duration = 220) =>
  Animated.timing(value, { toValue, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true });

export function Root() {
  // Look + stable actions only: Root no longer re-renders on app-list / layout / launch-count changes.
  const { ready, settings, palette } = useLook();
  const { launch } = useActions();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const H = Math.max(windowHeight, Dimensions.get('screen').height);
  const look = useIconLook();
  const [screen, setScreen] = useState<{ width: number; height: number } | null>(null);
  // Heavy overlays mount shortly after startup so the first frame stays fast.
  const [overlaysReady, setOverlaysReady] = useState(false);

  // App drawer: y = H hidden below the screen, 0 = fully open.
  const y = useRef(new Animated.Value(H)).current;
  const drawerOpenRef = useRef(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState(false);

  // Control panel: 0 hidden, 1 open.
  const cp = useRef(new Animated.Value(0)).current;
  const cpOpenRef = useRef(false);
  const [cpOpen, setCpOpen] = useState(false);

  // Edge panel: 0 hidden, 1 open.
  const edge = useRef(new Animated.Value(0)).current;
  const edgeOpenRef = useRef(false);
  const [edgeOpen, setEdgeOpen] = useState(false);

  // While anything slides over the home screen, draw the home screen once into a GPU texture and
  // only move that texture (the 3D tilt/scale then costs almost nothing on budget GPUs).
  const [homeLayer, setHomeLayer] = useState(false);
  // Same idea for the panel being opened/closed/dragged (off once settled, so tile animations stay cheap).
  const [panelAnimating, setPanelAnimating] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [target, setTarget] = useState<ActionTarget | null>(null);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const pagerRef = useRef<ScrollView>(null);
  const prefs = useRef({ swipeDown: settings.swipeDown, width });
  prefs.current = { swipeDown: settings.swipeDown, width };

  useEffect(() => {
    const t = setTimeout(() => setOverlaysReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const overlayOpen = () => drawerOpenRef.current || cpOpenRef.current || edgeOpenRef.current;
  const layerOffIfIdle = useCallback(() => {
    if (!overlayOpen()) setHomeLayer(false);
  }, []);
  const panelMoving = useCallback(() => {
    setHomeLayer(true);
    setPanelAnimating(true);
  }, []);
  const panelSettled = useCallback(() => {
    setPanelAnimating(false);
    if (!overlayOpen()) setHomeLayer(false);
  }, []);

  // ---------- Drawer ----------
  const openDrawer = useCallback(
    (search: boolean) => {
      setOverlaysReady(true);
      setFocusSearch(search);
      drawerOpenRef.current = true;
      setDrawerOpen(true);
      setHomeLayer(true);
      springTo(y, 0).start();
    },
    [y]
  );
  const openDrawerSearch = useCallback(() => openDrawer(true), [openDrawer]);
  const openDrawerPlain = useCallback(() => openDrawer(false), [openDrawer]);
  const settleDrawerOpen = useCallback(() => springTo(y, 0).start(), [y]);
  const settleDrawerClosed = useCallback(() => slideTo(y, H, 200).start(layerOffIfIdle), [y, H, layerOffIfIdle]);
  const closeDrawer = useCallback(
    (animated = true) => {
      drawerOpenRef.current = false;
      Keyboard.dismiss();
      if (animated) {
        slideTo(y, H).start(() => {
          if (!drawerOpenRef.current) setDrawerOpen(false);
          layerOffIfIdle();
        });
      } else {
        y.setValue(H);
        setDrawerOpen(false);
        layerOffIfIdle();
      }
    },
    [y, H, layerOffIfIdle]
  );
  const requestCloseDrawer = useCallback(() => closeDrawer(), [closeDrawer]);

  // ---------- Control panel ----------
  const openControls = useCallback(() => {
    setOverlaysReady(true);
    cpOpenRef.current = true;
    setCpOpen(true);
    panelMoving();
    springTo(cp, 1).start(panelSettled);
  }, [cp, panelMoving, panelSettled]);
  const settleControlsOpen = useCallback(() => springTo(cp, 1).start(panelSettled), [cp, panelSettled]);
  const closeControls = useCallback(() => {
    cpOpenRef.current = false;
    panelMoving();
    slideTo(cp, 0, 200).start(() => {
      if (!cpOpenRef.current) setCpOpen(false);
      panelSettled();
    });
  }, [cp, panelMoving, panelSettled]);

  // ---------- Edge panel ----------
  const openEdge = useCallback(() => {
    setOverlaysReady(true);
    edgeOpenRef.current = true;
    setEdgeOpen(true);
    panelMoving();
    springTo(edge, 1).start(panelSettled);
  }, [edge, panelMoving, panelSettled]);
  const settleEdgeOpen = useCallback(() => springTo(edge, 1).start(panelSettled), [edge, panelSettled]);
  const closeEdge = useCallback(
    (animated = true) => {
      edgeOpenRef.current = false;
      if (animated) {
        panelMoving();
        slideTo(edge, 0, 200).start(() => {
          if (!edgeOpenRef.current) setEdgeOpen(false);
          panelSettled();
        });
      } else {
        edge.setValue(0);
        setEdgeOpen(false);
        panelSettled();
      }
    },
    [edge, panelMoving, panelSettled]
  );
  const requestCloseEdge = useCallback(() => closeEdge(), [closeEdge]);
  const edgeToControls = useCallback(() => {
    closeEdge();
    openControls();
  }, [closeEdge, openControls]);
  const edgeToDrawer = useCallback(() => {
    closeEdge();
    openDrawer(false);
  }, [closeEdge, openDrawer]);

  const goToPage = useCallback(
    (p: number) => {
      pagerRef.current?.scrollTo({ x: p * width, animated: true });
      pageRef.current = p;
      setPage(p);
    },
    [width]
  );

  // Home gestures (page 1 only, nothing open): swipe up = drawer (follows the finger);
  // swipe down = control panel or notifications, depending on settings.
  const downMode = useRef<'controls' | 'notifications'>('controls');
  const homePan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          !overlayOpen() && pageRef.current === 0 && Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4,
        onPanResponderGrant: (_, g) => {
          const { swipeDown, width: w } = prefs.current;
          downMode.current =
            swipeDown === 'notifications' || (swipeDown === 'split' && g.x0 < w / 2) ? 'notifications' : 'controls';
          if (g.dy > 0 && downMode.current === 'controls') panelMoving();
          else setHomeLayer(true);
        },
        onPanResponderMove: (_, g) => {
          if (g.dy < 0) {
            cp.setValue(0);
            y.setValue(Math.max(0, H + g.dy * 1.15));
          } else {
            y.setValue(H);
            if (downMode.current === 'controls') cp.setValue(Math.min(1, g.dy / CONTROLS_DRAG));
          }
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy < 0) {
            setPanelAnimating(false);
            if (g.dy < -SWIPE || g.vy < -0.6) openDrawer(false);
            else settleDrawerClosed();
            return;
          }
          if (downMode.current === 'controls') {
            y.setValue(H);
            if (g.dy > SWIPE || g.vy > 0.5) openControls();
            else closeControls();
          } else {
            panelSettled();
            if (g.dy > SWIPE) Launcher.expandNotifications();
          }
        },
        onPanResponderTerminate: () => {
          if (!drawerOpenRef.current) settleDrawerClosed();
          if (!cpOpenRef.current) closeControls();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [y, cp, H, openDrawer, settleDrawerClosed, openControls, closeControls, panelMoving, panelSettled]
  );

  const closeAll = useCallback(() => {
    setSettingsOpen(false);
    setTarget(null);
    if (drawerOpenRef.current) closeDrawer();
    if (cpOpenRef.current) closeControls();
    if (edgeOpenRef.current) closeEdge();
  }, [closeDrawer, closeControls, closeEdge]);

  // Back never leaves the launcher; it just closes whatever is open.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpenRef.current) closeDrawer();
      else if (cpOpenRef.current) closeControls();
      else if (edgeOpenRef.current) closeEdge();
      else if (pageRef.current !== 0) goToPage(0);
      return true;
    });
    return () => sub.remove();
  }, [closeDrawer, closeControls, closeEdge, goToPage]);

  // Home button while the launcher is showing: close everything and return to the main page.
  useEffect(
    () =>
      Launcher.addHomePressedListener(() => {
        const wasOpen = overlayOpen();
        closeAll();
        if (!wasOpen) goToPage(0);
      }),
    [closeAll, goToPage]
  );

  // "More" in the edge panel over another app comes back here with the drawer open.
  useEffect(
    () =>
      Launcher.addOpenRequestListener((what) => {
        if (what === 'drawer') openDrawer(false);
      }),
    [openDrawer]
  );

  const onLaunchHome = useCallback((app: App) => launch(app), [launch]);
  const onLaunchDrawer = useCallback(
    (app: App) => {
      launch(app);
      setTimeout(() => closeDrawer(false), 350);
    },
    [launch, closeDrawer]
  );
  const onLaunchEdge = useCallback(
    (app: App) => {
      launch(app);
      setTimeout(() => closeEdge(false), 350);
    },
    [launch, closeEdge]
  );
  const onLongHome = useCallback((app: App) => setTarget({ app, source: 'home' }), []);
  const onLongDock = useCallback((app: App) => setTarget({ app, source: 'dock' }), []);
  const onLongDrawer = useCallback((app: App) => setTarget({ app, source: 'drawer' }), []);
  const onLongEdge = useCallback((app: App) => setTarget({ app, source: 'edge' }), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeActions = useCallback(() => setTarget(null), []);
  const onRootLayout = useCallback(
    (e: LayoutChangeEvent) => setScreen({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }),
    []
  );

  const onPageScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const p = Math.round(e.nativeEvent.contentOffset.x / width);
      pageRef.current = p;
      setPage(p);
    },
    [width]
  );

  // The home screen recedes behind whatever opens: drawer (fade), control panel (dim + shrink)
  // and edge panel (tilts back in 3D, like the Honor side bar).
  const homeStyle = useMemo(() => {
    const drawerOpacity = y.interpolate({ inputRange: [0, H * 0.7, H], outputRange: [0, 0.6, 1], extrapolate: 'clamp' });
    const drawerScale = y.interpolate({ inputRange: [0, H], outputRange: [0.94, 1], extrapolate: 'clamp' });
    const cpOpacity = cp.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35], extrapolate: 'clamp' });
    const cpScale = cp.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94], extrapolate: 'clamp' });
    const edgeScale = edge.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86], extrapolate: 'clamp' });
    return {
      opacity: Animated.multiply(drawerOpacity, cpOpacity),
      transform: [
        { perspective: 1000 },
        { translateX: edge.interpolate({ inputRange: [0, 1], outputRange: [0, -width * 0.1], extrapolate: 'clamp' }) },
        { rotateY: edge.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '12deg'], extrapolate: 'clamp' }) },
        { scale: Animated.multiply(Animated.multiply(drawerScale, cpScale), edgeScale) },
      ],
    };
  }, [y, cp, edge, H, width]);

  if (!ready) return <StatusBar style="light" />;

  return (
    <ScreenSizeContext.Provider value={screen}>
      <View style={styles.root} onLayout={onRootLayout}>
        <StatusBar style={palette.dark ? 'light' : 'dark'} />
        <Wallpaper />

        <Animated.View
          {...homePan.panHandlers}
          renderToHardwareTextureAndroid={homeLayer}
          style={[styles.root, homeStyle]}
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
            <WidgetsPage width={width} active={page === 1} bottomInset={0} onOpenSettings={openSettings} />
          </ScrollView>

          <View style={{ paddingBottom: insets.bottom + 10, paddingTop: 6 }}>
            <PageDots page={page} count={2} />
            {settings.showSearch && <SearchPill onPress={openDrawerSearch} onOpenDrawer={openDrawerPlain} />}
            <Dock look={look} onPress={onLaunchHome} onLongPress={onLongDock} />
          </View>
        </Animated.View>

        {settings.edgePanel && (
          <EdgeHandle
            progress={edge}
            position={settings.edgeHandle}
            onDragStart={panelMoving}
            onOpen={openEdge}
            onClose={requestCloseEdge}
          />
        )}

        <AppDrawer
          y={y}
          open={drawerOpen}
          focusSearch={focusSearch}
          look={look}
          onLaunch={onLaunchDrawer}
          onLongPressApp={onLongDrawer}
          onOpenSettings={openSettings}
          onRequestClose={requestCloseDrawer}
          onSettle={settleDrawerOpen}
        />

        {overlaysReady && (
          <ControlPanel
            progress={cp}
            open={cpOpen}
            animating={panelAnimating}
            onDragStart={panelMoving}
            onClose={closeControls}
            onSettle={settleControlsOpen}
          />
        )}

        {overlaysReady && settings.edgePanel && (
          <EdgePanel
            progress={edge}
            open={edgeOpen}
            animating={panelAnimating}
            onDragStart={panelMoving}
            onClose={requestCloseEdge}
            onSettle={settleEdgeOpen}
            onLaunch={onLaunchEdge}
            onLongPressApp={onLongEdge}
            onOpenControls={edgeToControls}
            onOpenDrawer={edgeToDrawer}
          />
        )}

        <ActionsSheet target={target} onClose={closeActions} />
        <SettingsSheet visible={settingsOpen} onClose={closeSettings} />
      </View>
    </ScreenSizeContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
